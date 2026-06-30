import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, X, Edit, Trash2, ChevronDown, Search,
  Database, Wallet, AlertTriangle, Copy, Files,
} from 'lucide-react';
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

const PER_PAGE_OPTIONS = [12, 16, 24, 48, 100];

const initialForm = {
  category_id: '',
  sku: '',
  product_name: '',
  description: '',
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

const formatLiveTime = () => {
  try {
    return new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Africa/Nairobi',
    }) + ' EAT';
  } catch {
    return new Date().toLocaleTimeString();
  }
};

/* ===================== Product Row ===================== */
const ProductRow = memo(function ProductRow({
  product,
  currencyCode,
  canManage,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onCopySku,
  onToggleActive,
  storeId,
}) {
  const rowKey = getProductId(product);
  const imageSrc = resolveImageSrc(product);
  const vatRate = Number(product.vat_rate || 0);

  return (
    <tr className={selected ? 'pp-row-selected' : ''}>
      <td className="pp-cell-checkbox">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(rowKey)}
          disabled={!canManage}
        />
      </td>

      <td>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={product.product_name}
            className="pp-thumb"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="pp-thumb pp-thumb-empty">No image</div>
        )}
      </td>

      <td>
        <strong>{product.product_name}</strong>
        <div className="muted">{product.sku}</div>
      </td>

      <td>{product.category?.category_name || '-'}</td>

      <td>
        <div className="pp-pricing-cell">
          <div className="pp-pricing-meta">
            <span className="pp-pricing-store">
              <Database size={11} /> Store ID: {product.store_id || storeId}
            </span>
            <span className="pp-pricing-base muted">(Baseline Price)</span>
          </div>
          <div className="pp-pricing-main">
            {currency(product.price, currencyCode)}
          </div>
          <div className="muted pp-pricing-sub">
            Cost {currency(product.cost_price, currencyCode)}
          </div>
          <div className="muted pp-pricing-sub">
            {vatRate > 0 ? `VAT ${vatRate}%` : 'No VAT'}
          </div>
        </div>
      </td>

      <td>
        <span className={`pp-status-badge ${product.is_active ? 'active' : 'inactive'}`}>
          {product.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>

      <td>
        <div className="pp-row-actions">
          <button
            type="button"
            className="pp-act-btn pp-act-edit"
            onClick={() => onEdit(product)}
            title="Edit"
            disabled={!canManage}
          >
            <Edit size={15} />
          </button>

          <button
            type="button"
            className="pp-act-btn pp-act-delete"
            onClick={() => onDelete(rowKey)}
            title="Delete"
            disabled={!canManage}
          >
            <Trash2 size={15} />
          </button>

          <button
            type="button"
            className="pp-act-btn pp-act-copy"
            onClick={() => onCopySku(product)}
            title="Copy SKU"
            disabled={!canManage}
          >
            <Copy size={15} />
          </button>

          <button
            type="button"
            className="pp-act-btn pp-act-duplicate"
            onClick={() => onDuplicate(product)}
            title="Duplicate product"
            disabled={!canManage}
          >
            <Files size={15} />
          </button>

          <label className="pp-toggle" title={product.is_active ? 'Deactivate' : 'Activate'}>
            <input
              type="checkbox"
              checked={Boolean(product.is_active)}
              onChange={() => onToggleActive(product)}
              disabled={!canManage}
            />
            <span className="pp-toggle-slider" />
          </label>
        </div>
      </td>
    </tr>
  );
});

/* ===================== Product Modal ===================== */
const ProductModal = memo(function ProductModal({
  show, form, editingId, categories, previewSrc, error, submitting, canManage,
  onClose, onSubmit, onFieldChange, onSwitchImageMode, onFileChange,
  onImageUrlChange, onClearImage,
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

            <label className="span-2">
              Description
              <textarea
                className="text-input"
                placeholder="Optional product description"
                value={form.description}
                onChange={(e) => onFieldChange('description', e.target.value)}
                disabled={!canManage || submitting}
                rows={3}
                style={{ resize: 'vertical' }}
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
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
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

/* ===================== Main Page ===================== */
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
  const [stats, setStats] = useState({
    total_active_skus: 0,
    total_catalog_value: 0,
    missing_image_count: 0,
    missing_barcode_count: 0,
  });
  const [categories, setCategories] = useState([]);

  const [perPage, setPerPage] = useState(undefined);
  const [effectivePerPage, setEffectivePerPage] = useState(undefined);

  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...initialForm });
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 220);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [taxClassFilter, setTaxClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

const [showCategoryModal, setShowCategoryModal] = useState(false);
const [bulkCategoryId, setBulkCategoryId] = useState('');
const [showTaxModal, setShowTaxModal] = useState(false);
const [bulkVatRate, setBulkVatRate] = useState('');

  const [liveTime, setLiveTime] = useState(formatLiveTime());

  const categoriesRequestRef = useRef(0);
  const prevStoreIdRef = useRef(storeId);
  const pendingParamsRef = useRef(null);
  const inFlightRef = useRef(false);

  // Live ticking clock for header
  useEffect(() => {
    const id = setInterval(() => setLiveTime(formatLiveTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const previewSrc = useMemo(() => {
    if (form.clear_image) return '';
    if (form.image_mode === 'url') {
      return form.image_url_input.trim() || form.image_preview;
    }
    return form.image_preview;
  }, [form.clear_image, form.image_mode, form.image_preview, form.image_url_input]);

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

  // ── Sequential, queued product loader ──
  const runLoadProducts = useCallback(async ({
    storeId: targetStoreId,
    page: targetPage,
    search: targetSearch,
    perPage: targetPerPage,
    categoryFilter: targetCategory,
    taxClassFilter: targetTaxClass,
    statusFilter: targetStatus,
  }) => {
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
        ...(targetPerPage != null ? { per_page: targetPerPage } : {}),
        ...(targetCategory ? { category_id: targetCategory } : {}),
        ...(targetTaxClass ? { tax_class: targetTaxClass } : {}),
        ...(targetStatus !== '' && targetStatus != null
          ? { is_active: targetStatus }
          : {}),
      };

      const response = await productService.list(params);

      const parsed = extractPaginated(response, targetPerPage);
      setProducts(parsed.data || []);
      setMeta(parsed.meta || { ...EMPTY_META });

      if (parsed.meta?.per_page != null) {
        setEffectivePerPage(parsed.meta.per_page);
      }

      if (response?.stats) {
        setStats(response.stats);
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
      categoryFilter: 'categoryFilter' in params ? params.categoryFilter : categoryFilter,
      taxClassFilter: 'taxClassFilter' in params ? params.taxClassFilter : taxClassFilter,
      statusFilter: 'statusFilter' in params ? params.statusFilter : statusFilter,
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
  }, [storeId, page, debouncedSearch, perPage, categoryFilter, taxClassFilter, statusFilter, runLoadProducts]);

  // ── Categories loader ──
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

  useEffect(() => {
    const storeChanged = prevStoreIdRef.current !== storeId;
    prevStoreIdRef.current = storeId;

    if (storeChanged) {
      setProducts([]);
      setMeta({ ...EMPTY_META });
      setCategories([]);
      setShowModal(false);
      setSelectedIds(new Set());
      resetForm();
      setError('');

      if (search !== '' || page !== 1 || perPage !== undefined ||
          categoryFilter !== '' || taxClassFilter !== '' || statusFilter !== '') {
        setSearch('');
        setPage(1);
        setPerPage(undefined);
        setEffectivePerPage(undefined);
        setCategoryFilter('');
        setTaxClassFilter('');
        setStatusFilter('');
        return;
      }

      if (!storeId) setLoading(false);
    }

    loadProducts({
      storeId, page, search: debouncedSearch, perPage,
      categoryFilter, taxClassFilter, statusFilter,
    });
    loadCategories(storeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, debouncedSearch, page, perPage, categoryFilter, taxClassFilter, statusFilter]);

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
        formData.append('description', form.description || '');
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
          await loadProducts({
            storeId, page, search: debouncedSearch, perPage,
            categoryFilter, taxClassFilter, statusFilter,
          });
        }
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setSubmitting(false);
      }
    },
    [storeId, form, editingId, page, debouncedSearch, perPage,
     categoryFilter, taxClassFilter, statusFilter, loadProducts, resetForm]
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
        description: product.description || '',
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
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
        if (products.length === 1 && page > 1) {
          setPage((prev) => prev - 1);
        } else {
          await loadProducts({
            storeId, page, search: debouncedSearch, perPage,
            categoryFilter, taxClassFilter, statusFilter,
          });
        }
      } catch (err) {
        setError(formatApiError(err) || 'Unable to delete product.');
      }
    },
    [products.length, page, storeId, debouncedSearch, perPage,
     categoryFilter, taxClassFilter, statusFilter, loadProducts]
  );

  const handleDuplicate = useCallback((product) => {
    resetForm();
    setForm((prev) => ({
      ...prev,
      category_id: product.category_id || '',
      sku: `${product.sku || ''}-COPY`,
      product_name: `${product.product_name || ''} (Copy)`,
      description: product.description || '',
      price: product.price || '',
      cost_price: product.cost_price || '',
      vat_rate: product.vat_rate || 0,
      apply_vat: Number(product.vat_rate || 0) > 0,
      is_active: Boolean(product.is_active),
    }));
    setEditingId(null);
    setShowModal(true);
  }, [resetForm]);

  const handleCopySku = useCallback((product) => {
    if (!product?.sku) return;
    try {
      navigator.clipboard?.writeText(product.sku);
    } catch {
      /* ignore */
    }
  }, []);

const handleToggleActive = useCallback(async (product) => {
  const id = getProductId(product);
  if (!id) return;

  try {
    await productService.patch(id, {
      store_id: Number(product.store_id || storeId),
      is_active: product.is_active ? 0 : 1,
    });
    await loadProducts({
      storeId, page, search: debouncedSearch, perPage,
      categoryFilter, taxClassFilter, statusFilter,
    });
  } catch (err) {
    setError(formatApiError(err) || 'Unable to toggle product status.');
  }
}, [storeId, page, debouncedSearch, perPage,
    categoryFilter, taxClassFilter, statusFilter, loadProducts]);

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

  /* ── Selection helpers ── */
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = products.map(getProductId).filter(Boolean);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [products]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const allOnPageSelected = useMemo(() => {
    const allIds = products.map(getProductId).filter(Boolean);
    return allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  }, [products, selectedIds]);

/* ── Bulk actions ── */
const handleBulkClone = useCallback(async () => {
  if (selectedIds.size === 0) return;
  if (!window.confirm(`Clone ${selectedIds.size} selected product(s)?`)) return;
  try {
    const selected = products.filter((p) => selectedIds.has(getProductId(p)));
    await Promise.all(
      selected.map((p) => {
        const formData = new FormData();
        formData.append('store_id', String(Number(p.store_id || storeId)));
        formData.append('category_id', String(Number(p.category_id)));
        formData.append('sku', `${p.sku}-COPY`);
        formData.append('product_name', `${p.product_name} (Copy)`);
        formData.append('description', p.description || '');
        formData.append('price', String(Number(p.price)));
        formData.append('cost_price', String(Number(p.cost_price)));
        formData.append('vat_rate', String(Number(p.vat_rate || 0)));
        formData.append('is_active', p.is_active ? '1' : '0');
        if (p.image_url) formData.append('image_url', p.image_url);
        return productService.create(formData);
      })
    );
    clearSelection();
    await loadProducts({ storeId, page, search: debouncedSearch, perPage,
      categoryFilter, taxClassFilter, statusFilter });
  } catch (err) {
    setError(formatApiError(err) || 'Bulk clone failed.');
  }
}, [selectedIds, products, storeId, page, debouncedSearch, perPage,
    categoryFilter, taxClassFilter, statusFilter, loadProducts, clearSelection]);

const handleBulkChangeCategory = useCallback(() => {
  if (selectedIds.size === 0) return;
  setBulkCategoryId('');
  setShowCategoryModal(true);
}, [selectedIds]);

const handleBulkCategorySubmit = useCallback(async () => {
  if (!bulkCategoryId) return;
  try {
    await Promise.all(
      Array.from(selectedIds).map((id) => {
        const formData = new FormData();
        formData.append('category_id', String(Number(bulkCategoryId)));
        formData.append('_method', 'PUT');
        return productService.update(id, formData);
      })
    );
    setShowCategoryModal(false);
    clearSelection();
    await loadProducts({ storeId, page, search: debouncedSearch, perPage,
      categoryFilter, taxClassFilter, statusFilter });
  } catch (err) {
    setError(formatApiError(err) || 'Bulk category update failed.');
  }
}, [bulkCategoryId, selectedIds, storeId, page, debouncedSearch, perPage,
    categoryFilter, taxClassFilter, statusFilter, loadProducts, clearSelection]);

const handleBulkApplyTaxRate = useCallback(() => {
  if (selectedIds.size === 0) return;
  setBulkVatRate('');
  setShowTaxModal(true);
}, [selectedIds]);

const handleBulkTaxSubmit = useCallback(async () => {
  const rate = parseFloat(bulkVatRate);
  if (isNaN(rate) || rate < 0) return;
  try {
    await Promise.all(
      Array.from(selectedIds).map((id) => {
        const formData = new FormData();
        formData.append('vat_rate', String(rate));
        formData.append('_method', 'PUT');
        return productService.update(id, formData);
      })
    );
    setShowTaxModal(false);
    clearSelection();
    await loadProducts({ storeId, page, search: debouncedSearch, perPage,
      categoryFilter, taxClassFilter, statusFilter });
  } catch (err) {
    setError(formatApiError(err) || 'Bulk tax rate update failed.');
  }
}, [bulkVatRate, selectedIds, storeId, page, debouncedSearch, perPage,
    categoryFilter, taxClassFilter, statusFilter, loadProducts, clearSelection]);

  const handleBulkExport = useCallback(() => {
    if (selectedIds.size === 0) return;
    const selected = products.filter((p) => selectedIds.has(getProductId(p)));
    const rows = [
      ['SKU', 'Product Name', 'Category', 'Price', 'Cost Price', 'VAT Rate', 'Status'],
      ...selected.map((p) => [
        p.sku,
        p.product_name,
        p.category?.category_name || '',
        p.price,
        p.cost_price,
        p.vat_rate || 0,
        p.is_active ? 'Active' : 'Inactive',
      ]),
    ];
    const csv = rows.map((r) =>
      r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [products, selectedIds]);

  // const handleBulkChangeCategory = useCallback(() => {
  //   if (selectedIds.size === 0) return;
  //   alert('Bulk change category — wire to your backend bulk endpoint.');
  // }, [selectedIds]);

  // const handleBulkApplyTaxRate = useCallback(() => {
  //   if (selectedIds.size === 0) return;
  //   alert('Bulk apply tax rate — wire to your backend bulk endpoint.');
  // }, [selectedIds]);

  const tableRows = useMemo(
    () =>
      products.map((product) => (
        <ProductRow
          key={getProductId(product)}
          product={product}
          currencyCode={currentStore?.currency}
          canManage={canManage}
          selected={selectedIds.has(getProductId(product))}
          onToggleSelect={toggleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onCopySku={handleCopySku}
          onToggleActive={handleToggleActive}
          storeId={storeId}
        />
      )),
    [products, currentStore?.currency, canManage, selectedIds, toggleSelect,
     handleEdit, handleDelete, handleDuplicate, handleCopySku, handleToggleActive, storeId]
  );

  const displayedPerPage = effectivePerPage ?? meta.per_page ?? '';

  const perPageOptions = useMemo(() => {
    const opts = new Set(PER_PAGE_OPTIONS);
    if (displayedPerPage !== '') opts.add(Number(displayedPerPage));
    return Array.from(opts).sort((a, b) => a - b);
  }, [displayedPerPage]);

  const currencyCode = currentStore?.currency || 'KSH';

  return (
    <>
      <div className="products-page-wrapper pp-page">
        {/* ===== Header ===== */}
        <div className="pp-header">
          <div>
            <h2 className="pp-title">Products</h2>
            <p className="pp-subtitle">
              {meta.from && meta.to
                ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
                : `${products.length} products in catalog`}
            </p>
          </div>
          <div className="pp-header-right">
            <span className="pp-clock">{liveTime}</span>
            <button
              type="button"
              className="pp-new-btn"
              onClick={openCreateModal}
              disabled={!storeId || !canManage}
            >
              <Plus size={16} /> New product
            </button>
          </div>
        </div>

        {/* ===== Summary Cards ===== */}
        <div className="pp-summary-grid">
          <div className="pp-summary-card">
            <div className="pp-summary-icon pp-tone-blue">
              <Database size={20} />
            </div>
            <div className="pp-summary-body">
              <span className="pp-summary-label">Total Active SKUs</span>
              <strong className="pp-summary-value">{stats.total_active_skus}</strong>
              {/* <a className="pp-drilldown" href="#">Drill down ›</a> */}
            </div>
          </div>

          <div className="pp-summary-card">
            <div className="pp-summary-icon pp-tone-green">
              <Wallet size={20} />
            </div>
            <div className="pp-summary-body">
              <span className="pp-summary-label">Total Catalog Value (Retail {currencyCode})</span>
              <strong className="pp-summary-value">
                {currency(stats.total_catalog_value, currencyCode)}
              </strong>
              {/* <a className="pp-drilldown" href="#">Drill down ›</a> */}
            </div>
          </div>

          <div className="pp-summary-card">
            <div className="pp-summary-icon pp-tone-red">
              <AlertTriangle size={20} />
            </div>
            <div className="pp-summary-body">
              <span className="pp-summary-label">Missing Data Warnings</span>
              <div className="pp-summary-warn-list">
                <span>{stats.missing_image_count} items missing image</span>
                <span>{stats.missing_barcode_count} missing barcodes</span>
              </div>
              {/* <a className="pp-drilldown" href="#">Drill down ›</a> */}
            </div>
          </div>
        </div>

        {/* ===== Filter Toolbar ===== */}
        <div className="pp-toolbar">
          <div className="pp-search-wrap">
            <Search size={15} className="pp-search-icon" />
            <input
              type="text"
              className="pp-input pp-search-input"
              placeholder="Search product"
              value={search}
              onChange={handleSearchChange}
              disabled={!storeId}
            />
          </div>

          <div className="pp-select-wrap">
            <select
              className="pp-input pp-select"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              disabled={!storeId}
            >
              <option value="">Category</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.category_name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pp-select-caret" />
          </div>

          <div className="pp-select-wrap">
            <select
              className="pp-input pp-select"
              value={taxClassFilter}
              onChange={(e) => { setTaxClassFilter(e.target.value); setPage(1); }}
              disabled={!storeId}
            >
              <option value="">Tax Class</option>
              <option value="vat">VAT applied</option>
              <option value="no_vat">No VAT</option>
            </select>
            <ChevronDown size={14} className="pp-select-caret" />
          </div>

          <div className="pp-select-wrap">
            <select
              className="pp-input pp-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              disabled={!storeId}
            >
              <option value="">Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <ChevronDown size={14} className="pp-select-caret" />
          </div>

          <div className="pp-select-wrap pp-perpage-wrap">
            <select
              className="pp-input pp-select"
              value={displayedPerPage}
              onChange={handlePerPageChange}
              disabled={!storeId}
            >
              {perPageOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pp-select-caret" />
          </div>

          <div className="pp-storeid-label">Store ID: {storeId || '-'}</div>
        </div>

        {error && !showModal ? <p className="form-error">{error}</p> : null}

        {/* ===== Table ===== */}
        <div className="pp-table-card">
          <div className="table-wrap">
            <table className="data-table pp-table">
              <thead>
                <tr>
                  <th className="pp-cell-checkbox">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      disabled={!canManage || products.length === 0}
                    />
                  </th>
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
                    <td colSpan="7">Select a store first.</td>
                  </tr>
                ) : products.length ? (
                  tableRows
                ) : !loading ? (
                  <tr>
                    <td colSpan="7">No products found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {storeId ? (
            <div className="pp-pagination">
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
        </div>

        {/* ===== Floating Bulk Actions Bar ===== */}
        {selectedIds.size > 0 ? (
          <div className="pp-bulk-bar">
            <div className="pp-bulk-icons">
              <Files size={15} />
              <Trash2 size={15} />
            </div>
            <span className="pp-bulk-title">Bulk Actions:</span>
            <button type="button" className="pp-bulk-link" onClick={handleBulkClone}>
              Clone
            </button>
            <span className="pp-bulk-sep">|</span>
            <button type="button" className="pp-bulk-link" onClick={handleBulkChangeCategory}>
              Change Category
            </button>
            <span className="pp-bulk-sep">|</span>
            <button type="button" className="pp-bulk-link" onClick={handleBulkApplyTaxRate}>
              Apply Tax Rate
            </button>
            <span className="pp-bulk-sep">|</span>
            <button type="button" className="pp-bulk-link" onClick={handleBulkExport}>
              Export
            </button>
            <button type="button" className="pp-bulk-close" onClick={clearSelection}>
              <ChevronDown size={14} />
            </button>
          </div>
        ) : null}
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
            {showCategoryModal && (
        <div className="modal-backdrop" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-card form-modal-card" style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Change Category</h3>
                <p className="muted">Apply to {selectedIds.size} selected product(s).</p>
              </div>
              <button type="button" className="icon-button"
                onClick={() => setShowCategoryModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-content" style={{ display: 'grid', gap: 14 }}>
              <label>
                New category
                <select className="select-input" value={bulkCategoryId}
                  onChange={(e) => setBulkCategoryId(e.target.value)}>
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.category_name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="catalog-modal-actions">
                <button type="button" className="ghost-button"
                  onClick={() => setShowCategoryModal(false)}>Cancel</button>
                <button type="button" className="catalog-primary-btn"
                  onClick={handleBulkCategorySubmit}
                  disabled={!bulkCategoryId}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Apply Tax Rate Modal ── */}
      {showTaxModal && (
        <div className="modal-backdrop" onClick={() => setShowTaxModal(false)}>
          <div className="modal-card form-modal-card" style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Apply Tax Rate</h3>
                <p className="muted">Set VAT for {selectedIds.size} selected product(s).</p>
              </div>
              <button type="button" className="icon-button"
                onClick={() => setShowTaxModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-content" style={{ display: 'grid', gap: 14 }}>
              <label>
                VAT rate (%) — use 0 to remove VAT
                <input className="text-input" type="number" min="0" step="0.01"
                  placeholder="e.g. 16"
                  value={bulkVatRate}
                  onChange={(e) => setBulkVatRate(e.target.value)} />
              </label>
              <div className="catalog-modal-actions">
                <button type="button" className="ghost-button"
                  onClick={() => setShowTaxModal(false)}>Cancel</button>
                <button type="button" className="catalog-primary-btn"
                  onClick={handleBulkTaxSubmit}
                  disabled={bulkVatRate === ''}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
