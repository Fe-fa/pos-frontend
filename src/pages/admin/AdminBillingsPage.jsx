import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
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

const EMPTY_SUMMARY = {
  total_billed: 0,
  outstanding: 0,
  draft_outstanding: 0,
  partial_outstanding: 0,
  billed_today: 0,
  average_ticket: 0,
  active_draft_count: 0,
};

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

const formatLocalDateInput = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getDateRangeParams = (rangeKey) => {
  if (!rangeKey || rangeKey === 'all') return {};

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (rangeKey === 'today') {
    const value = formatLocalDateInput(now);
    return { date_from: value, date_to: value };
  }

  if (rangeKey === 'yesterday') {
    start.setDate(start.getDate() - 1);
    const value = formatLocalDateInput(start);
    return { date_from: value, date_to: value };
  }

  if (rangeKey === 'this_week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(now.getDate() - diff);
    return {
      date_from: formatLocalDateInput(start),
      date_to: formatLocalDateInput(end),
    };
  }

  if (rangeKey === 'this_month') {
    start.setDate(1);
    return {
      date_from: formatLocalDateInput(start),
      date_to: formatLocalDateInput(end),
    };
  }

  return {};
};

const computeSummaryFromRows = (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const today = formatLocalDateInput(new Date());

  const billedTodayRows = safeRows.filter((row) => {
    if (!row?.billing_date) return false;
    const parsed = new Date(row.billing_date);
    if (Number.isNaN(parsed.getTime())) return false;
    return formatLocalDateInput(parsed) === today;
  });

  const billedTodayTotal = billedTodayRows.reduce(
    (sum, row) => sum + Number(row?.total || 0),
    0
  );

  return {
    total_billed: safeRows.reduce((sum, row) => sum + Number(row?.total || 0), 0),
    outstanding: safeRows.reduce((sum, row) => sum + Number(row?.balance_due || 0), 0),
    draft_outstanding: safeRows
      .filter((row) => row?.is_draft)
      .reduce((sum, row) => sum + Number(row?.balance_due || 0), 0),
    partial_outstanding: safeRows
      .filter((row) => row?.status === 'partial')
      .reduce((sum, row) => sum + Number(row?.balance_due || 0), 0),
    billed_today: billedTodayTotal,
    average_ticket: billedTodayRows.length ? billedTodayTotal / billedTodayRows.length : 0,
    active_draft_count: safeRows.filter((row) => row?.is_draft && !row?.deleted_at).length,
  };
};

const getCashierName = (billing) => {
  const first = billing?.user?.first_name || '';
  const last = billing?.user?.last_name || '';
  const full = `${first} ${last}`.trim();
  return full || billing?.user?.email || '-';
};

const getPaymentMode = (billing) =>
  String(getSortedPayments(billing)[0]?.payment_method || '').trim().toLowerCase();

const csvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const exportBillingsCsv = (rows, currencyCode) => {
  if (!Array.isArray(rows) || !rows.length) return;

  const headers = [
    'Billing Ref',
    'Customer',
    'Total',
    'Tax Collected',
    'Cashier',
    'Paid',
    'Balance',
    'Status',
    'Payment Mode',
    'Billing Date',
  ];

  const body = rows.map((billing) => [
    getBillingDisplayRef(billing),
    billing.customer?.full_name || 'Walk-in customer',
    currency(Number(billing.total || 0), currencyCode),
    currency(Number(billing.vat_amount || 0), currencyCode),
    getCashierName(billing),
    currency(Number(billing.paid_amount || 0), currencyCode),
    currency(Number(billing.balance_due || 0), currencyCode),
    billing.deleted_at ? 'trashed' : billing.is_draft ? 'draft' : billing.status,
    getPaymentMode(billing) || '-',
    billing.billing_date ? formatDateTime(billing.billing_date) : '-',
  ]);

  const csv = [headers, ...body].map((row) => row.map(csvValue).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `billings-${formatLocalDateInput(new Date())}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const INITIAL_STATE = {
  billings: [],
  meta: { ...EMPTY_META },
  summary: { ...EMPTY_SUMMARY },

  page: 1,
  perPage: undefined,
  effectivePerPage: undefined,

  loading: false,
  status: '',
  scope: 'active',

  search: '',
  cashier: '',
  paymentMode: '',
  dateRange: 'all',

  selectedIds: [],
  bulkAction: 'export_csv',

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
        summary: action.summary || { ...EMPTY_SUMMARY },
        selectedIds: [],
        effectivePerPage:
          action.meta?.per_page != null ? action.meta.per_page : state.effectivePerPage,
      };

    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.payload };

    case 'SET_PAGE':
      return { ...state, page: action.payload, selectedIds: [] };

    case 'SET_PER_PAGE':
      return {
        ...state,
        perPage: action.payload,
        effectivePerPage: action.payload,
        page: 1,
        selectedIds: [],
      };

    case 'SET_STATUS':
      return { ...state, status: action.payload, page: 1, selectedIds: [] };

    case 'SET_SCOPE':
      return { ...state, scope: action.payload, page: 1, selectedIds: [] };

    case 'SET_SEARCH':
      return { ...state, search: action.payload, page: 1, selectedIds: [] };

    case 'SET_CASHIER':
      return { ...state, cashier: action.payload, page: 1, selectedIds: [] };

    case 'SET_PAYMENT_MODE':
      return { ...state, paymentMode: action.payload, page: 1, selectedIds: [] };

    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.payload, page: 1, selectedIds: [] };

    case 'SET_BULK_ACTION':
      return { ...state, bulkAction: action.payload };

    case 'TOGGLE_SELECT': {
      const exists = state.selectedIds.includes(action.payload);
      return {
        ...state,
        selectedIds: exists
          ? state.selectedIds.filter((id) => id !== action.payload)
          : [...state.selectedIds, action.payload],
      };
    }

    case 'TOGGLE_SELECT_ALL': {
      const current = new Set(state.selectedIds);
      action.ids.forEach((id) => {
        if (action.checked) current.add(id);
        else current.delete(id);
      });
      return { ...state, selectedIds: Array.from(current) };
    }

    case 'CLEAR_SELECTION':
      return { ...state, selectedIds: [] };

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
      return { ...state, page: Math.max(state.page - 1, 1), selectedIds: [] };

    default:
      return state;
  }
}

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

export default function AdminBillingsPage() {
  const { can } = useAuth();
  const { stores, storeId } = useStore();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const requestRef = useRef(0);

  const {
    billings,
    meta,
    summary,
    page,
    perPage,
    effectivePerPage,
    loading,
    status,
    scope,
    search,
    cashier,
    paymentMode,
    dateRange,
    selectedIds,
    bulkAction,
    selectedBilling,
    detailsLoading,
    error,
    success,
    submitting,
  } = state;

  const currentStore = useMemo(
    () => stores.find((store) => String(store.store_id) === String(storeId)),
    [stores, storeId]
  );

  const printSettings = useMemo(() => mergeStoreSettings(currentStore), [currentStore]);
  const currencyCode = currentStore?.currency;

  const canManageBillings = useMemo(
    () =>
      typeof can === 'function'
        ? can('billings.manage') || can('billing.manage') || can('billings.view')
        : true,
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

  const selectedPayments = useMemo(
    () => getSortedPayments(selectedBilling),
    [selectedBilling]
  );

  const cashierOptions = useMemo(() => {
    const map = new Map();

    billings.forEach((billing) => {
      if (!billing?.user?.user_id) return;
      const full = `${billing.user.first_name || ''} ${billing.user.last_name || ''}`.trim();
      map.set(String(billing.user.user_id), {
        value: String(billing.user.user_id),
        label: full || billing.user.email || `User ${billing.user.user_id}`,
      });
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [billings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const dateParams = useMemo(() => getDateRangeParams(dateRange), [dateRange]);

  const billingParams = useMemo(() => {
    const params = { page, store_id: storeId };

    // Keep backend default per_page unless user explicitly chooses a value.
    if (perPage != null) params.per_page = perPage;

    if (status && status !== 'draft') params.status = status;
    if (status === 'draft') params.is_draft = true;

    if (scope === 'trashed') params.only_trashed = true;
    else if (scope === 'all') params.with_trashed = true;

    if (debouncedSearch) params.search = debouncedSearch;
    if (cashier) params.user_id = cashier;
    if (paymentMode) params.payment_method = paymentMode;
    if (dateParams.date_from) params.date_from = dateParams.date_from;
    if (dateParams.date_to) params.date_to = dateParams.date_to;

    return params;
  }, [page, perPage, storeId, status, scope, debouncedSearch, cashier, paymentMode, dateParams]);

  useEffect(() => {
    dispatch({ type: 'RESET_FOR_STORE' });
  }, [storeId]);

  const loadBillings = useCallback(async () => {
    if (!storeId) return;

    const requestId = ++requestRef.current;
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const response = await billingService.list(billingParams);

      if (requestId !== requestRef.current) return;

      const parsed = extractPaginated(response, perPage);
      const nextRows = parsed.data || [];

      dispatch({
        type: 'LOAD_SUCCESS',
        billings: nextRows,
        meta: parsed.meta || { ...EMPTY_META },
        summary: response?.summary || computeSummaryFromRows(nextRows),
      });
    } catch (err) {
      if (requestId !== requestRef.current) return;

      dispatch({
        type: 'LOAD_ERROR',
        payload: err?.response?.data?.message || 'Unable to load billing records.',
      });
    }
  }, [storeId, billingParams, perPage]);

  useEffect(() => {
    loadBillings();
  }, [loadBillings]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_SUCCESS' }), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const openDetails = useCallback(async (billingId) => {
    dispatch({ type: 'OPEN_DETAILS_START' });

    try {
      const response = await billingService.show(billingId);
      dispatch({ type: 'OPEN_DETAILS_SUCCESS', payload: extractRecord(response) });
    } catch (err) {
      dispatch({
        type: 'OPEN_DETAILS_ERROR',
        payload: err?.response?.data?.message || 'Unable to load billing detail.',
      });
    }
  }, []);

  const handleDelete = useCallback(
    async (billing) => {
      if (!billing?.billing_id) return;
      if (!window.confirm('Move this billing to trash?')) return;

      dispatch({ type: 'SUBMITTING' });

      try {
        const destroyFn =
          billingService.destroy ?? billingService.delete ?? billingService.remove;

        if (typeof destroyFn !== 'function') {
          throw new Error('Delete method not available.');
        }

        await destroyFn(billing.billing_id);

        dispatch({
          type: 'SUBMIT_SUCCESS',
          payload: 'Billing moved to trash successfully.',
        });

        if (billings.length === 1 && page > 1) {
          dispatch({ type: 'DECREMENT_PAGE' });
        } else {
          await loadBillings();
        }
      } catch (err) {
        dispatch({
          type: 'SUBMIT_ERROR',
          payload: err?.response?.data?.message || err?.message || 'Unable to delete billing.',
        });
      }
    },
    [billings.length, page, loadBillings]
  );

  const handleRestore = useCallback(
    async (billingId) => {
      if (!billingId) return;
      if (!window.confirm('Restore this billing from trash?')) return;

      if (typeof billingService.restore !== 'function') {
        dispatch({ type: 'SUBMIT_ERROR', payload: 'Restore method not found.' });
        return;
      }

      dispatch({ type: 'SUBMITTING' });

      try {
        await billingService.restore(billingId);

        dispatch({
          type: 'SUBMIT_SUCCESS',
          payload: 'Billing restored successfully.',
        });

        if (billings.length === 1 && page > 1) {
          dispatch({ type: 'DECREMENT_PAGE' });
        } else {
          await loadBillings();
        }
      } catch (err) {
        dispatch({
          type: 'SUBMIT_ERROR',
          payload: err?.response?.data?.message || err?.message || 'Unable to restore billing.',
        });
      }
    },
    [billings.length, page, loadBillings]
  );

  const handleSearchChange = useCallback(
    (e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value }),
    []
  );

  const handleStatusChange = useCallback(
    (e) => dispatch({ type: 'SET_STATUS', payload: e.target.value }),
    []
  );

  const handleScopeChange = useCallback(
    (e) => dispatch({ type: 'SET_SCOPE', payload: e.target.value }),
    []
  );

  const handleCashierChange = useCallback(
    (e) => dispatch({ type: 'SET_CASHIER', payload: e.target.value }),
    []
  );

  const handlePaymentModeChange = useCallback(
    (e) => dispatch({ type: 'SET_PAYMENT_MODE', payload: e.target.value }),
    []
  );

  const handleDateRangeChange = useCallback(
    (e) => dispatch({ type: 'SET_DATE_RANGE', payload: e.target.value }),
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

  const handleSync = useCallback(() => {
    loadBillings();
  }, [loadBillings]);

  const closeDetails = useCallback(() => dispatch({ type: 'CLOSE_DETAILS' }), []);

  const handleToggleSelect = useCallback(
    (billingId) => dispatch({ type: 'TOGGLE_SELECT', payload: billingId }),
    []
  );

  const visibleIds = useMemo(
    () => billings.map((billing) => billing.billing_id),
    [billings]
  );

  const allVisibleSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id)),
    [visibleIds, selectedIds]
  );

  const handleToggleSelectAll = useCallback(
    (e) =>
      dispatch({
        type: 'TOGGLE_SELECT_ALL',
        ids: visibleIds,
        checked: e.target.checked,
      }),
    [visibleIds]
  );

  const selectedRows = useMemo(
    () => billings.filter((billing) => selectedIds.includes(billing.billing_id)),
    [billings, selectedIds]
  );

  const handleBulkActionChange = useCallback(
    (e) => dispatch({ type: 'SET_BULK_ACTION', payload: e.target.value }),
    []
  );

  const handleExportSelected = useCallback(() => {
    exportBillingsCsv(selectedRows, currencyCode);
  }, [selectedRows, currencyCode]);

  const handleBulkApply = useCallback(async () => {
    if (!selectedRows.length) return;

    if (bulkAction === 'export_csv') {
      exportBillingsCsv(selectedRows, currencyCode);
      return;
    }

    if (bulkAction === 'clear_selection') {
      dispatch({ type: 'CLEAR_SELECTION' });
      return;
    }

    if (bulkAction === 'archive_selected') {
      const eligible = selectedRows.filter((billing) => !billing.deleted_at && billing.is_draft);

      if (!eligible.length) {
        dispatch({
          type: 'SUBMIT_ERROR',
          payload: 'Only active draft billings can be archived in bulk.',
        });
        return;
      }

      if (!window.confirm(`Move ${eligible.length} selected draft billing(s) to trash?`)) {
        return;
      }

      dispatch({ type: 'SUBMITTING' });

      try {
        const destroyFn =
          billingService.destroy ?? billingService.delete ?? billingService.remove;

        if (typeof destroyFn !== 'function') {
          throw new Error('Delete method not available.');
        }

        for (const billing of eligible) {
          // sequential to keep server-side state predictable
          // and error handling easy to surface.
          // eslint-disable-next-line no-await-in-loop
          await destroyFn(billing.billing_id);
        }

        dispatch({
          type: 'SUBMIT_SUCCESS',
          payload: `${eligible.length} billing(s) moved to trash successfully.`,
        });

        await loadBillings();
      } catch (err) {
        dispatch({
          type: 'SUBMIT_ERROR',
          payload: err?.response?.data?.message || err?.message || 'Bulk archive failed.',
        });
      }
    }
  }, [selectedRows, bulkAction, currencyCode, loadBillings]);

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

  const handleDeleteSelected = useCallback(() => {
    if (selectedBilling) handleDelete(selectedBilling);
  }, [handleDelete, selectedBilling]);

  const handleRestoreSelected = useCallback(() => {
    if (selectedBilling?.billing_id) handleRestore(selectedBilling.billing_id);
  }, [handleRestore, selectedBilling]);

  const isPaid = selectedBilling?.status === 'paid';
  const hasPayments = !!selectedBilling?.payments?.length;

  const displayedPerPage = effectivePerPage ?? meta.per_page ?? '';

  const pageSizeOptions = useMemo(() => {
    const options = new Set(PAGE_SIZE_OPTIONS);
    if (displayedPerPage !== '') options.add(Number(displayedPerPage));
    return Array.from(options).sort((a, b) => a - b);
  }, [displayedPerPage]);

  const hasPrevPage =
    meta?.has_prev_page ??
    (typeof meta?.current_page === 'number' ? meta.current_page > 1 : page > 1);

  const hasNextPage =
    meta?.has_next_page ??
    (typeof meta?.current_page === 'number' && typeof meta?.last_page === 'number'
      ? meta.current_page < meta.last_page
      : false);

  return (
    <section className="stack-lg billings-admin-page">
      <div className="section-header billings-page-header" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h3>Billings</h3>
          <p>
            Accounting, audit, and operational ledger for managers. Track legal billing
            references, totals, tax, payments, balances, cashier activity, and trash / restore
            actions without changing the backend-driven pagination default.
          </p>
        </div>

        <button
          type="button"
          className="primary-button users-create-btn"
          onClick={handleSync}
          disabled={!storeId || loading}
        >
          <RefreshCw size={16} />
          Force Sync
        </button>
      </div>

      <div className="billings-summary-grid">
        <article className="billings-summary-card">
          <span>Total billed amount</span>
          <strong>{currency(Number(summary.total_billed || 0), currencyCode)}</strong>
          <small>Across current filtered result set</small>
        </article>

        <article className="billings-summary-card danger-tone">
          <span>Unpaid / outstanding revenue</span>
          <strong>{currency(Number(summary.outstanding || 0), currencyCode)}</strong>
          <small>
            {currency(Number(summary.draft_outstanding || 0), currencyCode)} from draft,{' '}
            {currency(Number(summary.partial_outstanding || 0), currencyCode)} partially paid
          </small>
        </article>

        <article className="billings-summary-card">
          <span>Billed today</span>
          <strong>{currency(Number(summary.billed_today || 0), currencyCode)}</strong>
          <small>
            Average ticket size {currency(Number(summary.average_ticket || 0), currencyCode)}
          </small>
        </article>

        <article className="billings-summary-card">
          <span>Active draft count</span>
          <strong>{summary.active_draft_count || 0}</strong>
          <small>Unfinalized / parked draft billings</small>
        </article>
      </div>

      <div className="billings-filters-card">
        <div className="billings-search-input">
          <Search size={16} />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by ref, customer, or cashier"
            disabled={!storeId}
          />
        </div>

        <select
          className="select-input users-filter-select"
          value={status}
          onChange={handleStatusChange}
          disabled={!storeId}
        >
          <option value="">Status (All)</option>
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

        <select
          className="select-input users-filter-select"
          value={cashier}
          onChange={handleCashierChange}
          disabled={!storeId}
        >
          <option value="">Cashier (All)</option>
          {cashierOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="select-input users-filter-select"
          value={paymentMode}
          onChange={handlePaymentModeChange}
          disabled={!storeId}
        >
          <option value="">Payment mode (All)</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="mpesa">MPESA</option>
        </select>

        <label className="billings-date-range-pill">
          <CalendarDays size={15} />
          <select value={dateRange} onChange={handleDateRangeChange} disabled={!storeId}>
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
          </select>
        </label>
      </div>

      <article className="card">
        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <div className="billings-table-toolbar">
          <select
            className="select-input"
            value={bulkAction}
            onChange={handleBulkActionChange}
            disabled={!storeId || !selectedIds.length}
          >
            <option value="export_csv">Export CSV</option>
            <option value="archive_selected">Archive selected</option>
            <option value="clear_selection">Clear selection</option>
          </select>

          <button
            type="button"
            className="primary-button"
            onClick={handleBulkApply}
            disabled={!storeId || !selectedIds.length || submitting}
          >
            Apply ({selectedIds.length})
          </button>

          <button
            type="button"
            className="ghost-button"
            onClick={handleExportSelected}
            disabled={!selectedIds.length}
          >
            Export (Selected Rows)
          </button>

          <div className="billings-table-toolbar-spacer" />

          <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>

          <div className="users-perpage-wrap">
            <select value={displayedPerPage} onChange={handlePerPageChange} disabled={!storeId}>
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>

        <div className="table-wrap" style={{ position: 'relative' }}>
          {loading && !billings.length ? (
            <div className="billings-loading-wrap">
              <Spinner size={32} />
            </div>
          ) : (
            <>
              {loading && billings.length ? (
                <div className="payments-loading-overlay" aria-hidden="true">
                  <Spinner size={28} />
                </div>
              ) : null}

              <table className="data-table billings-table-enhanced">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all billings"
                      />
                    </th>
                    <th>BILLING REF</th>
                    <th>CUSTOMER</th>
                    <th>TOTAL</th>
                    <th>TAX COLLECTED</th>
                    <th>CASHIER / OPERATOR</th>
                    <th>PAID</th>
                    <th>STATUS</th>
                    <th>PAYMENT MODE</th>
                    <th>DATE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>

                <tbody>
                  {!storeId ? (
                    <tr>
                      <td colSpan="11">Select a store first.</td>
                    </tr>
                  ) : billings.length ? (
                    billings.map((billing) => {
                      const paymentModeValue = getPaymentMode(billing);
                      const isDeleted = !!billing.deleted_at;
                      const canDelete = !isDeleted && billing.is_draft && canManageBillings;
                      const canRestore = isDeleted && canManageBillings;

                      return (
                        <tr key={billing.billing_id} className={isDeleted ? 'row-soft-deleted' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(billing.billing_id)}
                              onChange={() => handleToggleSelect(billing.billing_id)}
                              aria-label={`Select billing ${getBillingDisplayRef(billing)}`}
                            />
                          </td>

                          <td>
                            <div className="billings-cell-stack">
                              <strong>{getBillingDisplayRef(billing)}</strong>
                              <span className="muted">#{billing.billing_id}</span>
                            </div>
                          </td>

                          <td>
                            <div className="billings-cell-stack">
                              <strong>{billing.customer?.full_name || 'Walk-in customer'}</strong>
                              <span className="muted">
                                {billing.customer?.phone ||
                                  billing.customer?.email ||
                                  'No customer contact'}
                              </span>
                            </div>
                          </td>

                          <td>{currency(Number(billing.total || 0), currencyCode)}</td>
                          <td>{currency(Number(billing.vat_amount || 0), currencyCode)}</td>
                          <td>{getCashierName(billing)}</td>
                          <td>{currency(Number(billing.paid_amount || 0), currencyCode)}</td>
                          <td>
                            <BillingStatusBadge billing={billing} />
                          </td>
                          <td>
                            <span
                              className={`billings-payment-chip ${
                                paymentModeValue || 'neutral'
                              }`}
                            >
                              {paymentModeValue === 'cash'
                                ? 'Cash'
                                : paymentModeValue === 'card'
                                  ? 'Card'
                                  : paymentModeValue === 'mpesa'
                                    ? 'MPESA'
                                    : '-'}
                            </span>
                          </td>
                          <td>{billing.billing_date ? formatDateTime(billing.billing_date) : '-'}</td>
                          <td>
                            <div className="billings-row-actions">
                              {!isDeleted && Number(billing.balance_due || 0) > 0 ? (
                                <span className="billings-alert" title="Outstanding balance">
                                  <AlertCircle size={15} />
                                </span>
                              ) : null}

                              {!isDeleted ? (
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => openDetails(billing.billing_id)}
                                  disabled={submitting}
                                  title="View"
                                >
                                  <Eye size={16} />
                                </button>
                              ) : null}

                              {canRestore ? (
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => handleRestore(billing.billing_id)}
                                  disabled={submitting}
                                  title="Restore"
                                >
                                  <RotateCcw size={16} />
                                </button>
                              ) : null}

                              {canDelete ? (
                                <button
                                  type="button"
                                  className="icon-button danger-button"
                                  onClick={() => handleDelete(billing)}
                                  disabled={submitting}
                                  title="Trash"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="11">No billings found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>

        {storeId ? (
          <div
            className="row-actions"
            style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}
          >
            <span className="muted">
              {meta.from && meta.to
                ? `Page ${meta.current_page || page} of ${meta.last_page || 1} | Showing ${meta.from}–${meta.to} of ${meta.total}`
                : `${billings.length} items`}
            </span>
            <div className="row-actions compact">
              <button
                type="button"
                className="ghost-button"
                onClick={handlePrevPage}
                disabled={loading || !hasPrevPage}
              >
                Previous
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleNextPage}
                disabled={loading || !hasNextPage}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </article>

      <Modal
        open={!!selectedBilling || detailsLoading}
        title="Billing details"
        onClose={closeDetails}
        width="920px"
      >
        {detailsLoading && !selectedBilling ? (
          <div
            className="stack-md"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 0',
            }}
          >
            <Spinner size={36} />
          </div>
        ) : selectedBilling ? (
          <div className="stack-md">
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
                        <td>{currency(Number(item.unit_price || 0), currencyCode)}</td>
                        <td>
                          {currency(
                            Number(
                              item.total_amount ??
                                item.line_total ??
                                item.line_subtotal ??
                                Number(item.quantity || 0) * Number(item.unit_price || 0)
                            ),
                            currencyCode
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

            <div className="billing-summary-grid medium-layout">
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
              <div className="summary-box accent">
                <span>Balance</span>
                <strong>{currency(Number(selectedBilling.balance_due || 0), currencyCode)}</strong>
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
                  {hasPayments ? (
                    selectedPayments.map((payment) => (
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
                  {isPaid ? (
                    <>
                      <button className="primary-button" onClick={handlePrintReceipt}>
                        Print receipt
                      </button>
                      <button className="ghost-button" onClick={handleDownloadReceipt}>
                        Download receipt
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="primary-button" onClick={handlePrintInvoice}>
                        Print invoice
                      </button>
                      <button className="ghost-button" onClick={handleDownloadInvoice}>
                        Download invoice
                      </button>
                      {hasPayments ? (
                        <>
                          <button className="ghost-button" onClick={handlePrintReceipt}>
                            Print receipt
                          </button>
                          <button className="ghost-button" onClick={handleDownloadReceipt}>
                            Download receipt
                          </button>
                        </>
                      ) : null}
                    </>
                  )}

                  {selectedBilling.is_draft ? (
                    <button
                      className="ghost-button danger-button"
                      onClick={handleDeleteSelected}
                      disabled={submitting || !canManageBillings}
                    >
                      Move to trash
                    </button>
                  ) : null}
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
