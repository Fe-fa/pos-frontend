import { X, Edit, Trash2, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { categoryService } from '../../services/categoryService';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';


const initialForm = { category_name: '' };
const SEARCH_DEBOUNCE_MS = 300;

export default function AdminCategoriesPage() {
  const { storeId } = useStore();
  const { can } = useAuth();

  const canManage = can('categories.manage'); 
  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [page, setPage] = useState(1);

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [perPage, setPerPage] = useState(3);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const loadCategories = async () => {
    if (!storeId) {
      setCategories([]);
      setMeta({ ...EMPTY_META });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await categoryService.list({
        store_id: Number(storeId),
        search: debouncedSearch || undefined,
        page,
        per_page: perPage,
      });

      const parsed = extractPaginated(response, perPage);
      setCategories(parsed.data);
      setMeta(parsed.meta);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load categories.');
      setCategories([]);
      setMeta({ ...EMPTY_META });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCategories([]);
    setMeta({ ...EMPTY_META });
    setSearch('');
    setShowModal(false);
    setEditingId(null);
    setForm(initialForm);
    setError('');
    setPage(1);
    if (!storeId) setLoading(false);
  }, [storeId]);

  useEffect(() => {
    loadCategories();
  }, [storeId, debouncedSearch, page, perPage]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
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
        await loadCategories();
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
  };

  const handleEdit = (category) => {
    if (!canManage) return;
    setEditingId(category.category_id);
    setForm({ category_name: category.category_name || '' });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (categoryId) => {
    if (!canManage) return;
    if (!window.confirm('Delete this category?')) return;

    try {
      await categoryService.remove(categoryId);

      if (categories.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadCategories();
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to delete category.');
    }
  };

  return (
    <>
      <section className="stack-lg">
        <div className="catalog-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="catalog-hero-copy">
            <h3 className="catalog-title">Categories</h3>
            <p className="catalog-subtitle">
              Showing {meta.from}-{meta.to} of {meta.total}
            </p>
          </div>

          {/* Only show New Category button if user can manage */}
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
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
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              disabled={!storeId}
              style={{ width: 'auto', paddingRight: 28, appearance: 'none' }}
            >
              {[3, 5, 10, 25, 50].map(n => (
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
                  {/* Only show Actions column if user can manage */}
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {!storeId ? (
                  <tr><td colSpan={canManage ? 3 : 2}>Select a store first.</td></tr>
                ) : loading ? (
                  <tr><td colSpan={canManage ? 3 : 2}>Loading...</td></tr>
                ) : categories.length ? (
                  categories.map((category) => (
                    <tr key={category.category_id}>
                      <td>{category.category_name}</td>
                      <td>{category.products_count || 0}</td>
                      {canManage && (
                        <td>
                          <div className="row-actions compact">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleEdit(category)}
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              className="ghost-button danger"
                              onClick={() => handleDelete(category.category_id)}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={canManage ? 3 : 2}>No categories found.</td></tr>
                )}
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
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={!meta.has_prev_page || loading}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost-button pagination-btn"
                  onClick={() => setPage((prev) => Math.min(prev + 1, meta.last_page))}
                  disabled={!meta.has_next_page || loading}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>

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