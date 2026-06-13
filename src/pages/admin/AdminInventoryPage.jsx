import { Edit, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inventoryService } from '../../services/inventoryService';
import { productService } from '../../services/productService';
import { useStore } from '../../contexts/StoreContext';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';
import { useAuth } from '../../contexts/AuthContext';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

const initialForm = {
  product_id: '',
  batch_no: '',
  quantity: '',
  reorder_level: 0,
};

const extractList = (res) => {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
};


const useDebouncedValue = (value, delay = 350) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value, delay));
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

const getInventoryStatus = (row) => {
  const quantity = Number(row?.quantity || 0);
  const reorder = Number(row?.reorder_level || 0);

  if (quantity <= 0) return { label: 'Out of stock', tone: 'out' };
  if ((reorder > 0 && quantity <= reorder) || quantity <= 12) {
    return { label: 'Low stock', tone: 'low' };
  }
  return { label: 'In stock', tone: 'normal' };
};

const getHistoryTone = (value) => {
  const qty = Number(value || 0);
  if (qty > 0) return 'success';
  if (qty < 0) return 'danger';
  return 'neutral';
};

const formatSignedQty = (value) => {
  const qty = Number(value || 0);
  if (qty > 0) return `+${qty}`;
  return `${qty}`;
};

export default function AdminInventoryPage() {
  const { can } = useAuth();
  const canManage = can('inventory.manage'); 
  const { storeId } = useStore();

  const [rows, setRows] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [products, setProducts] = useState([]);

const [inventoryPagination, setInventoryPagination] = useState({ ...EMPTY_META });
const [historyPagination, setHistoryPagination]     = useState({ ...EMPTY_META });

const [inventoryPage, setInventoryPage] = useState(1);
const [historyPage, setHistoryPage]     = useState(1);

const [pageSize, setPageSize]                       = useState(null);
const [historyPageSize, setHistoryPageSize]         = useState(null); 

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);

  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  const inventoryRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const productsRequestRef = useRef(0);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
  };

  const loadProducts = useCallback(async () => {
    if (!storeId) {
      setProducts([]);
      return;
    }

    const requestId = ++productsRequestRef.current;
    setProductsLoading(true);

    try {
      const productsRes = await productService.list({
        store_id: storeId,
        per_page: 100,
      });

      if (requestId !== productsRequestRef.current) return;
      setProducts(extractList(productsRes));
    } catch (err) {
      if (requestId !== productsRequestRef.current) return;
      setProducts([]);
      setError(err?.response?.data?.message || err?.message || 'Unable to load products.');
    } finally {
      if (requestId === productsRequestRef.current) {
        setProductsLoading(false);
      }
    }
  }, [storeId]);

const loadInventory = useCallback(
  async (targetPage = inventoryPage, keyword = debouncedSearch, targetPageSize = pageSize) => {
    if (!storeId) {
      setRows([]);
      setInventoryPagination({ ...EMPTY_META });
      return;
    }

    const requestId = ++inventoryRequestRef.current;
    setLoading(true);

    try {
      const inventoryRes = await inventoryService.list({
        store_id: storeId,
        page: targetPage,
        per_page: targetPageSize ?? 5, // safe fallback for first request
        ...(keyword ? { search: keyword } : {}),
      });

      if (requestId !== inventoryRequestRef.current) return;

      const parsed = extractPaginated(inventoryRes, targetPageSize ?? 5);
      setRows(parsed.data || []);
      setInventoryPagination(parsed.meta);

      // Bootstrap pageSize from backend on first load
      if (pageSize === null) setPageSize(parsed.meta.per_page);
    } catch (err) {
      if (requestId !== inventoryRequestRef.current) return;
      setRows([]);
      setInventoryPagination({ ...EMPTY_META });
      setError(err?.response?.data?.message || err?.message || 'Unable to load inventory.');
    } finally {
      if (requestId === inventoryRequestRef.current) setLoading(false);
    }
  },
  [storeId, inventoryPage, debouncedSearch, pageSize]
);

const loadHistory = useCallback(
  async (targetPage = historyPage, keyword = debouncedSearch, targetPageSize = historyPageSize) => {
    if (!storeId) {
      setHistoryRows([]);
      setHistoryPagination({ ...EMPTY_META });
      return;
    }

    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);

    try {
      const historyRes = await inventoryService.history({
        store_id: storeId,
        page: targetPage,
        per_page: targetPageSize ?? 10, // safe fallback
        ...(keyword ? { search: keyword } : {}),
      });

      if (requestId !== historyRequestRef.current) return;

      const parsed = extractPaginated(historyRes, targetPageSize ?? 10);
      setHistoryRows(parsed.data || []);
      setHistoryPagination(parsed.meta);

      // Bootstrap historyPageSize from backend on first load
      if (historyPageSize === null) setHistoryPageSize(parsed.meta.per_page);
    } catch (err) {
      if (requestId !== historyRequestRef.current) return;
      setHistoryRows([]);
      setHistoryPagination({ ...EMPTY_META });
      setError(err?.response?.data?.message || err?.message || 'Unable to load inventory history.');
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  },
  [storeId, historyPage, debouncedSearch, historyPageSize]
);

  useEffect(() => {
    setRows([]);
    setHistoryRows([]);
    setProducts([]);
 setInventoryPagination({ ...EMPTY_META }); // ← was emptyPagination
  setHistoryPagination({ ...EMPTY_META }); 
    setInventoryPage(1);
    setHistoryPage(1);
    setPageSize(null);
    setHistoryPageSize(null);
    setSearch('');
    setShowModal(false);
    resetForm();

    if (!storeId) {
      setLoading(false);
      setHistoryLoading(false);
      setProductsLoading(false);
      return;
    }

    loadProducts();
  }, [storeId, loadProducts]);

  useEffect(() => {
    if (!storeId) return;
    loadInventory(inventoryPage, debouncedSearch, pageSize);
  }, [storeId, inventoryPage, debouncedSearch, pageSize, loadInventory]);

  useEffect(() => {
    if (!storeId) return;
    loadHistory(historyPage, debouncedSearch, historyPageSize);
  }, [storeId, historyPage, debouncedSearch, historyPageSize, loadHistory]);

  const lowStockCount = useMemo(
    () => rows.filter((row) => getInventoryStatus(row).tone === 'low').length,
    [rows]
  );

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
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        store_id: Number(storeId),
        product_id: Number(form.product_id),
        batch_no: form.batch_no.trim(),
        quantity: Number(form.quantity),
        reorder_level: Number(form.reorder_level || 0),
      };

      if (editingId) {
        await inventoryService.update(editingId, payload);
      } else {
        await inventoryService.create(payload);
      }

      setShowModal(false);
      resetForm();

      const nextInventoryPage = 1;
      const nextHistoryPage = 1;

      setInventoryPage(nextInventoryPage);
      setHistoryPage(nextHistoryPage);

      await Promise.all([
        loadInventory(nextInventoryPage, debouncedSearch, pageSize),
        loadHistory(nextHistoryPage, debouncedSearch, historyPageSize),
      ]);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to save inventory.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (row) => {
    setEditingId(row.inventory_id);
    setForm({
      product_id: row.product_id,
      batch_no: row.batch_no || '',
      quantity: '',          // ← was row.quantity; blank so user types the top-up amount
      reorder_level: row.reorder_level || 0,
    });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (inventoryId) => {
    if (!window.confirm('Delete this inventory row? Quantity must be zero.')) return;

    try {
      setError('');
      await inventoryService.remove(inventoryId);

      const nextPage =
        rows.length === 1 && inventoryPagination.current_page > 1
          ? inventoryPagination.current_page - 1
          : inventoryPagination.current_page;

      setInventoryPage(nextPage);
      await loadInventory(nextPage, debouncedSearch, pageSize);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to delete inventory.');
    }
  };

  return (
    <>
      <section className="inventory-page stack-lg">
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
            <h2 className="catalog-title">Inventory</h2>
            <p className="catalog-subtitle">
              {inventoryPagination.total} stock lines
              {lowStockCount ? ` • ${lowStockCount} low stock on this page` : ''}
              {loading && rows.length ? ' • refreshing...' : ''}
            </p>
          </div>

          <button
            type="button"
            className="ghost-button"
            onClick={openCreateModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
            disabled={!storeId || productsLoading}
          >
            <Plus size={16} />
            <span>Add stock line</span>
          </button>
        </div>

        <div className="catalog-toolbar">
          <label className="catalog-search">
            <span className="catalog-search-icon">
              <Search size={16} />
            </span>
            <input
              className="text-input"
              type="text"
              placeholder="Search product, SKU, batch"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setInventoryPage(1);
                setHistoryPage(1);
              }}
              disabled={!storeId}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="muted">Show</span>
<select
  className="select-input"
  value={pageSize ?? 5}
  onChange={(e) => { setPageSize(Number(e.target.value)); setInventoryPage(1); }}
  disabled={!storeId || pageSize === null}
>
  {PAGE_SIZE_OPTIONS.map((size) => (
    <option key={size} value={size}>{size}</option>
  ))}
</select>
          </label>

          <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
        </div>

        {error && !showModal ? <p className="form-error">{error}</p> : null}

        <article className="catalog-table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch no</th>
                  <th>Quantity</th>
                  <th>Reorder level</th>
                  <th>Status</th>
                  <th className="align-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {!storeId ? (
                  <tr>
                    <td colSpan="6" className="catalog-empty-cell">
                      Select a store first.
                    </td>
                  </tr>
                ) : loading && !rows.length ? (
                  <tr>
                    <td colSpan="6" className="catalog-empty-cell">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((row) => {
                    const status = getInventoryStatus(row);

                    return (
                      <tr key={row.inventory_id}>
                        <td>
                          <div className="catalog-item-copy">
                            <strong>{row.product?.product_name || 'Unknown product'}</strong>
                            <span>{row.product?.sku || 'No SKU'}</span>
                          </div>
                        </td>

                        <td>{row.batch_no || '—'}</td>
                        <td>{row.quantity}</td>
                        <td>{row.reorder_level || 0}</td>
                        <td>
                          <span className={`stock-pill ${status.tone}`}>{status.label}</span>
                        </td>

                        <td>
                          <div className="catalog-action-group">
                            <button
                              type="button"
                              className="catalog-icon-btn"
                              onClick={() => handleEdit(row)}
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>

                            <button
                              type="button"
                              className="catalog-icon-btn danger"
                              onClick={() => handleDelete(row.inventory_id)}
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
                    <td colSpan="6" className="catalog-empty-cell">
                      No inventory rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {storeId ? (
            <div
              className="row-actions"
              style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}
            >
              <span className="muted">
                {inventoryPagination.from && inventoryPagination.to
                  ? `Showing ${inventoryPagination.from}-${inventoryPagination.to} of ${inventoryPagination.total}`
                  : `Page ${inventoryPagination.current_page} of ${inventoryPagination.last_page}`}
              </span>

              <div className="row-actions compact">
<button
  onClick={() => setInventoryPage(Math.max(inventoryPagination.current_page - 1, 1))}
  disabled={loading || !inventoryPagination.has_prev_page} // ← cleaner
>
  Previous
</button>

<button
  onClick={() => setInventoryPage(Math.min(inventoryPagination.current_page + 1, inventoryPagination.last_page))}
  disabled={loading || !inventoryPagination.has_next_page} // ← cleaner
>
  Next
</button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="catalog-table-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div className="catalog-hero-copy">
              <h3 className="catalog-title" style={{ fontSize: '1.05rem' }}>
                Inventory history
              </h3>
              <p className="catalog-subtitle">
                {historyLoading && historyRows.length ? 'Refreshing history...' : ''}
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted">Show</span>
<select
  className="select-input"
  value={historyPageSize ?? 10}
  onChange={(e) => { setHistoryPageSize(Number(e.target.value)); setHistoryPage(1); }}
  disabled={!storeId || historyPageSize === null}
>
  {PAGE_SIZE_OPTIONS.map((size) => (
    <option key={size} value={size}>{size}</option>
  ))}
</select>
            </label>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Batch no</th>
                  <th>Change</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Action</th>
                  <th>Reference / User</th>
                </tr>
              </thead>

              <tbody>
                {!storeId ? (
                  <tr>
                    <td colSpan="8" className="catalog-empty-cell">
                      Select a store first.
                    </td>
                  </tr>
                ) : historyLoading && !historyRows.length ? (
                  <tr>
                    <td colSpan="8" className="catalog-empty-cell">
                      Loading history...
                    </td>
                  </tr>
                ) : historyRows.length ? (
                  historyRows.map((row) => (
                    <tr key={row.inventory_history_id}>
                      <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                      <td>
                        <div className="catalog-item-copy">
                          <strong>{row.product?.product_name || 'Unknown product'}</strong>
                          <span>{row.product?.sku || 'No SKU'}</span>
                        </div>
                      </td>
                      <td>{row.batch_no || '—'}</td>
                      <td>
                        <span
                          className={`history-change-pill ${getHistoryTone(row.quantity_changed)}`}
                        >
                          {formatSignedQty(row.quantity_changed)}
                        </span>
                      </td>
                      <td>{row.quantity_before ?? 0}</td>
                      <td>{row.quantity_after ?? 0}</td>
                      <td>{row.change_type || '-'}</td>
                      <td>
                        <div className="catalog-item-copy">
                          <strong>{row.reference || '—'}</strong>
                          <span>
                            {row.user?.full_name ||
                              row.user?.name ||
                              row.user?.email ||
                              'System'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="catalog-empty-cell">
                      No inventory history found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {storeId ? (
            <div
              className="row-actions"
              style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}
            >
              <span className="muted">
                {historyPagination.from && historyPagination.to
                  ? `Showing ${historyPagination.from}-${historyPagination.to} of ${historyPagination.total}`
                  : `Page ${historyPagination.current_page} of ${historyPagination.last_page}`}
              </span>

              <div className="row-actions compact">
<button
  onClick={() => setHistoryPage(Math.max(historyPagination.current_page - 1, 1))}
  disabled={historyLoading || !historyPagination.has_prev_page}
>
  Previous
</button>

<button
  onClick={() => setHistoryPage(Math.min(historyPagination.current_page + 1, historyPagination.last_page))}
  disabled={historyLoading || !historyPagination.has_next_page}
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
          <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingId ? 'Update stock' : 'Receive stock'}</h3>
                <p className="muted">
                  {editingId
                    ? 'Update quantity, reorder threshold, and batch number.'
                    : 'Each stock receipt creates a new FIFO inventory layer.'}
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
                <label className="span-2">
                  Product
                  <select
                    className="select-input"
                    value={form.product_id}
                    onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                    required
                    disabled={Boolean(editingId) || productsLoading}
                  >
                    <option value="">
                      {productsLoading ? 'Loading products...' : 'Select product'}
                    </option>
                    {products.map((product) => (
                      <option key={product.product_id} value={product.product_id}>
                        {product.product_name} ({product.sku})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Batch no
                  <input
                    className="text-input"
                    type="text"
                    placeholder="e.g. BATCH-2026-001"
                    value={form.batch_no}
                    onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                    disabled={Boolean(editingId)}
                  />
                </label>

                <label>
                  {editingId ? 'Quantity to add' : 'Incoming quantity'}
                  <input
                    className="text-input"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </label>

                <label className="span-2">
                  Reorder level
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    value={form.reorder_level}
                    onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                  />
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
                  <button className="catalog-primary-btn" type="submit" disabled={submitting}>
                    {editingId ? 'Update inventory' : 'Receive stock'}
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
