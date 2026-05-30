import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { billingService } from '../../services/billingService';
import { currency, formatDateTime } from '../../utils/helpers';
import { openBillingPrint } from '../../utils/print';
import { useStore } from '../../contexts/StoreContext';

export default function AdminOrdersPage() {
  const { stores, storeId } = useStore();
  const currentStore = stores.find((store) => String(store.store_id) === String(storeId));

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [error, setError] = useState('');

  const loadOrders = async () => {
    if (!storeId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await billingService.list({ per_page: 10, status, store_id: storeId });
      setOrders(response.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load orders.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOrders([]);
    setSelectedOrder(null);
    setError('');

    if (!storeId) {
      setLoading(false);
      return;
    }

    loadOrders();
  }, [storeId, status]);

  const openDetails = async (billingId) => {
    try {
      const response = await billingService.show(billingId);
      setSelectedOrder(response.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load order detail.');
    }
  };

  const closeDetails = () => setSelectedOrder(null);

  return (
    <>
      <section className="stack-lg">
        <div className="section-header">
          <div>
            <h2>Orders</h2>
            <p>Review store sales orders, balances, statuses, and print documents when needed.</p>
          </div>

          <div className="row-actions compact">
            <select
              className="select-input slim"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!storeId}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>

            <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
          </div>
        </div>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>Order records</h3>
              <p>{orders.length} items</p>
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!storeId ? (
                  <tr><td colSpan="8">Select a store first.</td></tr>
                ) : loading ? (
                  <tr><td colSpan="8">Loading...</td></tr>
                ) : orders.length ? (
                  orders.map((order) => (
                    <tr key={order.billing_id}>
                      <td>{order.invnumber || `Draft #${order.billing_id}`}</td>
                      <td>{order.customer?.full_name || 'Walk-in customer'}</td>
                      <td>{currency(order.total, currentStore?.currency)}</td>
                      <td>{currency(order.paid_amount, currentStore?.currency)}</td>
                      <td>{currency(order.balance_due, currentStore?.currency)}</td>
                      <td><span className={`status-badge ${order.status}`}>{order.status}</span></td>
                      <td>{formatDateTime(order.billing_date)}</td>
                      <td>
                        <div className="row-actions compact">
                          <button type="button" className="ghost-button" onClick={() => openDetails(order.billing_id)}>
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="8">No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {selectedOrder ? (
        <div className="modal-backdrop" onClick={closeDetails}>
          <div className="modal-card order-detail-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Order details</h3>
                <p className="muted">
                  {selectedOrder.invnumber || `Draft #${selectedOrder.billing_id}`}
                </p>
              </div>
              <button type="button" className="icon-button" onClick={closeDetails}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <div className="stack-md">
                <div className="detail-grid">
                  <div>
                    <p className="muted">Order</p>
                    <strong>{selectedOrder.invnumber || `Draft #${selectedOrder.billing_id}`}</strong>
                  </div>
                  <div>
                    <p className="muted">Customer</p>
                    <strong>{selectedOrder.customer?.full_name || 'Walk-in customer'}</strong>
                  </div>
                  <div>
                    <p className="muted">Status</p>
                    <strong>{selectedOrder.status}</strong>
                  </div>
                  <div>
                    <p className="muted">Date</p>
                    <strong>{formatDateTime(selectedOrder.billing_date)}</strong>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item) => (
                        <tr key={item.billing_item_id}>
                          <td>{item.product?.product_name}</td>
                          <td>{item.quantity}</td>
                          <td>{currency(item.unit_price, currentStore?.currency)}</td>
                          <td>{currency(item.total_amount, currentStore?.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="billing-summary-grid">
                  <div className="summary-box">
                    <span>Subtotal</span>
                    <strong>{currency(selectedOrder.subtotal, currentStore?.currency)}</strong>
                  </div>
                  <div className="summary-box">
                    <span>VAT</span>
                    <strong>{currency(selectedOrder.vat_amount, currentStore?.currency)}</strong>
                  </div>
                  <div className="summary-box">
                    <span>Paid</span>
                    <strong>{currency(selectedOrder.paid_amount, currentStore?.currency)}</strong>
                  </div>
                  <div className="summary-box">
                    <span>Balance</span>
                    <strong>{currency(selectedOrder.balance_due, currentStore?.currency)}</strong>
                  </div>
                </div>

                <div className="row-actions">
                  <button className="primary-button" onClick={() => openBillingPrint(selectedOrder, currentStore, 'invoice')}>
                    Print invoice
                  </button>
                  <button className="ghost-button" onClick={() => openBillingPrint(selectedOrder, currentStore, 'receipt')}>
                    Print receipt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
