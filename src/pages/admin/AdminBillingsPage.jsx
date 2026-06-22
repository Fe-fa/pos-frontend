import { memo, useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import Modal from '../../components/common/Modal';
import { useStore } from '../../contexts/StoreContext';
import { billingService } from '../../services/billingService';
import { currency, formatDateTime } from '../../utils/helpers';
import { mergeStoreSettings } from '../../utils/storeSettings';
import { openBillingPrint, downloadBillingDocument } from '../../utils/print';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';
import { useAuth } from '../../contexts/AuthContext';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];
const SPINNER_STYLE = `@keyframes billing-spin { to { transform: rotate(360deg); } }`;
const extractRecord = (response) =>
  response?.data?.data || response?.data || response || null;

const getSortedPayments = (billing) => {
  if (!Array.isArray(billing?.payments) || !billing.payments.length) return [];
  return [...billing.payments].sort(
    (a, b) =>
      new Date(b?.payment_date || 0).getTime() - new Date(a?.payment_date || 0).getTime()
  );
};

const getLatestPayment = (billing) => getSortedPayments(billing)[0] || null;

const getBillingDisplayRef = (billing) => {
  if (!billing) return '-';
  const latestReceipt = getSortedPayments(billing)[0]?.receiptnumber || null;
  if (billing.status === 'paid') {
    return latestReceipt || billing.invnumber || `Draft #${billing.billing_id}`;
  }
  return billing.invnumber || `Draft #${billing.billing_id}`;
};

// ─── Reducer: all page state in one place, single re-render per action ──────
const INITIAL_STATE = {
  billings: [],
  meta: { ...EMPTY_META },
  page: 1,
  perPage: undefined,

  effectivePerPage: undefined,
  loading: false,
  status: '',
  scope: 'active',
  selectedBilling: null,
  detailsLoading: false,
  error: '',
  success: '',
  submitting: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'RESET_FOR_STORE':
      return { ...INITIAL_STATE };
    case 'SET_LOADING':
      return { ...state, loading: action.payload, error: '' };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        loading: false,
        billings: action.billings,
        meta: action.meta,
        // Learn the real per-page in effect from the server's own meta,
        // independent of whatever the user picked (or didn't pick), so the
        // dropdown always reflects what was actually applied.
        effectivePerPage: action.meta?.per_page != null ? action.meta.per_page : state.effectivePerPage,
      };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SET_PAGE':
      return { ...state, page: action.payload };
    case 'SET_PER_PAGE':
      // User explicitly chose a value: drives both the request and the display.
      return { ...state, perPage: action.payload, effectivePerPage: action.payload, page: 1 };
    case 'SET_STATUS':
      return { ...state, status: action.payload, page: 1 };
    case 'SET_SCOPE':
      return { ...state, scope: action.payload, page: 1 };
    case 'OPEN_DETAILS_START':
      return { ...state, detailsLoading: true, error: '' };
    case 'OPEN_DETAILS_SUCCESS':
      return { ...state, detailsLoading: false, selectedBilling: action.payload };
    case 'OPEN_DETAILS_ERROR':
      return { ...state, detailsLoading: false, error: action.payload };
    case 'CLOSE_DETAILS':
      return { ...state, selectedBilling: null };
    case 'SUBMITTING':
      return { ...state, submitting: true, error: '', success: '' };
    case 'SUBMIT_SUCCESS':
      return { ...state, submitting: false, success: action.payload, selectedBilling: null };
    case 'SUBMIT_ERROR':
      return { ...state, submitting: false, error: action.payload };
    case 'CLEAR_SUCCESS':
      return { ...state, success: '' };
    case 'DECREMENT_PAGE':
      return { ...state, page: Math.max(state.page - 1, 1) };
    default:
      return state;
  }
}

// ─── Sub-components (stable props → rarely re-render) ───────────────────────
const Spinner = memo(function Spinner({ size = 20, style }) {
  return (
    <>
      <style>{SPINNER_STYLE}</style>
      <span
        aria-label="Loading"
        role="status"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          border: '2px solid var(--line, #e0e0e0)',
          borderTopColor: 'var(--color-primary, #29d22c)',
          borderRadius: '50%',
          animation: 'billing-spin 0.7s linear infinite',
          flexShrink: 0,
          ...style,
        }}
      />
    </>
  );
});

const BillingStatusBadge = memo(function BillingStatusBadge({ billing }) {
  if (billing?.deleted_at) return <span className="status-badge danger">trashed</span>;
  if (billing?.is_draft) return <span className="status-badge warning">draft</span>;
  return <span className={`status-badge ${billing.status}`}>{billing.status}</span>;
});

// Memoised row: only re-renders when its own billing data or submitting flag changes
const BillingRow = memo(function BillingRow({
  billing,
  currencyCode,
  submitting,
  onOpenDetails,
  onRestore,
  onDelete,
}) {
  const isDeleted = !!billing.deleted_at;
  const canDelete = !isDeleted && billing.is_draft;
  const canRestore = isDeleted;

  return (
    <tr className={isDeleted ? 'row-soft-deleted' : ''}>
      <td>{getBillingDisplayRef(billing)}</td>
      <td>{billing.customer?.full_name || 'Walk-in customer'}</td>
      <td>{currency(Number(billing.total || 0), currencyCode)}</td>
      <td>{currency(Number(billing.paid_amount || 0), currencyCode)}</td>
      <td>{currency(Number(billing.balance_due || 0), currencyCode)}</td>
      <td><BillingStatusBadge billing={billing} /></td>
      <td>{billing.billing_date ? formatDateTime(billing.billing_date) : '-'}</td>
      <td>{billing.deleted_at ? formatDateTime(billing.deleted_at) : '-'}</td>
      <td>
        <div className="row-actions compact">
          {!isDeleted && (
            <button className="ghost-button" onClick={() => onOpenDetails(billing.billing_id)} disabled={submitting}>
              View
            </button>
          )}
          {canRestore && (
            <button className="ghost-button" onClick={() => onRestore(billing.billing_id)} disabled={submitting}>
              Restore
            </button>
          )}
          {canDelete && (
            <button className="ghost-button danger-button" onClick={() => onDelete(billing)} disabled={submitting}>
              Trash
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

// ─── Main page ───────────────────────────────────────────────────────────────
export default function AdminBillingsPage() {
  const { can } = useAuth();
  const { stores, storeId } = useStore();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const {
    billings, meta, page, perPage, effectivePerPage,
    loading, status, scope,
    selectedBilling, detailsLoading,
    error, success, submitting,
  } = state;

  // Stable derived values
  const currentStore = useMemo(
    () => stores.find((s) => String(s.store_id) === String(storeId)),
    [stores, storeId]
  );
  const printSettings = useMemo(() => mergeStoreSettings(currentStore), [currentStore]);
  const currencyCode = currentStore?.currency;

  const canManageBillings = useMemo(
    () => (typeof can === 'function'
      ? can('billings.manage') || can('billing.manage') || can('billings.view')
      : true),
    [can]
  );

  const latestSelectedPayment = useMemo(
    () => getLatestPayment(selectedBilling),
    [selectedBilling]
  );

  const selectedBillingRef = useMemo(
    () => getBillingDisplayRef(selectedBilling),
    [selectedBilling]
  );

  // Build params object only when the values that affect the API actually change.
  // per_page is included only once the user has explicitly chosen a value —
  // otherwise it's omitted so the backend's own default applies. Note this
  // depends on `perPage` (the user's choice), not `effectivePerPage` (the
  // backend-learned display value), so syncing the dropdown after a response
  // never causes a second, redundant fetch.
  const billingParams = useMemo(() => {
    const params = { page, store_id: storeId };
    if (perPage != null) params.per_page = perPage;
    if (status && status !== 'draft') params.status = status;
    if (status === 'draft') params.is_draft = true;
    if (scope === 'trashed') params.only_trashed = true;
    else if (scope === 'all') params.with_trashed = true;
    return params;
  }, [page, perPage, storeId, status, scope]);

  // Race-condition guard
  const requestRef = useRef(0);

  // ── Reset when store changes (single dispatch, single re-render) ──────────
  useEffect(() => {
    dispatch({ type: 'RESET_FOR_STORE' });
  }, [storeId]);

  // ── Load billings (sequential: wait for previous request to settle) ───────
  const loadBillings = useCallback(async () => {
    if (!storeId) return;

    const requestId = ++requestRef.current;

    // Only show the full-page spinner on the very first load (no data yet)
    if (!billings.length) {
      dispatch({ type: 'SET_LOADING', payload: true });
    }

    try {
      const response = await billingService.list(billingParams);

      // Discard stale responses from superseded requests
      if (requestId !== requestRef.current) return;

      // extractPaginated's second arg is just a fallback for malformed
      // responses, not the value that should govern requests, so pass
      // perPage (which may be undefined) rather than a hardcoded constant.
      const parsed = extractPaginated(response, perPage);
      dispatch({
        type: 'LOAD_SUCCESS',
        billings: parsed.data || [],
        meta: parsed.meta || { ...EMPTY_META },
      });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      dispatch({
        type: 'LOAD_ERROR',
        payload: err?.response?.data?.message || 'Unable to load billing records.',
      });
    }
  }, [storeId, billingParams, perPage, billings.length]);

  // Trigger load whenever params change
  useEffect(() => {
    loadBillings();
  }, [loadBillings]);

  // ── Auto-clear success banner ─────────────────────────────────────────────
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS' }), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Open billing detail: await fetch, then show modal ────────────────────
  const openDetails = useCallback(async (billingId) => {
    dispatch({ type: 'OPEN_DETAILS_START' });

    try {
      const response = await billingService.show(billingId);
      // Await fully resolved before updating state
      dispatch({ type: 'OPEN_DETAILS_SUCCESS', payload: extractRecord(response) });
    } catch (err) {
      dispatch({
        type: 'OPEN_DETAILS_ERROR',
        payload: err?.response?.data?.message || 'Unable to load billing detail.',
      });
    }
  }, []);

  // ── Delete: await destroy, then await reload ──────────────────────────────
  const handleDelete = useCallback(async (billing) => {
    if (!window.confirm('Move this billing to trash?')) return;

    dispatch({ type: 'SUBMITTING' });

    try {
      const destroyFn = billingService.destroy ?? billingService.delete;
      if (typeof destroyFn !== 'function') throw new Error('Delete method not available.');

      // 1. Wait for delete to complete
      await destroyFn(billing.billing_id);

      dispatch({ type: 'SUBMIT_SUCCESS', payload: 'Billing moved to trash successfully.' });

      // 2. Then reload — go back a page if we just emptied it
      if (billings.length === 1 && page > 1) {
        dispatch({ type: 'DECREMENT_PAGE' });
      } else {
        // 3. Await reload before releasing control
        await loadBillings();
      }
    } catch (err) {
      dispatch({
        type: 'SUBMIT_ERROR',
        payload: err?.response?.data?.message || err?.message || 'Unable to delete billing.',
      });
    }
  }, [billings.length, page, loadBillings]);

  // ── Restore: await restore, then await reload ─────────────────────────────
  const handleRestore = useCallback(async (billingId) => {
    if (!window.confirm('Restore this billing from trash?')) return;
    if (typeof billingService.restore !== 'function') {
      dispatch({ type: 'SUBMIT_ERROR', payload: 'Restore method not found.' });
      return;
    }

    dispatch({ type: 'SUBMITTING' });

    try {
      // 1. Wait for restore to complete
      await billingService.restore(billingId);

      dispatch({ type: 'SUBMIT_SUCCESS', payload: 'Billing restored successfully.' });

      // 2. Then reload
      if (billings.length === 1 && page > 1) {
        dispatch({ type: 'DECREMENT_PAGE' });
      } else {
        // 3. Await reload before releasing control
        await loadBillings();
      }
    } catch (err) {
      dispatch({
        type: 'SUBMIT_ERROR',
        payload: err?.response?.data?.message || err?.message || 'Unable to restore billing.',
      });
    }
  }, [billings.length, page, loadBillings]);

  // ── Stable event handlers (no inline lambdas in JSX) ─────────────────────
  const handleStatusChange = useCallback(
    (e) => dispatch({ type: 'SET_STATUS', payload: e.target.value }),
    []
  );
  const handleScopeChange = useCallback(
    (e) => dispatch({ type: 'SET_SCOPE', payload: e.target.value }),
    []
  );
  const handlePerPageChange = useCallback(
    (e) => dispatch({ type: 'SET_PER_PAGE', payload: Number(e.target.value) }),
    []
  );
  const handlePrevPage = useCallback(
    () => dispatch({ type: 'SET_PAGE', payload: Math.max(page - 1, 1) }),
    [page]
  );
  const handleNextPage = useCallback(
    () => dispatch({ type: 'SET_PAGE', payload: Math.min(page + 1, meta.last_page || 1) }),
    [page, meta.last_page]
  );
  const closeDetails = useCallback(() => dispatch({ type: 'CLOSE_DETAILS' }), []);

  // Print/download handlers — stable, no state deps
  const handlePrintInvoice = useCallback(
    () => openBillingPrint(selectedBilling, currentStore, 'invoice', printSettings),
    [selectedBilling, currentStore, printSettings]
  );
  const handleDownloadInvoice = useCallback(
    () => downloadBillingDocument(selectedBilling, 'invoice'),
    [selectedBilling]
  );
  const handlePrintReceipt = useCallback(
    () => openBillingPrint(selectedBilling, currentStore, 'receipt', printSettings),
    [selectedBilling, currentStore, printSettings]
  );
  const handleDownloadReceipt = useCallback(
    () => downloadBillingDocument(selectedBilling, 'receipt'),
    [selectedBilling]
  );
  const handleDeleteSelected = useCallback(
    () => handleDelete(selectedBilling),
    [handleDelete, selectedBilling]
  );
  const handleRestoreSelected = useCallback(
    () => handleRestore(selectedBilling?.billing_id),
    [handleRestore, selectedBilling]
  );

  const isPaid = selectedBilling?.status === 'paid';
  const hasPayments = !!selectedBilling?.payments?.length;

  // Whatever is currently in effect (user choice, or backend-learned default
  // once known), for the dropdown's value.
  const displayedPerPage = effectivePerPage ?? meta.per_page ?? '';

  // Ensure the dropdown always has an option matching the current value,
  // even if it isn't one of the hardcoded common choices.
  const pageSizeOptions = useMemo(() => {
    const opts = new Set(PAGE_SIZE_OPTIONS);
    if (displayedPerPage !== '') opts.add(Number(displayedPerPage));
    return Array.from(opts).sort((a, b) => a - b);
  }, [displayedPerPage]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="stack-lg">
      {/* Header */}
      <div className="section-header" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h3>Billings</h3>
          <p>Accounting and finance view for managers. Track legal billing references, totals, payments, balances, and tax-related records.</p>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="users-toolbar-row">
        <div className="users-toolbar-controls">
          <select
            className="select-input users-filter-select"
            value={status}
            onChange={handleStatusChange}
            disabled={!storeId}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>

          <select
            className="select-input users-filter-select"
            value={scope}
            onChange={handleScopeChange}
            disabled={!storeId}
          >
            <option value="active">Active only</option>
            <option value="trashed">Trash only</option>
            <option value="all">All records</option>
          </select>

          <div className="users-toolbar-divider" />

          <div className="users-perpage-wrap">
            <select value={displayedPerPage} onChange={handlePerPageChange} disabled={!storeId}>
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>

          <div className="users-toolbar-divider" />

          <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
        </div>
      </div>

      {/* Table card */}
      <article className="card">
        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}
        <div className="table-wrap">
          {loading && !billings.length ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
              <Spinner size={32} />
            </div>
          ) : (
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
                  <tr><td colSpan="9">Select a store first.</td></tr>
                ) : billings.length ? (
                  billings.map((billing) => (
                    <BillingRow
                      key={billing.billing_id}
                      billing={billing}
                      currencyCode={currencyCode}
                      submitting={submitting}
                      onOpenDetails={openDetails}
                      onRestore={handleRestore}
                      onDelete={handleDelete}
                    />
                  ))
                ) : (
                  <tr><td colSpan="9">No billings found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {storeId ? (
          <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span className="muted">
              {meta.from && meta.to
                ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
                : `${billings.length} items`}
            </span>
            <div className="row-actions compact">
              <button type="button" className="ghost-button" onClick={handlePrevPage} disabled={loading || !meta.has_prev_page}>
                Previous
              </button>
              <button type="button" className="ghost-button" onClick={handleNextPage} disabled={loading || !meta.has_next_page}>
                Next
              </button>
            </div>
          </div>
        ) : null}
      </article>

      {/* Detail modal */}
      <Modal
        open={!!selectedBilling || detailsLoading}
        title="Billing details"
        onClose={closeDetails}
        width="920px"
      >
        {detailsLoading && !selectedBilling ? (
          <div className="stack-md" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
            <Spinner size={36} />
          </div>
        ) : selectedBilling ? (
          <div className="stack-md">
            {/* Meta grid */}
            <div className="detail-grid">
              <div>
                <p className="muted">Billing ref</p>
                <strong>{selectedBillingRef}</strong>
              </div>
              <div>
                <p className="muted">Customer</p>
                <strong>{selectedBilling.customer?.full_name || 'Walk-in customer'}</strong>
              </div>
              <div>
                <p className="muted">Status</p>
                <strong>
                  {selectedBilling.deleted_at ? 'trashed' : selectedBilling.is_draft ? 'draft' : selectedBilling.status}
                </strong>
              </div>
              <div>
                <p className="muted">Billing date</p>
                <strong>{selectedBilling.billing_date ? formatDateTime(selectedBilling.billing_date) : '-'}</strong>
              </div>
              <div>
                <p className="muted">Paid amount</p>
                <strong>{currency(Number(selectedBilling.paid_amount || 0), currencyCode)}</strong>
              </div>
              <div>
                <p className="muted">Balance due</p>
                <strong>{currency(Number(selectedBilling.balance_due || 0), currencyCode)}</strong>
              </div>
              <div>
                <p className="muted">Latest receipt</p>
                <strong>{latestSelectedPayment?.receiptnumber || '-'}</strong>
              </div>
              <div>
                <p className="muted">Stock applied</p>
                <strong>{selectedBilling.stock_applied_at ? formatDateTime(selectedBilling.stock_applied_at) : '-'}</strong>
              </div>
            </div>

            {selectedBilling.notes ? (
              <div className="card" style={{ padding: '12px 16px' }}>
                <p className="muted">Notes</p>
                <strong>{selectedBilling.notes}</strong>
              </div>
            ) : null}

            {/* Items table */}
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
                        <td>{currency(Number(item.unit_price || 0), currencyCode)}</td>
                        <td>
                          {currency(
                            Number(
                              item.total_amount ?? item.line_total ?? item.line_subtotal ??
                              (Number(item.quantity || 0) * Number(item.unit_price || 0))
                            ),
                            currencyCode
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="4">No items found for this billing.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="billing-summary-grid">
              <div className="summary-box">
                <span>Subtotal</span>
                <strong>{currency(Number(selectedBilling.subtotal || 0), currencyCode)}</strong>
              </div>
              <div className="summary-box">
                <span>VAT</span>
                <strong>{currency(Number(selectedBilling.vat_amount || 0), currencyCode)}</strong>
              </div>
              <div className="summary-box">
                <span>Paid</span>
                <strong>{currency(Number(selectedBilling.paid_amount || 0), currencyCode)}</strong>
              </div>
              <div className="summary-box">
                <span>Balance</span>
                <strong>{currency(Number(selectedBilling.balance_due || 0), currencyCode)}</strong>
              </div>
            </div>

            {/* Payments table */}
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
                  {hasPayments ? (
                    selectedBilling.payments.map((payment) => (
                      <tr key={payment.payment_id}>
                        <td>{payment.receiptnumber || '-'}</td>
                        <td>{payment.payment_method || '-'}</td>
                        <td>{currency(Number(payment.amount_received || 0), currencyCode)}</td>
                        <td>{currency(Number(payment.amount_tendered || 0), currencyCode)}</td>
                        <td>{currency(Number(payment.change_returned || 0), currencyCode)}</td>
                        <td>{payment.payment_date ? formatDateTime(payment.payment_date) : '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="6">No payments recorded for this billing.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Actions:
                - paid status → receipt buttons (not invoice)
                - unpaid/partial/draft → invoice buttons
                - trashed → restore only
            */}
            <div className="row-actions">
              {!selectedBilling.deleted_at ? (
                <>
                  {isPaid ? (
                    /* Paid: show receipt */
                    <>
                      <button className="primary-button" onClick={handlePrintReceipt}>
                        Print receipt
                      </button>
                      <button className="ghost-button" onClick={handleDownloadReceipt}>
                        Download receipt
                      </button>
                    </>
                  ) : (
                    /* Unpaid / partial / draft: show invoice + receipt if payments exist */
                    <>
                      <button className="primary-button" onClick={handlePrintInvoice}>
                        Print invoice
                      </button>
                      <button className="ghost-button" onClick={handleDownloadInvoice}>
                        Download invoice
                      </button>
                      {hasPayments && (
                        <>
                          <button className="ghost-button" onClick={handlePrintReceipt}>
                            Print receipt
                          </button>
                          <button className="ghost-button" onClick={handleDownloadReceipt}>
                            Download receipt
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {selectedBilling.is_draft && (
                    <button
                      className="ghost-button danger-button"
                      onClick={handleDeleteSelected}
                      disabled={submitting || !canManageBillings}
                    >
                      Move to trash
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="primary-button"
                  onClick={handleRestoreSelected}
                  disabled={submitting || !canManageBillings}
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