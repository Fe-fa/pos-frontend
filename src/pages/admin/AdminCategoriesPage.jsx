import { X, Edit, Trash2, ChevronDown, Loader2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { categoryService } from '../../services/categoryService';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';

const initialForm = { category_name: '' };
const SEARCH_DEBOUNCE_MS = 300;

const PER_PAGE_OPTIONS = [3, 5, 10, 25, 50];

const CategoryRow = memo(function CategoryRow({ category, canManage, onEdit, onDelete }) {
  return (
    <tr>
      <td>{category.category_name}</td>
      <td>{category.products_count || 0}</td>
      {canManage && (
        <td>
          <div className="row-actions compact">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onEdit(category)}
              title="Edit"
            >
              <Edit size={16} />
            </button>
            <button
              type="button"
              className="ghost-button danger"
              onClick={() => onDelete(category.category_id)}
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
});

export default function AdminCategoriesPage() {
  const { storeId } = useStore();
  const { can } = useAuth();

  const canManage = can('categories.manage');

  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(undefined);
  const [effectivePerPage, setEffectivePerPage] = useState(undefined);

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const prevStoreIdRef = useRef(storeId);
  const pendingParamsRef = useRef(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const runLoad = useCallback(async ({ storeId: targetStoreId, page: targetPage, search: targetSearch, perPage: targetPerPage }) => {
    if (!targetStoreId) {
      setCategories([]);
      setMeta({ ...EMPTY_META });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await categoryService.list({
        store_id: Number(targetStoreId),
        search: targetSearch || undefined,
        page: targetPage,
        // Only send per_page once the user has explicitly chosen one.
        // Otherwise omit it entirely so the backend's own default applies.
        ...(targetPerPage != null ? { per_page: targetPerPage } : {}),
      });

      // extractPaginated's second arg is just a fallback for malformed
      // responses, not the value we want to govern requests, so reuse
      // targetPerPage (which may be undefined) rather than a hardcoded const.
      const parsed = extractPaginated(response, targetPerPage);
      setCategories(parsed.data);
      setMeta(parsed.meta);

      // Learn the real per-page in effect from the server's own meta,
      // independent of whatever the user picked, so the dropdown always
      // reflects what was actually applied.
      if (parsed.meta?.per_page != null) {
        setEffectivePerPage(parsed.meta.per_page);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load categories.');
      setCategories([]);
      setMeta({ ...EMPTY_META });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async (params = {}) => {
    const callParams = {
      storeId: params.storeId ?? storeId,
      page: params.page ?? page,
      search: params.search ?? debouncedSearch,
      perPage: 'perPage' in params ? params.perPage : perPage,
    };

    if (inFlightRef.current) {
      pendingParamsRef.current = callParams;
      return;
    }

    inFlightRef.current = true;
    let current = callParams;

    while (current) {
      // eslint-disable-next-line no-await-in-loop
      await runLoad(current);
      if (pendingParamsRef.current) {
        current = pendingParamsRef.current;
        pendingParamsRef.current = null;
      } else {
        current = null;
      }
    }

    inFlightRef.current = false;
  }, [storeId, page, debouncedSearch, perPage, runLoad]);

  // Single source of truth for fetching. Runs whenever storeId,
  // debouncedSearch, page, or perPage change. perPage only changes here
  // when the user explicitly picks a value (see handlePerPageChange) —
  // the backend-learned `effectivePerPage` is deliberately NOT a
  // dependency, so syncing the dropdown after a response never causes
  // a second, redundant fetch.
  useEffect(() => {
    const storeChanged = prevStoreIdRef.current !== storeId;
    prevStoreIdRef.current = storeId;

    if (storeChanged) {
      setCategories([]);
      setMeta({ ...EMPTY_META });
      setShowModal(false);
      setEditingId(null);
      setForm(initialForm);
      setError('');

      // Let the new store's load pick up the backend default again,
      // rather than carrying over a per_page chosen for the old store.
      if (search !== '' || debouncedSearch !== '' || page !== 1 || perPage !== undefined) {
        setSearch('');
        setDebouncedSearch('');
        setPage(1);
        setPerPage(undefined);
        setEffectivePerPage(undefined);
        return;
      }

      if (!storeId) setLoading(false);
    }

    loadCategories({ storeId, page, search: debouncedSearch, perPage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, debouncedSearch, page, perPage]);

  const resetForm = useCallback(() => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setShowModal(true);
  }, [resetForm]);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setShowModal(false);
    resetForm();
  }, [submitting, resetForm]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!canManage) return;
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        store_id: Number(storeId),
        category_name: form.category_name,
      };

      if (editingId) {
        await categoryService.update(editingId, payload);
      } else {
        await categoryService.create(payload);
      }

      setShowModal(false);
      resetForm();

      if (!editingId) {
        setPage(1);
      } else {
        await loadCategories({ storeId, page, search: debouncedSearch, perPage });
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.errors?.category_name?.[0] ||
          'Unable to save category.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [canManage, storeId, form, editingId, page, debouncedSearch, perPage, loadCategories, resetForm]);

  const handleEdit = useCallback((category) => {
    if (!canManage) return;
    setEditingId(category.category_id);
    setForm({ category_name: category.category_name || '' });
    setError('');
    setShowModal(true);
  }, [canManage]);

  const handleDelete = useCallback(async (categoryId) => {
    if (!canManage) return;
    if (!window.confirm('Delete this category?')) return;

    try {
      await categoryService.remove(categoryId);

      if (categories.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadCategories({ storeId, page, search: debouncedSearch, perPage });
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to delete category.');
    }
  }, [canManage, categories.length, page, storeId, debouncedSearch, perPage, loadCategories]);

  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const handlePerPageChange = useCallback((e) => {
    const value = Number(e.target.value);
    setPerPage(value);
    setEffectivePerPage(value);
    setPage(1);
  }, []);

  const goToPreviousPage = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, meta.last_page));
  }, [meta.last_page]);

  const colSpan = useMemo(() => (canManage ? 3 : 2), [canManage]);

  // Whatever is currently in effect (user choice, or backend-learned
  // default once known), for the dropdown's value.
  const displayedPerPage = effectivePerPage ?? meta.per_page ?? '';

  // Ensure the dropdown always has an option matching the current value,
  // even if it isn't one of the hardcoded common choices (e.g. backend
  // default of 6 isn't in PER_PAGE_OPTIONS).
  const perPageOptions = useMemo(() => {
    const opts = new Set(PER_PAGE_OPTIONS);
    if (displayedPerPage !== '') opts.add(Number(displayedPerPage));
    return Array.from(opts).sort((a, b) => a - b);
  }, [displayedPerPage]);

  return (
    <>
      <style>{`
        @keyframes categories-spin { to { transform: rotate(360deg); } }
        .spin-icon { animation: categories-spin 0.8s linear infinite; }
        .categories-page-wrapper { position: relative; }
        .categories-loading-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.55);
          z-index: 20;
          border-radius: 12px;
          pointer-events: none;
        }
      `}</style>

      <div className="categories-page-wrapper">
        {loading ? (
          <div className="categories-loading-overlay">
            <Loader2 size={32} className="spin-icon" />
          </div>
        ) : null}

        <section className="stack-lg">
          <div className="catalog-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div className="catalog-hero-copy">
              <h3 className="catalog-title">Categories</h3>
              <p className="catalog-subtitle">
                Showing {meta.from}-{meta.to} of {meta.total}
              </p>
            </div>

            {canManage && (
              <button
                type="button"
                className="ghost-button"
                onClick={openCreateModal}
                style={{ whiteSpace: 'nowrap' }}
                disabled={!storeId}
              >
                New category
              </button>
            )}
          </div>

          <div className="catalog-toolbar">
            <label className="catalog-search">
              <input
                className="text-input"
                placeholder="Search category"
                value={search}
                onChange={handleSearchChange}
                disabled={!storeId}
              />
            </label>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute',
                  right: 8,
                  pointerEvents: 'none',
                  color: 'var(--color-text-secondary)',
                }}
              />
              <select
                className="text-input"
                value={displayedPerPage}
                onChange={handlePerPageChange}
                disabled={!storeId}
                style={{ width: 'auto', paddingRight: 28, appearance: 'none' }}
              >
                {perPageOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
          </div>

          {error && !showModal ? <p className="form-error">{error}</p> : null}

          <article className="catalog-table-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Products</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {!storeId ? (
                    <tr><td colSpan={colSpan}>Select a store first.</td></tr>
                  ) : categories.length ? (
                    categories.map((category) => (
                      <CategoryRow
                        key={category.category_id}
                        category={category}
                        canManage={canManage}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))
                  ) : !loading ? (
                    <tr><td colSpan={colSpan}>No categories found.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {storeId ? (
              <div className="pagination-bar">
                <div className="pagination-summary">
                  Page <strong>{meta.current_page}</strong> of <strong>{meta.last_page}</strong>
                </div>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="ghost-button pagination-btn"
                    onClick={goToPreviousPage}
                    disabled={!meta.has_prev_page || loading}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="ghost-button pagination-btn"
                    onClick={goToNextPage}
                    disabled={!meta.has_next_page || loading}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        </section>
      </div>

      {showModal && canManage ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingId ? 'Edit category' : 'New category'}</h3>
                <p className="muted">Create or update your product categories.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeModal} disabled={submitting}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <form className="catalog-form-grid" onSubmit={handleSubmit}>
                <label className="span-2">
                  Category name
                  <input
                    className="text-input"
                    value={form.category_name}
                    onChange={(e) => setForm({ category_name: e.target.value })}
                    required
                  />
                </label>

                {error ? <p className="form-error span-2">{error}</p> : null}

                <div className="catalog-modal-actions span-2">
                  <button type="button" className="ghost-button" onClick={closeModal} disabled={submitting}>
                    Cancel
                  </button>
                  <button className="catalog-primary-btn" type="submit" disabled={submitting}>
                    {editingId ? 'Update category' : 'Create category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}