import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Edit, Trash2, ChevronDown, Loader2 } from 'lucide-react';
import { categoryService } from '../../services/categoryService';
import { productService } from '../../services/productService';
import { currency } from '../../utils/helpers';
import { useStore } from '../../contexts/StoreContext';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';
import { useAuth } from '../../contexts/AuthContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const IMAGE_BASE_URL =
  import.meta.env.VITE_STORAGE_URL ||
  `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/storage/`;

// Fallback options shown in the per-page dropdown before we know the
// backend's actual default (ProductController defaults to 14). The real
// default, once known from a response's meta.per_page, is merged into this
// list so the dropdown always has a matching option even if it isn't here.
const PER_PAGE_OPTIONS = [12, 24, 48, 100];

const initialForm = {
  category_id: '',
  sku: '',
  product_name: '',
  price: '',
  cost_price: '',
  vat_rate: 0,
  apply_vat: false,
  is_active: true,
  image_mode: 'upload',
  image_file: null,
  image_url_input: '',
  image_preview: '',
  clear_image: false,
};

const extractList = (res) => {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
};

const formatApiError = (err) => {
  const response = err?.response?.data;
  if (response?.errors) return Object.values(response.errors).flat().join(' ');
  return response?.message || err?.message || 'Unable to save product.';
};

const revokeBlobUrl = (url) => {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const getProductId = (product) =>
  product?.product_uuid ?? product?.uuid ?? product?.product_id ?? null;

const resolveImageSrc = (product) => {
  if (product?.image_url) return product.image_url;
  if (product?.image) {
    return product.image.startsWith('http')
      ? product.image
      : `${IMAGE_BASE_URL}${product.image}`;
  }
  return null;
};

const ProductRow = memo(function ProductRow({
  product,
  currencyCode,
  canManage,
  onEdit,
  onDelete,
}) {
  const rowKey = getProductId(product);
  const imageSrc = resolveImageSrc(product);

  return (
    <tr>
      <td>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={product.product_name}
            style={{
              width: 56,
              height: 56,
              objectFit: 'cover',
              borderRadius: 12,
              border: '1px solid var(--line)',
              background: 'var(--panel-2)',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div
            className="muted"
            style={{ fontSize: '12px', textAlign: 'center', width: 56 }}
          >
            No image
          </div>
        )}
      </td>

      <td>
        <strong>{product.product_name}</strong>
        <div className="muted">{product.sku}</div>
      </td>

      <td>{product.category?.category_name || '-'}</td>

      <td>
        <div>{currency(product.price, currencyCode)}</div>
        <div className="muted">
          Cost {currency(product.cost_price, currencyCode)}
        </div>
        <div className="muted">
          {Number(product.vat_rate || 0) > 0
            ? `VAT ${Number(product.vat_rate)}%`
            : 'No VAT'}
        </div>
      </td>

      <td>
        <span className={`status-badge ${product.is_active ? 'paid' : 'draft'}`}>
          {product.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>

      <td>
        <div className="row-actions compact">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onEdit(product)}
            title="Edit"
            disabled={!canManage}
          >
            <Edit size={16} />
          </button>

          <button
            type="button"
            className="ghost-button danger"
            onClick={() => onDelete(rowKey)}
            title="Delete"
            disabled={!canManage}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
});

const ProductModal = memo(function ProductModal({
  show,
  form,
  editingId,
  categories,
  previewSrc,
  error,
  submitting,
  canManage,
  onClose,
  onSubmit,
  onFieldChange,
  onSwitchImageMode,
  onFileChange,
  onImageUrlChange,
  onClearImage,
}) {
  if (!show) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card form-modal-card form-modal-card-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>{editingId ? 'Edit product' : 'New product'}</h3>
            <p className="muted">
              Add product details, upload an image file, or save a direct image URL.
            </p>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-content">
          <form className="catalog-form-grid" onSubmit={onSubmit}>
            <label>
              Category
              <select
                className="select-input"
                value={form.category_id}
                onChange={(e) => onFieldChange('category_id', e.target.value)}
                required
                disabled={!canManage || submitting}
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.category_id} value={category.category_id}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              SKU
              <input
                className="text-input"
                placeholder="e.g. PROD-01"
                value={form.sku}
                readOnly={Boolean(editingId)}
                onChange={(e) => onFieldChange('sku', e.target.value)}
                required
                disabled={!canManage || submitting}
              />
            </label>

            <label>
              Product name
              <input
                className="text-input"
                placeholder="Enter product name"
                value={form.product_name}
                onChange={(e) => onFieldChange('product_name', e.target.value)}
                required
                disabled={!canManage || submitting}
              />
            </label>

            <label>
              Selling price
              <input
                className="text-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter selling price"
                value={form.price}
                onChange={(e) => onFieldChange('price', e.target.value)}
                required
                disabled={!canManage || submitting}
              />
            </label>

            <label>
              Cost price
              <input
                className="text-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter cost / buying price"
                value={form.cost_price}
                onChange={(e) => onFieldChange('cost_price', e.target.value)}
                required
                disabled={!canManage || submitting}
              />
            </label>

            <label>
              VAT rate (%)
              <input
                className="text-input"
                type="number"
                min="0"
                step="0.01"
                value={form.vat_rate}
                disabled={!form.apply_vat || !canManage || submitting}
                onChange={(e) => onFieldChange('vat_rate', e.target.value)}
                placeholder={form.apply_vat ? 'Enter VAT rate' : 'Enable VAT first'}
              />
            </label>

            <div className="span-2 image-source-switch">
              <button
                type="button"
                className={`chip ${form.image_mode === 'upload' ? 'active' : ''}`}
                onClick={() => onSwitchImageMode('upload')}
                disabled={!canManage || submitting}
              >
                Upload file
              </button>

              <button
                type="button"
                className={`chip ${form.image_mode === 'url' ? 'active' : ''}`}
                onClick={() => onSwitchImageMode('url')}
                disabled={!canManage || submitting}
              >
                Image URL
              </button>

              {previewSrc ? (
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={onClearImage}
                  disabled={!canManage || submitting}
                >
                  Remove image
                </button>
              ) : null}
            </div>

            {form.image_mode === 'upload' ? (
              <label className="span-2">
                Upload image file
                <input
                  className="text-input"
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,image/webp"
                  onChange={(e) => onFileChange(e.target.files?.[0])}
                  disabled={!canManage || submitting}
                />
              </label>
            ) : (
              <label className="span-2">
                Image URL
                <input
                  className="text-input"
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={form.image_url_input}
                  onChange={(e) => onImageUrlChange(e.target.value)}
                  disabled={!canManage || submitting}
                />
              </label>
            )}

            {previewSrc ? (
              <div className="catalog-preview span-2">
                <div className="catalog-preview-image-wrap">
                  <img
                    src={previewSrc}
                    alt="Preview"
                    className="catalog-preview-image"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>

                <div className="catalog-preview-copy">
                  <strong>Image preview</strong>
                  <p>
                    {form.image_mode === 'upload' && form.image_file
                      ? `Selected file: ${form.image_file.name}`
                      : form.image_mode === 'url' && form.image_url_input.trim()
                        ? `URL: ${form.image_url_input}`
                        : 'Current saved image'}
                  </p>
                </div>
              </div>
            ) : null}

            <label className="checkbox-row span-2 catalog-check">
              <input
                type="checkbox"
                checked={form.apply_vat}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onFieldChange('apply_vat', checked);
                  onFieldChange('vat_rate', checked ? form.vat_rate || 0 : 0);
                }}
                disabled={!canManage || submitting}
              />
              <span>Apply VAT for this product</span>
            </label>

            <label className="checkbox-row span-2 catalog-check">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => onFieldChange('is_active', e.target.checked)}
                disabled={!canManage || submitting}
              />
              <span>Product is active in cashier</span>
            </label>

            {error ? <p className="form-error span-2">{error}</p> : null}

            <div className="catalog-modal-actions span-2">
              <button
                type="button"
                className="ghost-button"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                className="catalog-primary-btn"
                type="submit"
                disabled={submitting || !canManage}
              >
                {editingId ? 'Update product' : 'Create product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});

export default function AdminProductsPage() {
  const { can } = useAuth();
  const { stores, storeId } = useStore();

  const canManage = can('products.manage');

  const currentStore = useMemo(
    () => stores.find((store) => String(store.store_id) === String(storeId)),
    [stores, storeId]
  );

  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [categories, setCategories] = useState([]);

  // `perPage` is intentionally undefined until the user explicitly picks a
  // value from the dropdown. While undefined, we never send per_page to the
  // backend, so the backend's own default (currently 14) governs. This is
  // also the only per-page state the load depends on, so the value learned
  // back from the server (effectivePerPage below) never triggers a
  // redundant second fetch.
  const [perPage, setPerPage] = useState(undefined);

  // Purely for display (dropdown value). Synced from meta.per_page after
  // every successful load so the dropdown reflects the backend's true
  // default until the user overrides it.
  const [effectivePerPage, setEffectivePerPage] = useState(undefined);

  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...initialForm });
  const [editingId, setEditingId] = useState(null);

  // Single loading flag drives the overlay spinner (replaces the old
  // initialLoading / refreshing split with one consistent affordance).
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 220);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const categoriesRequestRef = useRef(0);
  const prevStoreIdRef = useRef(storeId);

  // Ensures product fetches run one at a time, in order. If a new load
  // request comes in while one is in flight (e.g. fast Previous/Next
  // clicks, or a debounce firing mid-request), only the latest queued
  // request runs once the current one finishes — preventing an older,
  // slower response from overwriting newer state.
  const pendingParamsRef = useRef(null);
  const inFlightRef = useRef(false);

  const previewSrc = useMemo(() => {
    if (form.clear_image) return '';
    if (form.image_mode === 'url') {
      return form.image_url_input.trim() || form.image_preview;
    }
    return form.image_preview;
  }, [
    form.clear_image,
    form.image_mode,
    form.image_preview,
    form.image_url_input,
  ]);

  const updateFormField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setForm((prev) => {
      revokeBlobUrl(prev.image_preview);
      return { ...initialForm };
    });
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

  const switchImageMode = useCallback((mode) => {
    setForm((prev) => ({
      ...prev,
      image_mode: mode,
      image_file: mode === 'upload' ? prev.image_file : null,
      image_url_input: mode === 'url' ? prev.image_url_input : '',
      clear_image: false,
    }));
  }, []);

  const handleFileChange = useCallback((file) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a valid image file: jpeg, jpg, png, or webp.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image file size must not exceed 2MB.');
      return;
    }

    const localPreview = URL.createObjectURL(file);

    setError('');
    setForm((prev) => {
      revokeBlobUrl(prev.image_preview);
      return {
        ...prev,
        image_mode: 'upload',
        image_file: file,
        image_url_input: '',
        image_preview: localPreview,
        clear_image: false,
      };
    });
  }, []);

  const handleImageUrlChange = useCallback((value) => {
    setError('');
    setForm((prev) => ({
      ...prev,
      image_mode: 'url',
      image_file: null,
      image_url_input: value,
      clear_image: false,
    }));
  }, []);

  const clearCurrentImage = useCallback(() => {
    setForm((prev) => {
      revokeBlobUrl(prev.image_preview);
      return {
        ...prev,
        image_file: null,
        image_url_input: '',
        image_preview: '',
        clear_image: true,
      };
    });
  }, []);

  // ── Sequential, queued product loader (async/await throughout) ──────────
  const runLoadProducts = useCallback(async ({ storeId: targetStoreId, page: targetPage, search: targetSearch, perPage: targetPerPage }) => {
    if (!targetStoreId) {
      setProducts([]);
      setMeta({ ...EMPTY_META });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = {
        page: targetPage,
        store_id: targetStoreId,
        ...(targetSearch ? { search: targetSearch } : {}),
        // Only send per_page once the user has explicitly chosen one.
        // Otherwise omit it entirely so the backend's own default applies.
        ...(targetPerPage != null ? { per_page: targetPerPage } : {}),
      };

      const response = await productService.list(params);

      // extractPaginated's second arg is just a fallback for malformed
      // responses, not the value that should govern requests, so pass
      // targetPerPage (which may be undefined) rather than a hardcoded const.
      const parsed = extractPaginated(response, targetPerPage);
      setProducts(parsed.data || []);
      setMeta(parsed.meta || { ...EMPTY_META });

      // Learn the real per-page in effect from the server's own meta,
      // independent of whatever the user picked, so the dropdown always
      // reflects what was actually applied.
      if (parsed.meta?.per_page != null) {
        setEffectivePerPage(parsed.meta.per_page);
      }
    } catch (err) {
      setError(formatApiError(err) || 'Unable to load products.');
      setProducts([]);
      setMeta({ ...EMPTY_META });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async (params = {}) => {
    const callParams = {
      storeId: params.storeId ?? storeId,
      page: params.page ?? page,
      search: 'search' in params ? params.search : debouncedSearch,
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
      await runLoadProducts(current);
      if (pendingParamsRef.current) {
        current = pendingParamsRef.current;
        pendingParamsRef.current = null;
      } else {
        current = null;
      }
    }

    inFlightRef.current = false;
  }, [storeId, page, debouncedSearch, perPage, runLoadProducts]);

  // ── Categories loader (await fully resolved before commit, as before) ───
  const loadCategories = useCallback(async (targetStoreId) => {
    if (!targetStoreId) {
      setCategories([]);
      return;
    }

    const requestId = ++categoriesRequestRef.current;

    try {
      const categoriesRes = await categoryService.list({
        store_id: targetStoreId,
        per_page: 100,
      });

      if (requestId !== categoriesRequestRef.current) return;
      setCategories(extractList(categoriesRes));
    } catch {
      if (requestId !== categoriesRequestRef.current) return;
      setCategories([]);
    }
  }, []);

  // Single source of truth for fetching. Runs whenever storeId,
  // debouncedSearch, page, or perPage change. perPage only changes here
  // when the user explicitly picks a value — the backend-learned
  // `effectivePerPage` is deliberately NOT a dependency, so syncing the
  // dropdown after a response never causes a second, redundant fetch.
  useEffect(() => {
    const storeChanged = prevStoreIdRef.current !== storeId;
    prevStoreIdRef.current = storeId;

    if (storeChanged) {
      setProducts([]);
      setMeta({ ...EMPTY_META });
      setCategories([]);
      setShowModal(false);
      resetForm();
      setError('');

      // Let the new store's load pick up the backend default again,
      // rather than carrying over a per_page chosen for the old store.
      if (search !== '' || page !== 1 || perPage !== undefined) {
        setSearch('');
        setPage(1);
        setPerPage(undefined);
        setEffectivePerPage(undefined);
        return;
      }

      if (!storeId) setLoading(false);
    }

    loadProducts({ storeId, page, search: debouncedSearch, perPage });
    loadCategories(storeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, debouncedSearch, page, perPage]);

  useEffect(() => {
    return () => {
      revokeBlobUrl(form.image_preview);
    };
  }, [form.image_preview]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError('');
      setSubmitting(true);

      try {
        const formData = new FormData();

        formData.append('store_id', String(Number(storeId)));
        formData.append('category_id', String(Number(form.category_id)));
        formData.append('sku', form.sku.trim());
        formData.append('product_name', form.product_name.trim());
        formData.append('price', String(Number(form.price)));
        formData.append('cost_price', String(Number(form.cost_price)));
        formData.append(
          'vat_rate',
          String(form.apply_vat ? Number(form.vat_rate || 0) : 0)
        );
        formData.append('is_active', form.is_active ? '1' : '0');
        formData.append('clear_image', form.clear_image ? '1' : '0');

        if (form.image_mode === 'upload' && form.image_file instanceof File) {
          formData.append('image', form.image_file);
        } else if (form.image_mode === 'url' && form.image_url_input.trim()) {
          formData.append('image_url', form.image_url_input.trim());
        }

        if (editingId) {
          formData.append('_method', 'PUT');
          await productService.update(editingId, formData);
        } else {
          await productService.create(formData);
        }

        setShowModal(false);
        resetForm();

        if (!editingId && page !== 1) {
          setPage(1);
        } else {
          await loadProducts({ storeId, page, search: debouncedSearch, perPage });
        }
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setSubmitting(false);
      }
    },
    [storeId, form, editingId, page, debouncedSearch, perPage, loadProducts, resetForm]
  );

  const handleEdit = useCallback((product) => {
    const id = getProductId(product);

    if (!id) {
      console.warn('No valid ID found on product:', product);
      return;
    }

    setEditingId(id);
    setError('');
    setForm((prev) => {
      revokeBlobUrl(prev.image_preview);
      return {
        category_id: product.category_id || '',
        sku: product.sku || '',
        product_name: product.product_name || '',
        price: product.price || '',
        cost_price: product.cost_price || '',
        vat_rate: product.vat_rate || '',
        apply_vat: Number(product.vat_rate || 0) > 0,
        is_active: Boolean(product.is_active),
        image_mode: 'upload',
        image_file: null,
        image_url_input: '',
        image_preview: resolveImageSrc(product) || '',
        clear_image: false,
      };
    });
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(
    async (productId) => {
      if (!productId) return;
      if (!window.confirm('Delete this product?')) return;

      try {
        await productService.remove(productId);

        if (products.length === 1 && page > 1) {
          setPage((prev) => prev - 1);
        } else {
          await loadProducts({ storeId, page, search: debouncedSearch, perPage });
        }
      } catch (err) {
        setError(formatApiError(err) || 'Unable to delete product.');
      }
    },
    [products.length, page, storeId, debouncedSearch, perPage, loadProducts]
  );

  const handleSearchChange = useCallback((e) => {
    const nextValue = e.target.value;
    setSearch(nextValue);
    setPage((prev) => (prev === 1 ? prev : 1));
  }, []);

  const handlePerPageChange = useCallback((e) => {
    const nextPerPage = Number(e.target.value);
    setPerPage(nextPerPage);
    setEffectivePerPage(nextPerPage);
    setPage(1);
  }, []);

  const handlePrevPage = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, meta.last_page || 1));
  }, [meta.last_page]);

  const tableRows = useMemo(
    () =>
      products.map((product) => (
        <ProductRow
          key={getProductId(product)}
          product={product}
          currencyCode={currentStore?.currency}
          canManage={canManage}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )),
    [products, currentStore?.currency, canManage, handleEdit, handleDelete]
  );

  // Whatever is currently in effect (user choice, or backend-learned
  // default once known), for the dropdown's value.
  const displayedPerPage = effectivePerPage ?? meta.per_page ?? '';

  // Ensure the dropdown always has an option matching the current value,
  // even if it isn't one of the hardcoded common choices (e.g. backend
  // default of 14 isn't in PER_PAGE_OPTIONS).
  const perPageOptions = useMemo(() => {
    const opts = new Set(PER_PAGE_OPTIONS);
    if (displayedPerPage !== '') opts.add(Number(displayedPerPage));
    return Array.from(opts).sort((a, b) => a - b);
  }, [displayedPerPage]);

  return (
    <>
      <style>{`
        @keyframes products-spin { to { transform: rotate(360deg); } }
        .spin-icon { animation: products-spin 0.8s linear infinite; }
        .products-page-wrapper { position: relative; }
        .products-loading-overlay {
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

      <div className="products-page-wrapper">
        {loading ? (
          <div className="products-loading-overlay">
            <Loader2 size={32} className="spin-icon" />
          </div>
        ) : null}

        <section className="stack-lg">
          <div
            className="catalog-hero"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div
              className="catalog-hero-copy"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <h2 className="catalog-title">Products</h2>
              <p className="catalog-subtitle">
                {meta.from && meta.to
                  ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
                  : `${products.length} products in catalog`}
              </p>
            </div>

            <button
              type="button"
              className="ghost-button"
              onClick={openCreateModal}
              disabled={!storeId || !canManage}
            >
              <Plus size={18} />
              New product
            </button>
          </div>

          <div className="catalog-toolbar">
            <label className="catalog-search">
              <input
                className="text-input"
                type="text"
                placeholder="Search product"
                value={search}
                onChange={handleSearchChange}
                disabled={!storeId}
              />
            </label>

            <div
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
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
                  <option key={n} value={n}>
                    {n}
                  </option>
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
                    <th>Image</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Pricing</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {!storeId ? (
                    <tr>
                      <td colSpan="6">Select a store first.</td>
                    </tr>
                  ) : products.length ? (
                    tableRows
                  ) : !loading ? (
                    <tr>
                      <td colSpan="6">No products found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {storeId ? (
              <div
                className="row-actions"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 16,
                }}
              >
                <span className="muted">
                  Page {meta.current_page || 1} of {meta.last_page || 1}
                </span>

                <div className="row-actions compact">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handlePrevPage}
                    disabled={!meta.has_prev_page || loading}
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleNextPage}
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

      <ProductModal
        show={showModal}
        form={form}
        editingId={editingId}
        categories={categories}
        previewSrc={previewSrc}
        error={error}
        submitting={submitting}
        canManage={canManage}
        onClose={closeModal}
        onSubmit={handleSubmit}
        onFieldChange={updateFormField}
        onSwitchImageMode={switchImageMode}
        onFileChange={handleFileChange}
        onImageUrlChange={handleImageUrlChange}
        onClearImage={clearCurrentImage}
      />
    </>
  );
}