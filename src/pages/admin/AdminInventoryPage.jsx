import { Edit, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { inventoryService } from '../../services/inventoryService';
import { productService } from '../../services/productService';
import { useStore } from '../../contexts/StoreContext';

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
  const { storeId } = useStore();

  const [rows, setRows] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
  };

  const load = async () => {
    if (!storeId) {
      setRows([]);
      setProducts([]);
      setHistoryRows([]);
      setLoading(false);
      setHistoryLoading(false);
      return;
    }

    setLoading(true);
    setHistoryLoading(true);
    setError('');

    try {
      const [inventoryRes, productsRes, historyRes] = await Promise.all([
        inventoryService.list({ store_id: storeId, per_page:5 }),
        productService.list({ store_id: storeId, per_page:10 }),
        inventoryService.history({ store_id: storeId, per_page:5 }),
      ]);

      setRows(extractList(inventoryRes));
      setProducts(extractList(productsRes));
      setHistoryRows(extractList(historyRes));
    } catch (err) {
      setError(err?.message || 'Unable to load inventory.');
      setRows([]);
      setProducts([]);
      setHistoryRows([]);
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    setRows([]);
    setProducts([]);
    setHistoryRows([]);
    setSearch('');
    setShowModal(false);
    resetForm();

    if (!storeId) {
      setLoading(false);
      setHistoryLoading(false);
      return;
    }

    load();
  }, [storeId]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const name = row?.product?.product_name?.toLowerCase() || '';
      const sku = row?.product?.sku?.toLowerCase() || '';
      const batch = row?.batch_no?.toLowerCase() || '';
      return name.includes(keyword) || sku.includes(keyword) || batch.includes(keyword);
    });
  }, [rows, search]);

  const filteredHistoryRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return historyRows;

    return historyRows.filter((row) => {
      const name = row?.product?.product_name?.toLowerCase() || '';
      const sku = row?.product?.sku?.toLowerCase() || '';
      const batch = row?.batch_no?.toLowerCase() || '';
      const reference = row?.reference?.toLowerCase() || '';
      return (
        name.includes(keyword) ||
        sku.includes(keyword) ||
        batch.includes(keyword) ||
        reference.includes(keyword)
      );
    });
  }, [historyRows, search]);

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
      await load();
    } catch (err) {
      setError(err?.message || 'Unable to save inventory.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (row) => {
    setEditingId(row.inventory_id);
    setForm({
      product_id: row.product_id,
      batch_no: row.batch_no || '',
      quantity: row.quantity,
      reorder_level: row.reorder_level || 0,
    });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (inventoryId) => {
    if (!window.confirm('Delete this inventory row? Quantity must be zero.')) return;

    try {
      await inventoryService.remove(inventoryId);
      await load();
    } catch (err) {
      setError(err?.message || 'Unable to delete inventory.');
    }
  };

  return (
    <>
      <section className="inventory-page stack-lg">
        <div className="catalog-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="catalog-hero-copy" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="catalog-title">Inventory</h2>
            <p className="catalog-subtitle">
              {rows.length} stock lines
              {lowStockCount ? ` • ${lowStockCount} low stock` : ''}
            </p>
          </div>

          <button
            type="button"
            className="ghost-button"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            disabled={!storeId}
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
              onChange={(e) => setSearch(e.target.value)}
              disabled={!storeId}
            />
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
                    <td colSpan="6" className="catalog-empty-cell">Select a store first.</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan="6" className="catalog-empty-cell">Loading...</td>
                  </tr>
                ) : filteredRows.length ? (
                  filteredRows.map((row) => {
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
                    <td colSpan="6" className="catalog-empty-cell">No inventory rows found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="catalog-table-card">
          <div className="catalog-hero-copy" style={{ marginBottom: 12 }}>
            <h3 className="catalog-title" style={{ fontSize: '1.05rem' }}>Inventory history</h3>
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
                    <td colSpan="8" className="catalog-empty-cell">Select a store first.</td>
                  </tr>
                ) : historyLoading ? (
                  <tr>
                    <td colSpan="8" className="catalog-empty-cell">Loading history...</td>
                  </tr>
                ) : filteredHistoryRows.length ? (
                  filteredHistoryRows.map((row) => (
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
                        <span className={`history-change-pill ${getHistoryTone(row.quantity_changed)}`}>
                          {formatSignedQty(row.quantity_changed)}
                        </span>
                      </td>
                      <td>{row.quantity_before ?? 0}</td>
                      <td>{row.quantity_after ?? 0}</td>
                      <td>{row.change_type || '-'}</td>
                      <td>
                        <div className="catalog-item-copy">
                          <strong>{row.reference || '—'}</strong>
                          <span>{row.user?.full_name || row.user?.name || row.user?.email || 'System'}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="catalog-empty-cell">No inventory history found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                    : 'Each stock receipt creates a new FIFO inventory layer.'
}
                </p>
              </div>

              <button type="button" className="icon-button" onClick={closeModal} disabled={submitting}>
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
                    disabled={Boolean(editingId)}
                  >
                    <option value="">Select product</option>
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
                  />
                </label>

                <label>
                  {editingId ? 'Current quantity' : 'Incoming quantity'}
                  <input
                    className="text-input"
                    type="number"
                    min="0"
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
                  <button type="button" className="ghost-button" onClick={closeModal} disabled={submitting}>
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
