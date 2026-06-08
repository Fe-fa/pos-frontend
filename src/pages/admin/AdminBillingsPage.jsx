import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../../components/common/Modal';
import { useStore } from '../../contexts/StoreContext';
import { billingService } from '../../services/billingService';
import { currency, formatDateTime } from '../../utils/helpers';
import { mergeStoreSettings } from '../../utils/storeSettings';
import { openBillingPrint, downloadBillingDocument } from '../../utils/print';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

const EMPTY_META = {
  current_page: 1,
  last_page: 1,
  per_page: 5, // Default fallback matching your backend fallback configuration
  total: 0,
  from: null,
  to: null,
  has_next_page: false,
  has_prev_page: false,
};

const extractPaginated = (response, defaultLimit = 5) => {
  const payload = response?.data ?? response ?? {};

  let items = [];
  if (Array.isArray(payload.data)) {
    items = payload.data;
  } else if (Array.isArray(payload)) {
    items = payload;
  }
  const rawMeta = payload.meta ?? response?.meta ?? {};
  const total = Number(rawMeta.total ?? payload.total ?? items.length ?? 0);
  const currentPage = Number(rawMeta.current_page ?? payload.current_page ?? 1);
  const perPage = Number(rawMeta.per_page ?? payload.per_page ?? defaultLimit);
  const lastPage = Number(rawMeta.last_page ?? payload.last_page ?? Math.max(1, Math.ceil(total / perPage)));

  const hasNextPage = typeof rawMeta.has_next_page === 'boolean' 
    ? rawMeta.has_next_page 
    : currentPage < lastPage;

  const hasPrevPage = typeof rawMeta.has_prev_page === 'boolean' 
    ? rawMeta.has_prev_page 
    : currentPage > 1;

  return {
    data: items,
    meta: {
      current_page: currentPage,
      last_page: lastPage,
      per_page: perPage,
      total,
      from: rawMeta.from ?? payload.from ?? (total ? (currentPage - 1) * perPage + 1 : null),
      to: rawMeta.to ?? payload.to ?? (total ? Math.min(currentPage * perPage, total) : null),
      has_next_page: hasNextPage,
      has_prev_page: hasPrevPage,
    },
  };
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
  const [meta, setMeta] = useState(EMPTY_META);
  const [page, setPage] = useState(1);
  
  // 🌟 Kept state to keep UI synchronized with backend layout controls
  const [perPage, setPerPage] = useState(5); 
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState('active');
  
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [selectedBilling, setSelectedBilling] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requestRef = useRef(0);

  // Handle debouncing for search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400); // 400ms is standard response latency for inputs

    return () => clearTimeout(handler);
  }, [search]);

  // Pulls records safely matching structural filter mutations
  const loadBillings = useCallback(
    async (targetPage, currentPerPage = perPage, currentStatus = status, currentScope = scope, currentSearch = debouncedSearch) => {
      if (!storeId) {
        setBillings([]);
        setMeta(EMPTY_META);
        setLoading(false);
        return;
      }

      const requestId = ++requestRef.current;
      setLoading(true);
      setError('');

      try {
        const params = {
          page: targetPage,
          store_id: storeId,
          per_page: currentPerPage, // Send customized page limits upstream
        };

        if (currentSearch.trim()) {
          params.search = currentSearch.trim();
        }

        if (currentStatus && currentStatus !== 'draft') {
          params.status = currentStatus;
        }

        if (currentStatus === 'draft') {
          params.is_draft = true;
        }

        if (currentScope === 'trashed') {
          params.only_trashed = true;
        } else if (currentScope === 'all') {
          params.with_trashed = true;
        }

        const response = await billingService.list(params);

        if (requestId !== requestRef.current) return;

        // Extract metadata cleanly using dynamic backend layout parameters
        const parsed = extractPaginated(response, currentPerPage); 
        
        setMeta(parsed.meta);
        setPerPage(parsed.meta.per_page); // State sync successfully happens outside the effect cycle dependency now!
        setBillings(parsed.data || []);
      } catch (err) {
        if (requestId !== requestRef.current) return;

        setError(err?.response?.data?.message || 'Unable to load billing records.');
        setBillings([]);
        setMeta(EMPTY_META);
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      }
    },
    [storeId]
  );

  // Synchronized effect driving updates dynamically across all state boundaries
  useEffect(() => {
    setSelectedBilling(null);
    setError('');
    setSuccess('');

    loadBillings(page, perPage, status, scope, debouncedSearch);
  }, [storeId, status, scope, page, perPage, debouncedSearch, loadBillings]);

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
      setError(err?.response?.data?.message || 'Unable to load billing detail.');
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
      } else {
        throw new Error('Delete method not verified.');
      }

      if (String(selectedBilling?.billing_id) === String(billing.billing_id)) {
        setSelectedBilling(null);
      }

      setSuccess('Billing moved to trash successfully.');
      setPage(billings.length === 1 && page > 1 ? page - 1 : page);
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
        throw new Error('Restore method not found.');
      }

      await billingService.restore(billingId);

      if (String(selectedBilling?.billing_id) === String(billingId)) {
        setSelectedBilling(null);
      }

      setSuccess('Billing restored successfully.');
      setPage(billings.length === 1 && page > 1 ? page - 1 : page);
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
      <div className="section-header" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h3>Billings</h3>
          <p>
            Accounting and finance view for managers. Track legal billing references, totals,
            payments, balances, and tax-related records.
          </p>
        </div>

        <div className="row-actions compact" style={{ flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <input
              type="text"
              className="text-input slim search-filter-input"
              style={{ paddingRight: search ? '24px' : '8px', minWidth: '220px' }}
              placeholder="Search reference or customer..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              disabled={!storeId}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#29d22c',
                  padding: 0,
                  fontSize: '14px'
                }}
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>

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

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="muted">Show</span>
            <select
              className="select-input slim"
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
              disabled={!storeId}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
        </div>
      </div>

      <article className="card">
        <div className="card-header">
          <div>
            <h3>Billing records</h3>
            <p>
              {meta.from && meta.to
                ? `Showing ${meta.from}-${meta.to} of ${meta.total}`
                : `${billings.length} items`}
              {loading && billings.length ? ' • refreshing...' : ''}
            </p>
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Billing Ref</th>
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
              ) : loading && !billings.length ? (
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
            <span className="muted">
              Page {meta.current_page} of {meta.last_page} (Items per page: {perPage})
            </span>

            <div className="row-actions compact">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={loading || !meta.has_prev_page}
              >
                Previous
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((p) => Math.min(p + 1, meta.last_page))}
                disabled={loading || !meta.has_next_page}
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
                <p className="muted">Billing ref</p>
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