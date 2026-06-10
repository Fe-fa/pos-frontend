import { Plus, X, Edit, Trash2, ChevronDown  } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { categoryService } from '../../services/categoryService';
import { productService } from '../../services/productService';
import { currency } from '../../utils/helpers';
import { useStore } from '../../contexts/StoreContext';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';

const IMAGE_BASE_URL =
  import.meta.env.VITE_STORAGE_URL ||
  `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/storage/`;

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

export default function AdminProductsPage() {
  const { stores, storeId } = useStore();
  const currentStore = stores.find(
    (store) => String(store.store_id) === String(storeId)
  );

  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ ...EMPTY_META });
const [perPage, setPerPage] = useState(12);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const previewSrc = useMemo(() => {
    if (form.clear_image) return '';
    if (form.image_mode === 'url') return form.image_url_input.trim();
    return form.image_preview;
  }, [form.clear_image, form.image_mode, form.image_preview, form.image_url_input]);

  const load = async () => {
    if (!storeId) {
      setProducts([]);
      setCategories([]);
      setMeta({ ...EMPTY_META });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const productParams = {
        page,
        store_id: storeId,
        per_page: perPage,
        ...(search.trim() ? { search: search.trim() } : {}),
      };

      const [productsRes, categoriesRes] = await Promise.all([
        productService.list(productParams),
        categoryService.list({ store_id: storeId, per_page: 100 }),
      ]);

      const parsed = extractPaginated(productsRes, perPage);
      setProducts(parsed.data || []);
      setMeta(parsed.meta || { ...EMPTY_META });
      setCategories(extractList(categoriesRes));
    } catch (err) {
      setError(formatApiError(err) || 'Unable to load products.');
      setProducts([]);
      setMeta({ ...EMPTY_META });
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  // Reset everything when store changes
  useEffect(() => {
    setProducts([]);
    setMeta({ ...EMPTY_META });
    setCategories([]);
    setSearch('');
    setShowModal(false);
    setEditingId(null);
    setForm(initialForm);
    setError('');
    setPage(1);

    if (!storeId) {
      setLoading(false);
    }
  }, [storeId]);

  // Reload when store, search, or page changes
  useEffect(() => {
    load();
  }, [storeId, search, page, perPage]);

  // Revoke blob URL on unmount / preview change
  useEffect(() => {
    return () => {
      if (form.image_preview?.startsWith('blob:')) {
        URL.revokeObjectURL(form.image_preview);
      }
    };
  }, [form.image_preview]);

  const resetForm = () => {
    if (form.image_preview?.startsWith('blob:')) {
      URL.revokeObjectURL(form.image_preview);
    }
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

  const switchImageMode = (mode) => {
    setForm((prev) => ({
      ...prev,
      image_mode: mode,
      image_file: mode === 'upload' ? prev.image_file : null,
      image_url_input: mode === 'url' ? prev.image_url_input : '',
      clear_image: false,
    }));
  };

  const handleFileChange = (file) => {
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

    if (form.image_preview?.startsWith('blob:')) {
      URL.revokeObjectURL(form.image_preview);
    }

    const localPreview = URL.createObjectURL(file);

    setError('');
    setForm((prev) => ({
      ...prev,
      image_mode: 'upload',
      image_file: file,
      image_url_input: '',
      image_preview: localPreview,
      clear_image: false,
    }));
  };

  const handleImageUrlChange = (value) => {
    setError('');
    setForm((prev) => ({
      ...prev,
      image_mode: 'url',
      image_file: null,
      image_url_input: value,
      clear_image: false,
    }));
  };

  const clearCurrentImage = () => {
    if (form.image_preview?.startsWith('blob:')) {
      URL.revokeObjectURL(form.image_preview);
    }

    setForm((prev) => ({
      ...prev,
      image_file: null,
      image_url_input: '',
      image_preview: '',
      clear_image: true,
    }));
  };

  const handleSubmit = async (e) => {
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
      formData.append('vat_rate', String(form.apply_vat ? Number(form.vat_rate || 0) : 0));
      formData.append('is_active', form.is_active ? '1' : '0');
      formData.append('clear_image', form.clear_image ? '1' : '0');

      if (form.image_mode === 'upload' && form.image_file instanceof File) {
        formData.append('image', form.image_file);
      } else if (form.image_mode === 'url' && form.image_url_input.trim()) {
        formData.append('image_url', form.image_url_input.trim());
      }

      if (editingId) {
        formData.append('_method', 'PUT');
      }

      if (editingId) {
        await productService.update(editingId, formData);
      } else {
        await productService.create(formData);
      }

      setShowModal(false);
      resetForm();

      // If we just created a product go to page 1 so it appears at top
      if (!editingId) {
        setPage(1);
      } else {
        await load();
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

const handleEdit = (product) => {
  const id = product.product_uuid ?? product.uuid ?? product.product_id;
  
  if (!id) {
    console.warn('No valid ID found on product:', product);
    return;
  }

  setEditingId(id);
  setForm({
    category_id:     product.category_id || '',
    sku:             product.sku || '',
    product_name:    product.product_name || '',
    price:           product.price || '',
    cost_price:      product.cost_price || '',
    vat_rate:        product.vat_rate || '',
    apply_vat:       Number(product.vat_rate || 0) > 0,
    is_active:       Boolean(product.is_active),
    image_mode:      'upload',
    image_file:      null,
    image_url_input: '',
    image_preview:   product.image_url || '',
    clear_image:     false,
  });
  setError('');
  setShowModal(true);
};

  const handleDelete = async (productId) => {
    if (!window.confirm('Delete this product?')) return;

    try {
      await productService.remove(productId);

      if (products.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await load();
      }
    } catch (err) {
      setError(formatApiError(err) || 'Unable to delete product.');
    }
  };

  // ─── Helper: resolve image src from product ──────────────────────────────────
  const resolveImageSrc = (product) => {
    if (product.image_url) return product.image_url;
    if (product.image) {
      return product.image.startsWith('http')
        ? product.image
        : `${IMAGE_BASE_URL}${product.image}`;
    }
    return null;
  };

  return (
    <>
      <section className="stack-lg">
        <div
          className="catalog-hero"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
        >
          <div className="catalog-hero-copy" style={{ display: 'flex', flexDirection: 'column' }}>
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
            disabled={!storeId}
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1); // reset to page 1 on new search
              }}
              disabled={!storeId}
            />
          </label>
<div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
  <ChevronDown
    size={14}
    style={{ position: 'absolute', right: 8, pointerEvents: 'none', color: 'var(--color-text-secondary)' }}
  />
  <select
    className="text-input"
    value={perPage}
    onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
    disabled={!storeId}
    style={{ width: 'auto', paddingRight: 28, appearance: 'none' }}
  >
    {[12, 24, 48, 100].map(n => (
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
                ) : loading ? (
                  <tr>
                    <td colSpan="6">Loading...</td>
                  </tr>
                ) : products.length ? (
                  products.map((product) => {
                    // ─── Fix #2: safe key — uuid first, product_id as fallback ───
                    const rowKey = product.product_uuid ?? product.product_id;
                    const imageSrc = resolveImageSrc(product);

                    return (
                      <tr key={rowKey}>
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
                          <div>{currency(product.price, currentStore?.currency)}</div>
                          <div className="muted">
                            Cost {currency(product.cost_price, currentStore?.currency)}
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
                              onClick={() => handleEdit(product)}
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              className="ghost-button danger"
                              onClick={() => handleDelete(product.product_uuid)}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6">No products found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ─── Pagination controls ─────────────────────────────────────────── */}
          {storeId ? (
            <div
              className="row-actions"
              style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}
            >
              <span className="muted">Page {meta.current_page} of {meta.last_page}</span>

              <div className="row-actions compact">
<button
  type="button"
  className="ghost-button"
  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
  disabled={!meta.has_prev_page || loading} 
>
  Previous
</button>

<button
  type="button"
  className="ghost-button"
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

      {showModal ? (
        <div className="modal-backdrop" onClick={closeModal}>
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
                onClick={closeModal}
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <form className="catalog-form-grid" onSubmit={handleSubmit}>
                <label>
                  Category
                  <select
                    className="select-input"
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    required
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
                    readOnly={editingId} // Prevent SKU changes when editing
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    required
                  />
                </label>

                <label>
                  Product name
                  <input
                    className="text-input"
                    placeholder="Enter product name"
                    value={form.product_name}
                    onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                    required
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
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
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
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    required
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
    disabled={!form.apply_vat}
    onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
    placeholder={form.apply_vat ? 'Enter VAT rate' : 'Enable VAT first'}
  />
</label>

                <div className="span-2 image-source-switch">
                  <button
                    type="button"
                    className={`chip ${form.image_mode === 'upload' ? 'active' : ''}`}
                    onClick={() => switchImageMode('upload')}
                  >
                    Upload file
                  </button>

                  <button
                    type="button"
                    className={`chip ${form.image_mode === 'url' ? 'active' : ''}`}
                    onClick={() => switchImageMode('url')}
                  >
                    Image URL
                  </button>

                  {previewSrc ? (
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={clearCurrentImage}
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
                      onChange={(e) => handleFileChange(e.target.files?.[0])}
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
                      onChange={(e) => handleImageUrlChange(e.target.value)}
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
                          : form.image_mode === 'url'
                            ? `URL: ${form.image_url_input || '-'}`
                            : 'Current saved image'}
                      </p>
                    </div>
                  </div>
                ) : null}

<label className="checkbox-row span-2 catalog-check">
  <input
    type="checkbox"
    checked={form.apply_vat}
    onChange={(e) =>
      setForm({
        ...form,
        apply_vat: e.target.checked,
        vat_rate: e.target.checked ? (form.vat_rate || 0) : 0,  // ← 0 not ''
      })
    }
  />
  <span>Apply VAT for this product</span>
</label>

                <label className="checkbox-row span-2 catalog-check">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  <span>Product is active in cashier</span>
                </label>

                {error ? <p className="form-error span-2">{error}</p> : null}

                <div className="catalog-modal-actions span-2">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={closeModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    className="catalog-primary-btn"
                    type="submit"
                    disabled={submitting}
                  >
                    {editingId ? 'Update product' : 'Create product'}
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
