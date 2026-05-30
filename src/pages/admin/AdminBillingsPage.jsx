import { useEffect, useState } from 'react';
import Modal from '../../components/common/Modal';
import { useStore } from '../../contexts/StoreContext';
import { billingService } from '../../services/billingService';
import { currency, formatDateTime } from '../../utils/helpers';
import { mergeStoreSettings } from '../../utils/storeSettings';
import { openBillingPrint, downloadBillingDocument } from '../../utils/print';

const emptyPagination = {
  data: [],
  current_page: 1,
  per_page: 10,
  prev_page_url: null,
  next_page_url: null,
  from: null,
  to: null,
};

const extractPagination = (response) => {
  const payload = response?.data ?? response ?? {};

  if (Array.isArray(payload?.data)) {
    return { ...emptyPagination, ...payload, data: payload.data };
  }

  if (Array.isArray(payload)) {
    return {
      ...emptyPagination,
      data: payload,
      per_page: payload.length,
      from: payload.length ? 1 : null,
      to: payload.length || null,
    };
  }

  return emptyPagination;
};

const extractRecord = (response) => {
  return response?.data?.data || response?.data || response || null;
};

const getLatestPayment = (billing) => {
  const payments = Array.isArray(billing?.payments) ? [...billing.payments] : [];
  if (!payments.length) return null;

  payments.sort(
    (a, b) =>
      new Date(b?.payment_date || 0).getTime() - new Date(a?.payment_date || 0).getTime()
  );

  return payments[0] || null;
};

export default function AdminBillingsPage() {
  const { stores, storeId } = useStore();
  const currentStore = stores.find((store) => String(store.store_id) === String(storeId));
  const printSettings = mergeStoreSettings(currentStore);

  const [billings, setBillings] = useState([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState('active');
  const [selectedBilling, setSelectedBilling] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadBillings = async () => {
    if (!storeId) {
      setBillings([]);
      setPagination(emptyPagination);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = {
        page,
        per_page: 10,
        store_id: storeId,
      };

      if (status && status !== 'draft') {
        params.status = status;
      }

      if (status === 'draft') {
        params.is_draft = true;
      }

      if (scope === 'trashed') {
        params.only_trashed = true;
      } else if (scope === 'all') {
        params.with_trashed = true;
      }

      const response = await billingService.list(params);
      const parsed = extractPagination(response);

      setPagination(parsed);
      setBillings(parsed.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load billing records.');
      setBillings([]);
      setPagination(emptyPagination);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setBillings([]);
    setSelectedBilling(null);
    setError('');
    setSuccess('');

    if (!storeId) {
      setLoading(false);
      return;
    }

    loadBillings();
  }, [storeId, status, scope, page]);

  useEffect(() => {
    if (!success) return;

    const timer = setTimeout(() => {
      setSuccess('');
    }, 4000);

    return () => clearTimeout(timer);
  }, [success]);

  const openDetails = async (billingId) => {
    setError('');

    try {
      const response = await billingService.show(billingId);
      setSelectedBilling(extractRecord(response));
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          'Unable to load billing detail. If this billing is trashed, ensure the backend show endpoint supports soft-deleted records.'
      );
    }
  };

  const handleDelete = async (billing) => {
    const confirmed = window.confirm('Move this billing to trash?');
    if (!confirmed) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (typeof billingService.destroy === 'function') {
        await billingService.destroy(billing.billing_id);
      } else if (typeof billingService.delete === 'function') {
        await billingService.delete(billing.billing_id);
      } else if (typeof billingService.remove === 'function') {
        await billingService.remove(billing.billing_id);
      } else {
        throw new Error('Delete billing method is not implemented in billingService.');
      }

      if (String(selectedBilling?.billing_id) === String(billing.billing_id)) {
        setSelectedBilling(null);
      }

      setSuccess('Billing moved to trash successfully.');

      if (billings.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadBillings();
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to delete billing.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestore = async (billingId) => {
    const confirmed = window.confirm('Restore this billing from trash?');
    if (!confirmed) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (typeof billingService.restore !== 'function') {
        throw new Error('Restore billing method is not implemented in billingService.');
      }

      await billingService.restore(billingId);

      if (String(selectedBilling?.billing_id) === String(billingId)) {
        setSelectedBilling(null);
      }

      setSuccess('Billing restored successfully.');

      if (billings.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadBillings();
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to restore billing.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatus = (billing) => {
    if (billing?.deleted_at) {
      return <span className="status-badge danger">trashed</span>;
    }

    if (billing?.is_draft) {
      return <span className="status-badge warning">draft</span>;
    }

    return <span className={`status-badge ${billing.status}`}>{billing.status}</span>;
  };

  const latestSelectedPayment = getLatestPayment(selectedBilling);

  return (
    <section className="stack-lg">
      <div className="section-header">
        <div className="row-actions compact" style={{ flexWrap: 'wrap' }}>
          <select
            className="select-input slim"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            disabled={!storeId}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>

          <select
            className="select-input slim"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setPage(1);
            }}
            disabled={!storeId}
          >
            <option value="active">Active only</option>
            <option value="trashed">Trash only</option>
            <option value="all">All records</option>
          </select>
        </div>

        <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
      </div>

      <article className="card">
        <div className="card-header">
          <div>
            <h3>Billing records</h3>
            <p>
              {pagination.from && pagination.to
                ? `Showing ${pagination.from}-${pagination.to}`
                : `${billings.length} items`}
            </p>
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Date</th>
                <th>Deleted</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!storeId ? (
                <tr>
                  <td colSpan="9">Select a store first.</td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan="9">Loading...</td>
                </tr>
              ) : billings.length ? (
                billings.map((billing) => {
                  const isDeleted = !!billing.deleted_at;
                  const canDelete = !isDeleted && billing.is_draft;
                  const canRestore = isDeleted;

                  return (
                    <tr key={billing.billing_id} className={isDeleted ? 'row-soft-deleted' : ''}>
                      <td>{billing.invnumber || `Draft #${billing.billing_id}`}</td>
                      <td>{billing.customer?.full_name || 'Walk-in customer'}</td>
                      <td>{currency(Number(billing.total || 0), currentStore?.currency)}</td>
                      <td>{currency(Number(billing.paid_amount || 0), currentStore?.currency)}</td>
                      <td>{currency(Number(billing.balance_due || 0), currentStore?.currency)}</td>
                      <td>{renderStatus(billing)}</td>
                      <td>{billing.billing_date ? formatDateTime(billing.billing_date) : '-'}</td>
                      <td>{billing.deleted_at ? formatDateTime(billing.deleted_at) : '-'}</td>
                      <td>
                        <div className="row-actions compact">
                          {!isDeleted ? (
                            <button
                              className="ghost-button"
                              onClick={() => openDetails(billing.billing_id)}
                              disabled={submitting}
                            >
                              View
                            </button>
                          ) : null}

                          {canRestore ? (
                            <button
                              className="ghost-button"
                              onClick={() => handleRestore(billing.billing_id)}
                              disabled={submitting}
                            >
                              Restore
                            </button>
                          ) : null}

                          {canDelete ? (
                            <button
                              className="ghost-button danger-button"
                              onClick={() => handleDelete(billing)}
                              disabled={submitting}
                            >
                              Trash
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9">No billings found.</td>
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
            <span className="muted">Page {pagination.current_page || page}</span>

            <div className="row-actions compact">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={!pagination.prev_page_url || loading}
              >
                Previous
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!pagination.next_page_url || loading}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </article>

      <Modal
        open={!!selectedBilling}
        title="Billing details"
        onClose={() => setSelectedBilling(null)}
        width="920px"
      >
        {selectedBilling ? (
          <div className="stack-md">
            <div className="detail-grid">
              <div>
                <p className="muted">Invoice</p>
                <strong>{selectedBilling.invnumber || `Draft #${selectedBilling.billing_id}`}</strong>
              </div>

              <div>
                <p className="muted">Customer</p>
                <strong>{selectedBilling.customer?.full_name || 'Walk-in customer'}</strong>
              </div>

              <div>
                <p className="muted">Status</p>
                <strong>
                  {selectedBilling.deleted_at
                    ? 'trashed'
                    : selectedBilling.is_draft
                      ? 'draft'
                      : selectedBilling.status}
                </strong>
              </div>

              <div>
                <p className="muted">Billing date</p>
                <strong>
                  {selectedBilling.billing_date
                    ? formatDateTime(selectedBilling.billing_date)
                    : '-'}
                </strong>
              </div>

              <div>
                <p className="muted">Paid amount</p>
                <strong>
                  {currency(Number(selectedBilling.paid_amount || 0), currentStore?.currency)}
                </strong>
              </div>

              <div>
                <p className="muted">Balance due</p>
                <strong>
                  {currency(Number(selectedBilling.balance_due || 0), currentStore?.currency)}
                </strong>
              </div>

              <div>
                <p className="muted">Latest receipt</p>
                <strong>{latestSelectedPayment?.receiptnumber || '-'}</strong>
              </div>

              <div>
                <p className="muted">Stock applied</p>
                <strong>
                  {selectedBilling.stock_applied_at
                    ? formatDateTime(selectedBilling.stock_applied_at)
                    : '-'}
                </strong>
              </div>
            </div>

            {selectedBilling.notes ? (
              <div className="card" style={{ padding: '12px 16px' }}>
                <p className="muted">Notes</p>
                <strong>{selectedBilling.notes}</strong>
              </div>
            ) : null}

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
                  {selectedBilling.items?.length ? (
                    selectedBilling.items.map((item) => (
                      <tr key={item.billing_item_id}>
                        <td>{item.product?.product_name}</td>
                        <td>{item.quantity}</td>
                        <td>{currency(Number(item.unit_price || 0), currentStore?.currency)}</td>
                        <td>
                          {currency(
                            Number(
                              item.total_amount ??
                                item.line_total ??
                                item.line_subtotal ??
                                Number(item.quantity || 0) * Number(item.unit_price || 0)
                            ),
                            currentStore?.currency
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">No items found for this billing.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="billing-summary-grid">
              <div className="summary-box">
                <span>Subtotal</span>
                <strong>{currency(Number(selectedBilling.subtotal || 0), currentStore?.currency)}</strong>
              </div>
              <div className="summary-box">
                <span>VAT</span>
                <strong>{currency(Number(selectedBilling.vat_amount || 0), currentStore?.currency)}</strong>
              </div>
              <div className="summary-box">
                <span>Paid</span>
                <strong>{currency(Number(selectedBilling.paid_amount || 0), currentStore?.currency)}</strong>
              </div>
              <div className="summary-box">
                <span>Balance</span>
                <strong>{currency(Number(selectedBilling.balance_due || 0), currentStore?.currency)}</strong>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Method</th>
                    <th>Received</th>
                    <th>Tendered</th>
                    <th>Change</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBilling.payments?.length ? (
                    selectedBilling.payments.map((payment) => (
                      <tr key={payment.payment_id}>
                        <td>{payment.receiptnumber || '-'}</td>
                        <td>{payment.payment_method || '-'}</td>
                        <td>{currency(Number(payment.amount_received || 0), currentStore?.currency)}</td>
                        <td>{currency(Number(payment.amount_tendered || 0), currentStore?.currency)}</td>
                        <td>{currency(Number(payment.change_returned || 0), currentStore?.currency)}</td>
                        <td>{payment.payment_date ? formatDateTime(payment.payment_date) : '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">No payments recorded for this billing.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="row-actions">
              {!selectedBilling.deleted_at ? (
                <>
                  <button
                    className="primary-button"
                    onClick={() =>
                      openBillingPrint(selectedBilling, currentStore, 'invoice', printSettings)
                    }
                  >
                    Print invoice
                  </button>

                  <button
                    className="ghost-button"
                    onClick={() => downloadBillingDocument(selectedBilling, 'invoice')}
                  >
                    Download invoice
                  </button>

                  {selectedBilling.payments?.length ? (
                    <>
                      <button
                        className="ghost-button"
                        onClick={() =>
                          openBillingPrint(selectedBilling, currentStore, 'receipt', printSettings)
                        }
                      >
                        Print receipt
                      </button>

                      <button
                        className="ghost-button"
                        onClick={() => downloadBillingDocument(selectedBilling, 'receipt')}
                      >
                        Download receipt
                      </button>
                    </>
                  ) : null}

                  {selectedBilling.is_draft ? (
                    <button
                      className="ghost-button danger-button"
                      onClick={() => handleDelete(selectedBilling)}
                      disabled={submitting}
                    >
                      Move to trash
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  className="primary-button"
                  onClick={() => handleRestore(selectedBilling.billing_id)}
                  disabled={submitting}
                >
                  Restore billing
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
