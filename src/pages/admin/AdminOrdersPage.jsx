import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Modal from '../../components/common/Modal';
import { useStore } from '../../contexts/StoreContext';
import { billingService } from '../../services/billingService';
import { formatDateTime } from '../../utils/helpers';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';

// ─── helpers ────────────────────────────────────────────────────────────────

const extractRecord = (response) =>
  response?.data?.data ?? response?.data ?? response ?? null;

const getOrderNumber = (order) =>
  order?.order_number ?? `ORD-${String(order?.billing_id || 0).padStart(4, '0')}`;

const getItemsCount = (order) => {
  if (order?.items_sum_quantity != null) return Number(order.items_sum_quantity || 0);
  if (Array.isArray(order?.items))
    return order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return Number(order?.items_count || 0);
};

const getItemsCountLabel = (order) => {
  const count = getItemsCount(order);
  return `${count} ${count === 1 ? 'item' : 'items'}`;
};

const formatFulfillmentType = (value) =>
  value === 'delivery' ? 'Delivery' : 'Walk-in Counter';

const FULFILLMENT_BADGE = { pending: 'warning', processing: 'partial', shipped: 'unpaid', delivered: 'paid' };

const FulfillmentBadge = memo(function FulfillmentBadge({ value }) {
  const normalized = value || 'pending';
  return (
    <span className={`status-badge ${FULFILLMENT_BADGE[normalized] ?? 'warning'}`}>
      {normalized}
    </span>
  );
});


const Spinner = memo(function Spinner({ size = 16, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ animation: 'spin 0.75s linear infinite', ...style }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
});

// ─── static option lists ─────────────────────────────────────────────────────

const fulfillmentStatusOptions = [
  { value: '', label: 'All fulfillment statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
];

const fulfillmentTypeOptions = [
  { value: '', label: 'All fulfillment types' },
  { value: 'walk_in_counter', label: 'Walk-in Counter' },
  { value: 'delivery', label: 'Delivery' },
];

// Pre-filtered once — no filtering on every render
const detailFulfillmentStatusOptions = fulfillmentStatusOptions.filter((o) => o.value);
const detailFulfillmentTypeOptions = fulfillmentTypeOptions.filter((o) => o.value);

// ─── OrderRow ─────────────────────────────────────────────────────────────────
// Wrapped in memo + receives only primitive/stable props to prevent
// re-renders when sibling rows or parent state changes unrelated to this row.

const OrderRow = memo(function OrderRow({ order, onView }) {
  const handleView = useCallback(() => onView(order.billing_id), [onView, order.billing_id]);

  return (
    <tr>
      <td>{getOrderNumber(order)}</td>
      <td>{order.customer?.full_name || 'Walk-in customer'}</td>
      <td>{getItemsCountLabel(order)}</td>
      <td>{formatFulfillmentType(order.fulfillment_type)}</td>
      <td><FulfillmentBadge value={order.fulfillment_status} /></td>
      <td>{order.billing_date ? formatDateTime(order.billing_date) : '-'}</td>
      <td>
        <div className="row-actions compact">
          <button type="button" className="ghost-button" onClick={handleView}>
            View
          </button>
        </div>
      </td>
    </tr>
  );
});

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const { storeId } = useStore();

  // list state
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('');
  const [loading, setLoading] = useState(false);

  // detail / modal state — kept fully separate from list state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // edit state inside modal (detached copy so list rows are not mutated)
  const [draftStatus, setDraftStatus] = useState('');
  const [draftType, setDraftType] = useState('');
  const [savingFulfillment, setSavingFulfillment] = useState(false);

  // feedback
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // request-ID refs — cancel stale async responses without AbortController overhead
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  // ── derived params — only a new object when something actually changed ──────
  const orderParams = useMemo(
    () => ({
      page,
      per_page: perPage,
      store_id: storeId,
      ...(fulfillmentStatus ? { fulfillment_status: fulfillmentStatus } : {}),
      ...(fulfillmentType ? { fulfillment_type: fulfillmentType } : {}),
    }),
    [page, perPage, storeId, fulfillmentStatus, fulfillmentType]
  );

  // ── list loader ───────────────────────────────────────────────────────────
  // Depends only on `orderParams` (stable reference unless values differ)
  // so it never fires more than once per genuine param change.
  const loadOrders = useCallback(async () => {
    if (!storeId) {
      setOrders([]);
      setMeta({ ...EMPTY_META });
      setLoading(false);
      return;
    }

    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError('');

    try {
      const response = await billingService.list(orderParams);
      if (requestId !== listRequestRef.current) return; // stale — discard

      const parsed = extractPaginated(response, perPage);
      setMeta(parsed.meta ?? { ...EMPTY_META });
      setOrders(parsed.data ?? []);
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      setError(err?.response?.data?.message || 'Unable to load orders.');
      setMeta({ ...EMPTY_META });
    } finally {
      if (requestId === listRequestRef.current) setLoading(false);
    }
  }, [orderParams, perPage, storeId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // reset on store switch
  useEffect(() => {
    setSelectedOrder(null);
    setError('');
    setSuccess('');
    setPage(1);
  }, [storeId]);

  // auto-clear success banner
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  // ── detail opener — sequential async, own loading state ──────────────────
  const openDetails = useCallback(async (billingId) => {
    if (!billingId) return;

    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await billingService.show(billingId);
      if (requestId !== detailRequestRef.current) return;

      const record = extractRecord(response);
      setSelectedOrder(record);
      // initialise draft from fetched record — keeps modal edits isolated
      setDraftStatus(record?.fulfillment_status || 'pending');
      setDraftType(record?.fulfillment_type || 'walk_in_counter');
    } catch (err) {
      if (requestId !== detailRequestRef.current) return;
      setError(err?.response?.data?.message || 'Unable to load order detail.');
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedOrder(null);
    setError('');
    setSuccess('');
  }, []);

  // ── save fulfillment — sequential async ───────────────────────────────────
  const handleSaveFulfillment = useCallback(async () => {
    if (!selectedOrder?.billing_id) return;

    setSavingFulfillment(true);
    setError('');
    setSuccess('');

    try {
      const response = await billingService.update(selectedOrder.billing_id, {
        fulfillment_status: draftStatus,
        fulfillment_type: draftType,
      });

      const updated = extractRecord(response);

      // update modal record
      setSelectedOrder((prev) => ({ ...prev, ...updated }));

      // update the specific row in the list — no full reload needed
      setOrders((prev) =>
        prev.map((order) =>
          String(order.billing_id) === String(updated.billing_id)
            ? { ...order, ...updated }
            : order
        )
      );

      setSuccess('Order fulfillment updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update fulfillment.');
    } finally {
      setSavingFulfillment(false);
    }
  }, [selectedOrder?.billing_id, draftStatus, draftType]);

  // ── filter / pagination handlers — all stable ─────────────────────────────
  const handleFulfillmentStatusChange = useCallback((e) => {
    setFulfillmentStatus(e.target.value);
    setPage(1);
  }, []);

  const handleFulfillmentTypeChange = useCallback((e) => {
    setFulfillmentType(e.target.value);
    setPage(1);
  }, []);

  const handlePerPageChange = useCallback((e) => {
    setPerPage(Number(e.target.value));
    setPage(1);
  }, []);

  const handlePrevPage = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, meta.last_page || 1));
  }, [meta.last_page]);

  // ── draft handlers ────────────────────────────────────────────────────────
  const handleDraftStatusChange = useCallback((e) => setDraftStatus(e.target.value), []);
  const handleDraftTypeChange = useCallback((e) => setDraftType(e.target.value), []);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <section className="stack-lg">
      {/* ── header ── */}
      <div className="section-header" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2>Orders</h2>
        </div>

<div className="users-toolbar-row">
  <div className="users-toolbar-controls">
    <select
      className="select-input users-filter-select"
      value={fulfillmentStatus}
      onChange={handleFulfillmentStatusChange}
      disabled={!storeId}
    >
      {fulfillmentStatusOptions.map((o) => (
        <option key={o.value || 'all-status'} value={o.value}>{o.label}</option>
      ))}
    </select>

    <select
      className="select-input users-filter-select"
      value={fulfillmentType}
      onChange={handleFulfillmentTypeChange}
      disabled={!storeId}
    >
      {fulfillmentTypeOptions.map((o) => (
        <option key={o.value || 'all-type'} value={o.value}>{o.label}</option>
      ))}
    </select>

    <div className="users-toolbar-divider" />

    <div className="users-perpage-wrap">
      <select
        value={perPage}
        onChange={handlePerPageChange}
        disabled={!storeId}
      >
        {[5, 10, 20, 50, 100].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>

    <div className="users-toolbar-divider" />

    <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
  </div>
</div>
      </div>

      {/* ── table card ── */}
      <article className="card">
        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items Count</th>
                <th>Fulfillment Type</th>
                <th>Fulfillment Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!storeId ? (
                <tr><td colSpan="7">Select a store first.</td></tr>
              ) : loading && orders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '32px 0' }}>
                    <Spinner size={20} style={{ margin: '0 auto', display: 'block', color: 'var(--color-text-secondary)' }} />
                  </td>
                </tr>
              ) : orders.length ? (
                orders.map((order) => (
                  <OrderRow
                    key={order.billing_id}
                    order={order}
                    onView={openDetails}
                  />
                ))
              ) : (
                <tr><td colSpan="7">No orders found.</td></tr>
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
                              {meta.from && meta.to
                ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
                : `${orders.length} items`}
            
            </span>

            <div className="row-actions compact">
              <button
                type="button"
                className="ghost-button"
                onClick={handlePrevPage}
                disabled={loading || !meta.has_prev_page}
              >
                Previous
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleNextPage}
                disabled={loading || !meta.has_next_page}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </article>

      {/* ── detail modal ── */}
      <Modal
        open={!!selectedOrder || detailLoading}
        title="Order details"
        onClose={closeDetails}
        width="920px"
      >
        {detailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Spinner size={28} style={{ color: 'var(--color-text-secondary)' }} />
          </div>
        ) : selectedOrder ? (
          <div className="stack-md">
            {error ? <p className="form-error">{error}</p> : null}
            {success ? <p className="form-success">{success}</p> : null}

            <div className="detail-grid">
              <div>
                <p className="muted">Order</p>
                <strong>{getOrderNumber(selectedOrder)}</strong>
              </div>

              <div>
                <p className="muted">Customer</p>
                <strong>{selectedOrder.customer?.full_name || 'Walk-in customer'}</strong>
              </div>

              <div>
                <p className="muted">Items Count</p>
                <strong>{getItemsCountLabel(selectedOrder)}</strong>
              </div>

              <div>
                <p className="muted">Order date</p>
                <strong>
                  {selectedOrder.billing_date ? formatDateTime(selectedOrder.billing_date) : '-'}
                </strong>
              </div>

              {/* Draft selects — edits stay local until Save is clicked */}
              <div>
                <p className="muted">Fulfillment status</p>
                <select
                  className="select-input"
                  value={draftStatus}
                  onChange={handleDraftStatusChange}
                >
                  {detailFulfillmentStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="muted">Fulfillment type</p>
                <select
                  className="select-input"
                  value={draftType}
                  onChange={handleDraftTypeChange}
                >
                  {detailFulfillmentTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="muted">Stock applied</p>
                <strong>
                  {selectedOrder.stock_applied_at
                    ? formatDateTime(selectedOrder.stock_applied_at)
                    : '-'}
                </strong>
              </div>

              <div>
                <p className="muted">Financial reference</p>
                <strong>{selectedOrder.invnumber || '-'}</strong>
              </div>
            </div>

            {selectedOrder.notes ? (
              <div className="card" style={{ padding: '12px 16px' }}>
                <p className="muted">Operational notes</p>
                <strong>{selectedOrder.notes}</strong>
              </div>
            ) : null}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items?.length ? (
                    selectedOrder.items.map((item) => (
                      <tr key={item.billing_item_id}>
                        <td>{item.product?.product_name || '-'}</td>
                        <td>{item.quantity}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="2">No items found for this order.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="row-actions">
              <button
                className="primary-button"
                onClick={handleSaveFulfillment}
                disabled={savingFulfillment}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {savingFulfillment
                  ? <><Spinner size={14} /> Saving…</>
                  : 'Save fulfillment'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
