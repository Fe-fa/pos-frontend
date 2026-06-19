import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Modal from '../../components/common/Modal';
import { useStore } from '../../contexts/StoreContext';
import { billingService } from '../../services/billingService';
import { formatDateTime } from '../../utils/helpers';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';

const extractRecord = (response) => {
  return response?.data?.data || response?.data || response || null;
};

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

const detailFulfillmentStatusOptions = fulfillmentStatusOptions.filter(
  (option) => option.value
);
const detailFulfillmentTypeOptions = fulfillmentTypeOptions.filter(
  (option) => option.value
);

const getOrderNumber = (order) => {
  if (order?.order_number) return order.order_number;
  return `ORD-${String(order?.billing_id || 0).padStart(4, '0')}`;
};

const getItemsCount = (order) => {
  if (order?.items_sum_quantity !== undefined && order?.items_sum_quantity !== null) {
    return Number(order.items_sum_quantity || 0);
  }

  if (Array.isArray(order?.items)) {
    return order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  return Number(order?.items_count || 0);
};

const getItemsCountLabel = (order) => {
  const count = getItemsCount(order);
  return `${count} ${count === 1 ? 'item' : 'items'}`;
};

const formatFulfillmentType = (value) => {
  if (value === 'walk_in_counter') return 'Walk-in Counter';
  if (value === 'delivery') return 'Delivery';
  return 'Walk-in Counter';
};

const renderFulfillmentBadge = (value) => {
  const badgeMap = {
    pending: 'warning',
    processing: 'partial',
    shipped: 'unpaid',
    delivered: 'paid',
  };

  const badgeClass = badgeMap[value] || 'warning';

  return <span className={`status-badge ${badgeClass}`}>{value || 'pending'}</span>;
};

const OrderRow = memo(function OrderRow({ order, onView }) {
  return (
    <tr>
      <td>{getOrderNumber(order)}</td>
      <td>{order.customer?.full_name || 'Walk-in customer'}</td>
      <td>{getItemsCountLabel(order)}</td>
      <td>{formatFulfillmentType(order.fulfillment_type)}</td>
      <td>{renderFulfillmentBadge(order.fulfillment_status || 'pending')}</td>
      <td>{order.billing_date ? formatDateTime(order.billing_date) : '-'}</td>
      <td>
        <div className="row-actions compact">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onView(order.billing_id)}
          >
            View
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function AdminOrdersPage() {
  const { storeId } = useStore();

  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ ...EMPTY_META });

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [loading, setLoading] = useState(false);
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingFulfillment, setSavingFulfillment] = useState(false);

  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

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
      if (requestId !== listRequestRef.current) return;

      const parsed = extractPaginated(response, perPage);
      setMeta(parsed.meta || { ...EMPTY_META });
      setOrders(parsed.data || []);
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      setError(err?.response?.data?.message || 'Unable to load orders.');
      setMeta({ ...EMPTY_META });
    } finally {
      if (requestId === listRequestRef.current) {
        setLoading(false);
      }
    }
  }, [storeId, orderParams, perPage]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setSelectedOrder(null);
    setError('');
    setSuccess('');
  }, [storeId]);

  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => {
      setSuccess('');
    }, 4000);

    return () => clearTimeout(timer);
  }, [success]);

  const openDetails = useCallback(async (billingId) => {
    if (!billingId) return;

    const requestId = ++detailRequestRef.current;
    setError('');

    try {
      const response = await billingService.show(billingId);
      if (requestId !== detailRequestRef.current) return;
      setSelectedOrder(extractRecord(response));
    } catch (err) {
      if (requestId !== detailRequestRef.current) return;
      setError(err?.response?.data?.message || 'Unable to load order detail.');
    }
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedOrder(null);
  }, []);

  const handleSaveFulfillment = useCallback(async () => {
    if (!selectedOrder?.billing_id) return;

    setSavingFulfillment(true);
    setError('');
    setSuccess('');

    try {
      const response = await billingService.update(selectedOrder.billing_id, {
        fulfillment_status: selectedOrder.fulfillment_status || 'pending',
        fulfillment_type: selectedOrder.fulfillment_type || 'walk_in_counter',
      });

      const updatedOrder = extractRecord(response);

      setSelectedOrder((prev) => ({
        ...prev,
        ...updatedOrder,
      }));

      setOrders((prev) =>
        prev.map((order) =>
          String(order.billing_id) === String(updatedOrder.billing_id)
            ? { ...order, ...updatedOrder }
            : order
        )
      );

      setSuccess('Order fulfillment updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update fulfillment.');
    } finally {
      setSavingFulfillment(false);
    }
  }, [selectedOrder]);

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

  const handleSelectedOrderStatusChange = useCallback((e) => {
    const value = e.target.value;
    setSelectedOrder((prev) => ({
      ...prev,
      fulfillment_status: value,
    }));
  }, []);

  const handleSelectedOrderTypeChange = useCallback((e) => {
    const value = e.target.value;
    setSelectedOrder((prev) => ({
      ...prev,
      fulfillment_type: value,
    }));
  }, []);

  return (
    <section className="stack-lg">
      <div className="section-header" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2>Orders</h2>
        </div>

        <div className="row-actions compact" style={{ flexWrap: 'wrap' }}>
          <select
            className="select-input slim"
            value={fulfillmentStatus}
            onChange={handleFulfillmentStatusChange}
            disabled={!storeId}
          >
            {fulfillmentStatusOptions.map((option) => (
              <option key={option.value || 'all-status'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="select-input slim"
            value={fulfillmentType}
            onChange={handleFulfillmentTypeChange}
            disabled={!storeId}
          >
            {fulfillmentTypeOptions.map((option) => (
              <option key={option.value || 'all-type'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="muted">Show</span>
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
                className="select-input slim"
                value={perPage}
                onChange={handlePerPageChange}
                disabled={!storeId}
                style={{ paddingRight: 28, appearance: 'none' }}
              >
                {[5, 10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </div>
          </label>

          <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
        </div>
      </div>

      <article className="card">
        <div className="card-header">
          <div>
            <h3>Order records</h3>
            <p>
              {meta.from && meta.to
                ? `Showing ${meta.from}-${meta.to} of ${meta.total}`
                : `${orders.length} items`}
              {loading && orders.length ? ' • refreshing...' : ''}
            </p>
          </div>
        </div>

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
                <tr>
                  <td colSpan="7">Select a store first.</td>
                </tr>
              ) : loading && !orders.length ? (
                <tr>
                  <td colSpan="7">Loading...</td>
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
                <tr>
                  <td colSpan="7">No orders found.</td>
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
              Page {meta.current_page} of {meta.last_page}
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

      <Modal
        open={!!selectedOrder}
        title="Order details"
        onClose={closeDetails}
        width="920px"
      >
        {selectedOrder ? (
          <div className="stack-md">
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

              <div>
                <p className="muted">Fulfillment status</p>
                <select
                  className="select-input"
                  value={selectedOrder.fulfillment_status || 'pending'}
                  onChange={handleSelectedOrderStatusChange}
                >
                  {detailFulfillmentStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="muted">Fulfillment type</p>
                <select
                  className="select-input"
                  value={selectedOrder.fulfillment_type || 'walk_in_counter'}
                  onChange={handleSelectedOrderTypeChange}
                >
                  {detailFulfillmentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
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
                    <tr>
                      <td colSpan="2">No items found for this order.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="row-actions">
              <button
                className="primary-button"
                onClick={handleSaveFulfillment}
                disabled={savingFulfillment}
              >
                {savingFulfillment ? 'Saving...' : 'Save fulfillment'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
