import {
  X,
  Edit,
  Trash2,
  ChevronDown,
  Loader2,
  Search,
  Plus,
  Package,
  AlertCircle,
  PieChart,
  Download,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { categoryService } from '../../services/categoryService';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';

const initialForm = { category_name: '' };
const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE_OPTIONS = [3, 5, 10, 25, 50];

function getCategoryEmoji(categoryName = '') {
  const name = categoryName.toLowerCase();

  if (name.includes('beverage') || name.includes('drink') || name.includes('juice')) return '🥤';
  if (name.includes('coffee') || name.includes('tea')) return '☕';
  if (name.includes('bakery') || name.includes('bread') || name.includes('deli')) return '🥐';
  if (name.includes('fruit')) return '🍎';
  if (name.includes('frozen')) return '🧊';
  if (name.includes('vegetable')) return '🥬';
  if (name.includes('meat')) return '🥩';
  if (name.includes('snack')) return '🍪';
  if (name.includes('dairy')) return '🥛';
  return '📦';
}

function toCsvValue(value) {
  const safe = value == null ? '' : String(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

const CategoryRow = memo(function CategoryRow({
  category,
  canManage,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
}) {
  const productsCount = Number(category.products_count || 0);
  const isEmpty = productsCount === 0;

  return (
    <tr>
      <td style={{ width: 44 }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(category.category_id)}
          aria-label={`Select ${category.category_name}`}
        />
      </td>

      <td style={{ width: 64 }}>
        <div className="categories-v2-icon-cell" aria-hidden="true">
          <span>{getCategoryEmoji(category.category_name)}</span>
        </div>
      </td>

      <td>
        <div className="categories-v2-name-cell">
          <strong>{category.category_name}</strong>
          <span>ID #{category.category_id}</span>
        </div>
      </td>

      <td>
        <span className="categories-v2-products-count">{productsCount}</span>
      </td>

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

      <td>
        <span className={`categories-v2-state-pill ${isEmpty ? 'is-empty' : 'is-active'}`}>
          {isEmpty ? 'Empty' : 'Active'}
        </span>
      </td>
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

  const [stateFilter, setStateFilter] = useState('all');
  const [densitySort, setDensitySort] = useState('products_desc');

  const [selectedIds, setSelectedIds] = useState([]);

  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const prevStoreIdRef = useRef(storeId);
  const pendingParamsRef = useRef(null);
  const inFlightRef = useRef(false);
  const headerCheckboxRef = useRef(null);

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
        ...(targetPerPage != null ? { per_page: targetPerPage } : {}),
      });

      const parsed = extractPaginated(response, targetPerPage);
      setCategories(parsed.data);
      setMeta(parsed.meta);

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
      setSelectedIds([]);
      setStateFilter('all');
      setDensitySort('products_desc');

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

  useEffect(() => {
    const idsOnPage = new Set(categories.map((item) => item.category_id));
    setSelectedIds((prev) => prev.filter((id) => idsOnPage.has(id)));
  }, [categories]);

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
        setShowModal(false);
        resetForm();
        await loadCategories({ storeId, page, search: debouncedSearch, perPage });
      } else {
        await categoryService.create(payload);
        setShowModal(false);
        resetForm();

        if (page !== 1) {
          setPage(1);
        } else {
          await loadCategories({ storeId, page: 1, search: debouncedSearch, perPage });
        }
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
      setSelectedIds((prev) => prev.filter((id) => id !== categoryId));

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

  const handleToggleSelect = useCallback((categoryId) => {
    setSelectedIds((prev) => (
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    ));
  }, []);

  const goToPreviousPage = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, meta.last_page || 1));
  }, [meta.last_page]);

  const displayedPerPage = effectivePerPage ?? meta.per_page ?? '';

  const perPageOptions = useMemo(() => {
    const opts = new Set(PER_PAGE_OPTIONS);
    if (displayedPerPage !== '') opts.add(Number(displayedPerPage));
    return Array.from(opts).sort((a, b) => a - b);
  }, [displayedPerPage]);

  const sortedAndFilteredCategories = useMemo(() => {
    let items = [...categories];

    if (stateFilter === 'empty') {
      items = items.filter((item) => Number(item.products_count || 0) === 0);
    } else if (stateFilter === 'with_products') {
      items = items.filter((item) => Number(item.products_count || 0) > 0);
    }

    items.sort((a, b) => {
      if (densitySort === 'products_asc') {
        return Number(a.products_count || 0) - Number(b.products_count || 0);
      }

      if (densitySort === 'name_asc') {
        return String(a.category_name || '').localeCompare(String(b.category_name || ''));
      }

      return Number(b.products_count || 0) - Number(a.products_count || 0);
    });

    return items;
  }, [categories, stateFilter, densitySort]);

  const visibleIds = useMemo(
    () => sortedAndFilteredCategories.map((item) => item.category_id),
    [sortedAndFilteredCategories]
  );

  const allVisibleSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id)),
    [visibleIds, selectedIds]
  );

  const someVisibleSelected = useMemo(
    () => visibleIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected,
    [visibleIds, selectedIds, allVisibleSelected]
  );

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const handleToggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }

      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [allVisibleSelected, visibleIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const exportRowsToCsv = useCallback((rows, filename) => {
    const csv = [
      ['Category ID', 'Store ID', 'Category Name', 'Products'].map(toCsvValue).join(','),
      ...rows.map((row) => [
        row.category_id,
        row.store_id,
        row.category_name,
        row.products_count || 0,
      ].map(toCsvValue).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportCurrentView = useCallback(() => {
    exportRowsToCsv(sortedAndFilteredCategories, `categories-store-${storeId || 'all'}-page-${page}.csv`);
  }, [sortedAndFilteredCategories, exportRowsToCsv, storeId, page]);

  const handleExportSelected = useCallback(() => {
    const selected = sortedAndFilteredCategories.filter((item) => selectedIds.includes(item.category_id));
    exportRowsToCsv(selected, `categories-selected-store-${storeId || 'all'}.csv`);
  }, [sortedAndFilteredCategories, selectedIds, exportRowsToCsv, storeId]);

  const summary = useMemo(() => {
    const totalCategories = meta.total || 0;
    const emptyCategoriesInPage = categories.filter((item) => Number(item.products_count || 0) === 0).length;
    const denseCategory = [...categories].sort(
      (a, b) => Number(b.products_count || 0) - Number(a.products_count || 0)
    )[0];

    return {
      totalCategories,
      emptyCategoriesInPage,
      denseCategoryName: denseCategory?.category_name || '—',
      denseCategoryCount: Number(denseCategory?.products_count || 0),
    };
  }, [meta.total, categories]);

  const colSpan = useMemo(() => (canManage ? 6 : 5), [canManage]);

  return (
    <>
      <style>{`
        @keyframes categories-spin { to { transform: rotate(360deg); } }

        .spin-icon { animation: categories-spin 0.8s linear infinite; }

        .categories-page-wrapper {
          position: relative;
        }

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

        .categories-v2-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .categories-v2-summary-card {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          box-shadow: var(--shadow-soft);
          padding: 16px 18px;
          display: grid;
          gap: 10px;
        }

        .categories-v2-summary-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .categories-v2-summary-label {
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
        }

        .categories-v2-summary-value {
          font-size: clamp(1.35rem, 1rem + 1vw, 1.9rem);
          color: var(--text);
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.03em;
        }

        .categories-v2-summary-sub {
          font-size: 0.84rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .categories-v2-summary-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border: 1px solid transparent;
        }

        .categories-v2-summary-icon.is-blue {
          background: #eef8fe;
          color: var(--brand-blue);
          border-color: #cfe7fb;
        }

        .categories-v2-summary-icon.is-red {
          background: #fde8e8;
          color: var(--danger);
          border-color: #f5c2c2;
        }

        .categories-v2-summary-icon.is-teal {
          background: #eef5f8;
          color: var(--hero-teal-1);
          border-color: #cfe3ea;
        }

        .categories-v2-toolbar {
          display: grid;
          grid-template-columns: minmax(240px, 1.4fr) repeat(3, minmax(140px, auto)) auto;
          gap: 12px;
          align-items: center;
          padding: 14px 16px;
          border: 1px solid var(--line);
          background: var(--panel-2);
          border-radius: 12px;
        }

        .categories-v2-search {
          position: relative;
          min-width: 0;
        }

        .categories-v2-search svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          pointer-events: none;
        }

        .categories-v2-search .text-input {
          padding-left: 38px;
          background: var(--white);
        }

        .categories-v2-toolbar-select {
          position: relative;
          display: inline-flex;
          align-items: center;
          min-width: 0;
        }

        .categories-v2-toolbar-select svg {
          position: absolute;
          right: 10px;
          pointer-events: none;
          color: var(--muted);
        }

        .categories-v2-toolbar-select .text-input {
          width: 100%;
          padding-right: 30px;
          appearance: none;
          background: var(--white);
        }

        .categories-v2-store-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 14px;
          border-radius: 10px;
          background: var(--panel);
          border: 1px solid var(--line);
          color: var(--nav-text);
          font-size: 0.88rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .categories-v2-card {
          padding: 0;
          overflow: hidden;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: var(--panel);
          box-shadow: var(--shadow-soft);
        }

        .categories-v2-card .table-wrap {
          border: 0;
          border-radius: 0;
          background: var(--white);
        }

        .categories-v2-card .data-table th {
          background: var(--hero-teal-1);
          border-bottom-color: var(--hero-teal-2);
          font-size: 11px;
        }

        .categories-v2-card .data-table td {
          font-size: 13px;
          vertical-align: middle;
        }

        .categories-v2-name-cell {
          display: grid;
          gap: 2px;
        }

        .categories-v2-name-cell strong {
          color: var(--text);
          font-size: 0.9rem;
          font-weight: 700;
          margin: 0;
        }

        .categories-v2-name-cell span {
          color: var(--muted);
          font-size: 0.76rem;
        }

        .categories-v2-icon-cell {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          border: 1px solid var(--line);
          background: #f8fafc;
          font-size: 1.1rem;
        }

        .categories-v2-products-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 36px;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          background: #eef8fe;
          border: 1px solid #cfe7fb;
          color: var(--brand-blue);
          font-size: 0.82rem;
          font-weight: 800;
        }

        .categories-v2-state-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 0 12px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 700;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .categories-v2-state-pill.is-active {
          background: #e2f5ec;
          color: #218353;
          border-color: #c3edd7;
        }

        .categories-v2-state-pill.is-empty {
          background: #fff5e7;
          color: #b56d00;
          border-color: #f2ddb2;
        }

        .categories-v2-bulk-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding: 12px 14px;
          background: #3e7287;
          color: #fff;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .categories-v2-bulk-left,
        .categories-v2-bulk-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .categories-v2-bulk-label {
          font-size: 0.84rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.96);
        }

        .categories-v2-bulk-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #fff;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 600;
          transition: background 0.18s ease, border-color 0.18s ease;
        }

        .categories-v2-bulk-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.26);
        }

        .categories-v2-bulk-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .categories-v2-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          padding: 14px 16px;
          background: var(--panel);
          border-top: 1px solid var(--line);
        }

        .categories-v2-pagination-left {
          color: var(--muted);
          font-size: 0.9rem;
        }

        .categories-v2-pagination-right {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        @media (max-width: 1080px) {
          .categories-v2-summary-grid {
            grid-template-columns: 1fr;
          }

          .categories-v2-toolbar {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 720px) {
          .categories-v2-toolbar {
            grid-template-columns: 1fr;
          }

          .categories-v2-bulk-bar,
          .categories-v2-pagination {
            flex-direction: column;
            align-items: stretch;
          }

          .categories-v2-pagination-right {
            width: 100%;
          }

          .categories-v2-pagination-right .ghost-button {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>

      <div className="categories-page-wrapper">
        {loading ? (
          <div className="categories-loading-overlay">
            <Loader2 size={32} className="spin-icon" />
          </div>
        ) : null}

        <section className="stack-lg">
          <div
            className="catalog-hero"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
          >
            <div className="catalog-hero-copy">
              <h3 className="catalog-title">Categories</h3>
              <p className="catalog-subtitle">
                {storeId
                  ? `Showing ${meta.from ?? 0}-${meta.to ?? 0} of ${meta.total ?? 0}`
                  : 'Select a store first.'}
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
                <Plus size={16} />
                New category
              </button>
            )}
          </div>

          <div className="categories-v2-summary-grid">
            <article className="categories-v2-summary-card">
              <div className="categories-v2-summary-top">
                <div>
                  <p className="categories-v2-summary-label">Total master categories</p>
                  <div className="categories-v2-summary-value">{summary.totalCategories}</div>
                </div>
                <div className="categories-v2-summary-icon is-blue">
                  <Package size={18} />
                </div>
              </div>
              <p className="categories-v2-summary-sub">
                Total categories returned by the backend for the current store.
              </p>
            </article>

            <article className="categories-v2-summary-card">
              <div className="categories-v2-summary-top">
                <div>
                  <p className="categories-v2-summary-label">Empty categories flag</p>
                  <div className="categories-v2-summary-value">{summary.emptyCategoriesInPage}</div>
                </div>
                <div className="categories-v2-summary-icon is-red">
                  <AlertCircle size={18} />
                </div>
              </div>
              <p className="categories-v2-summary-sub">
                Categories with zero linked products on the current loaded page.
              </p>
            </article>

            <article className="categories-v2-summary-card">
              <div className="categories-v2-summary-top">
                <div>
                  <p className="categories-v2-summary-label">Most dense department</p>
                  <div className="categories-v2-summary-value">{summary.denseCategoryName}</div>
                </div>
                <div className="categories-v2-summary-icon is-teal">
                  <PieChart size={18} />
                </div>
              </div>
              <p className="categories-v2-summary-sub">
                Highest product count on this page: {summary.denseCategoryCount}.
              </p>
            </article>
          </div>

          <div className="categories-v2-toolbar">
            <label className="categories-v2-search">
              <Search size={16} />
              <input
                className="text-input"
                placeholder="Search category"
                value={search}
                onChange={handleSearchChange}
                disabled={!storeId}
              />
            </label>

            <div className="categories-v2-toolbar-select">
              <ChevronDown size={14} />
              <select
                className="text-input"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                disabled={!storeId}
              >
                <option value="all">All categories</option>
                <option value="with_products">With products</option>
                <option value="empty">Empty only</option>
              </select>
            </div>

            <div className="categories-v2-toolbar-select">
              <ChevronDown size={14} />
              <select
                className="text-input"
                value={densitySort}
                onChange={(e) => setDensitySort(e.target.value)}
                disabled={!storeId}
              >
                <option value="products_desc">Density sort</option>
                <option value="products_asc">Least dense first</option>
                <option value="name_asc">Name A-Z</option>
              </select>
            </div>

            <div className="categories-v2-toolbar-select">
              <ChevronDown size={14} />
              <select
                className="text-input"
                value={displayedPerPage}
                onChange={handlePerPageChange}
                disabled={!storeId}
              >
                {displayedPerPage === '' ? (
                  <option value="" disabled>
                    Per page
                  </option>
                ) : null}
                {perPageOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>

            <div className="categories-v2-store-pill">Store ID: {storeId || '-'}</div>
          </div>

          {error && !showModal ? <p className="form-error">{error}</p> : null}

          <article className="categories-v2-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={handleToggleSelectAllVisible}
                        disabled={!sortedAndFilteredCategories.length}
                        aria-label="Select all visible categories"
                      />
                    </th>
                    <th style={{ width: 64 }}>Icon</th>
                    <th>Name</th>
                    <th>Products</th>
                    {canManage && <th>Actions</th>}
                    <th>Category State</th>
                  </tr>
                </thead>

                <tbody>
                  {!storeId ? (
                    <tr>
                      <td colSpan={colSpan}>Select a store first.</td>
                    </tr>
                  ) : sortedAndFilteredCategories.length ? (
                    sortedAndFilteredCategories.map((category) => (
                      <CategoryRow
                        key={category.category_id}
                        category={category}
                        canManage={canManage}
                        isSelected={selectedIds.includes(category.category_id)}
                        onToggleSelect={handleToggleSelect}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))
                  ) : !loading ? (
                    <tr>
                      <td colSpan={colSpan}>
                        {categories.length
                          ? 'No categories match the current filters.'
                          : 'No categories found.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {storeId ? (
              <>
                <div className="categories-v2-bulk-bar">
                  <div className="categories-v2-bulk-left">
                    <span className="categories-v2-bulk-label">
                      Bulk Actions {selectedIds.length ? `(${selectedIds.length} selected)` : ''}
                    </span>

                    <button
                      type="button"
                      className="categories-v2-bulk-btn"
                      onClick={handleToggleSelectAllVisible}
                      disabled={!sortedAndFilteredCategories.length}
                    >
                      {allVisibleSelected ? 'Unselect page' : 'Select page'}
                    </button>

                    <button
                      type="button"
                      className="categories-v2-bulk-btn"
                      onClick={handleClearSelection}
                      disabled={!selectedIds.length}
                    >
                      Clear selection
                    </button>
                  </div>

                  <div className="categories-v2-bulk-right">
                    <button
                      type="button"
                      className="categories-v2-bulk-btn"
                      onClick={handleExportCurrentView}
                      disabled={!sortedAndFilteredCategories.length}
                    >
                      <Download size={14} />
                      Export current view
                    </button>

                    <button
                      type="button"
                      className="categories-v2-bulk-btn"
                      onClick={handleExportSelected}
                      disabled={!selectedIds.length}
                    >
                      <Download size={14} />
                      Export selected
                    </button>
                  </div>
                </div>

                <div className="categories-v2-pagination">
                  <div className="categories-v2-pagination-left">
                    Page <strong>{meta.current_page || 1}</strong> of <strong>{meta.last_page || 1}</strong>
                  </div>

                  <div className="categories-v2-pagination-right">
                    <button
                      type="button"
                      className="ghost-button pagination-btn"
                      onClick={goToPreviousPage}
                      disabled={!meta.current_page || meta.current_page <= 1 || loading}
                    >
                      Previous
                    </button>

                    <button
                      type="button"
                      className="ghost-button pagination-btn"
                      onClick={goToNextPage}
                      disabled={!meta.last_page || meta.current_page >= meta.last_page || loading}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
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

                  <button className="catalog-primary-btn" type="submit" disabled={submitting || !storeId}>
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
