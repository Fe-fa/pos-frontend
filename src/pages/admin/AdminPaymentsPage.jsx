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
  BadgeDollarSign,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  Eye,
  FileText,
  History,
  Printer,
  RefreshCw,
  Smartphone,
  Wallet,
    X, 
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import { useStore } from '../../contexts/StoreContext';
import { paymentService } from '../../services/paymentService';
import { currency, formatDateTime } from '../../utils/helpers';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { billingService } from '../../services/billingService';
import { categoryService } from '../../services/categoryService';
import { extractPaginated } from '../../utils/pagination';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const CARD_METHODS = ['card', 'visa', 'mastercard', 'pos'];
const DIGITAL_METHODS = ['mpesa', 'airtel_money', 'wallet', 'digital_wallet', 'bank'];
const DEFAULT_META = {
  current_page: 1,
  last_page: 1,
  per_page: 25,
  total: 0,
  from: 0,
  to: 0,
  has_prev_page: false,
  has_next_page: false,
};
const DEFAULT_SUMMARY = {
  filtered_count: 0,
  total_received: 0,
  cash_total: 0,
  card_total: 0,
  digital_total: 0,
  refunded_count: 0,
  failed_count: 0,
  average_ticket: 0,
};

const SPINNER_STYLE = `
@keyframes payments-spin {
  to { transform: rotate(360deg); }
}
`;

const LOCAL_PAGE_STYLES = `
.payments-page-wrapper {
  position: relative;
}

.payments-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.55);
  z-index: 20;
  border-radius: 12px;
  pointer-events: none;
}

.payments-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 16px;
}

.payments-hero-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.payments-hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.payments-toolbar-card {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 16px;
  box-shadow: var(--shadow-soft);
  padding: 16px;
  display: grid;
  gap: 14px;
}

.payments-toolbar-top {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.9fr);
  gap: 14px;
  align-items: start;
}

.payments-toolbar-left {
  display: grid;
  gap: 12px;
}

.payments-filter-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1.3fr) repeat(3, minmax(0, 180px));
  gap: 12px;
  align-items: center;
}

.payments-search-wrap {
  display: grid;
  gap: 6px;
}

.payments-preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.payments-preset-button {
  border: 1px solid var(--line);
  background: var(--white);
  color: var(--nav-text);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.payments-preset-button:hover {
  border-color: var(--hero-teal-2);
  background: var(--panel-2);
}

.payments-preset-button.active {
  background: var(--brand-blue);
  border-color: var(--brand-blue);
  color: #fff;
  box-shadow: 0 10px 20px rgba(14, 132, 195, 0.18);
}

.payments-custom-range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 180px));
  gap: 10px;
}

.payments-quick-panel {
  border: 1px solid var(--line);
  background: var(--panel-2);
  border-radius: 14px;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.payments-quick-panel h4 {
  font-size: 0.92rem;
  color: var(--text);
  margin: 0;
}

.payments-quick-list {
  display: grid;
  gap: 8px;
}

.payments-quick-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--white);
  border: 1px solid var(--line);
}

.payments-quick-item strong {
  font-size: 0.88rem;
  color: var(--text);
}

.payments-quick-item span {
  color: var(--muted);
  font-size: 0.78rem;
}

.payments-column-toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.payments-inline-chip {
  border: 1px solid var(--line);
  background: var(--white);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--nav-text);
  cursor: pointer;
  transition: all 0.18s ease;
}

.payments-inline-chip.active {
  background: #eef8fe;
  color: var(--brand-blue);
  border-color: #cfe7fb;
}

.payments-summary-note {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
  margin-top: 6px;
}

.payments-table-card {
  display: grid;
  gap: 14px;
}

.payments-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.payments-row-actions .ghost-button {
  min-height: 34px;
  padding: 8px 12px;
  font-size: 0.8rem;
  font-weight: 700;
}

.payments-trace-panel {
  display: grid;
  gap: 14px;
  padding: 12px 6px 4px;
}

.payments-trace-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.payments-trace-box {
  border: 1px solid var(--line);
  background: var(--panel-2);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 4px;
}

.payments-trace-box span {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.payments-trace-box strong {
  font-size: 0.92rem;
  color: var(--text);
}

.payments-activity-list {
  display: grid;
  gap: 10px;
}

.payments-activity-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--line);
  background: var(--white);
  border-radius: 12px;
  padding: 12px;
}

.payments-activity-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--brand-blue);
  margin-top: 6px;
  flex-shrink: 0;
}

.payments-activity-item strong {
  color: var(--text);
  font-size: 0.9rem;
}

.payments-activity-item p {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
  margin-top: 4px;
}

.payments-document-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.payments-items-table td,
.payments-items-table th {
  white-space: nowrap;
}

.payments-items-table td:nth-child(2) {
  white-space: normal;
  min-width: 220px;
}

.payments-footer-bar {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  align-items: center;
}

.payments-alert-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: #fff6df;
  border: 1px solid #f3e1b1;
  color: #b56d00;
  font-size: 0.8rem;
  font-weight: 800;
}

.payments-modal-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.payments-modal-grid .info-tile {
  min-height: 100%;
}

.payments-empty-state {
  color: var(--muted);
  padding: 32px 20px;
  text-align: center;
}

@media (max-width: 1180px) {
  .payments-toolbar-top {
    grid-template-columns: 1fr;
  }

.payments-filter-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1.3fr) repeat(5, minmax(0, 160px)); /* ✅ was 3 */
  gap: 12px;
  align-items: center;
}

  .payments-trace-grid,
  .payments-modal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 780px) {
  .payments-filter-grid,
  .payments-custom-range,
  .payments-trace-grid,
  .payments-modal-grid {
    grid-template-columns: 1fr;
  }
}
`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const escapeCsv = (value) => {
  const normalized = String(value ?? '');
  return `"${normalized.replaceAll('"', '""')}"`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const titleCase = (value = '') =>
  String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDateInput = (date) => {
  const instance = new Date(date);
  const year = instance.getFullYear();
  const month = String(instance.getMonth() + 1).padStart(2, '0');
  const day = String(instance.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPresetRange = (preset) => {
  const now = new Date();
  const today = formatDateInput(now);

  if (preset === 'today') {
    return { from: today, to: today };
  }

  if (preset === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const value = formatDateInput(yesterday);
    return { from: value, to: value };
  }

  if (preset === 'this_week') {
    const start = new Date(now);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return { from: formatDateInput(start), to: today };
  }

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: formatDateInput(start), to: today };
  }

  return { from: '', to: '' };
};

const getDisplayName = (person) => {
  if (!person) return '-';
  if (person.full_name) return person.full_name;
  const fallback = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  return fallback || '-';
};

const getPaymentRef = (payment) =>
  payment?.receiptnumber ||
  payment?.receipt_number ||
  payment?.reference ||
  `PAY-${payment?.payment_id ?? payment?.id ?? '-'}`;

const getPaymentAmount = (payment) =>
  toNumber(payment?.amount_received ?? payment?.amount ?? payment?.paid_amount ?? 0);

const getTenderedAmount = (payment) =>
  toNumber(payment?.amount_tendered ?? payment?.tendered_amount ?? 0);

const getChangeReturned = (payment) =>
  toNumber(payment?.change_returned ?? payment?.change ?? 0);

const getPaymentMethod = (payment) =>
  String(payment?.payment_method || payment?.method || 'cash').toLowerCase();

const getPaymentStatus = (payment) =>
  String(payment?.status || 'paid').toLowerCase();

const getBillingRef = (payment) =>
  payment?.billing?.invnumber ||
  payment?.billing?.receiptnumber ||
  payment?.invnumber ||
  payment?.billing_ref ||
  '-';

const getCustomerName = (payment) =>
  payment?.customer?.full_name ||
  payment?.billing?.customer?.full_name ||
  payment?.customer_name ||
  'Walk-in customer';

const getCashierName = (payment) =>
  getDisplayName(payment?.user) ||
  getDisplayName(payment?.cashier) ||
  getDisplayName(payment?.billing?.user) ||
  payment?.cashier_name ||
  '-';

const getTaxCollected = (payment) =>
  toNumber(payment?.billing?.vat_amount ?? payment?.vat_amount ?? 0);

const getDiscountApplied = (payment) =>
  toNumber(payment?.billing?.points_discount ?? payment?.discount_amount ?? 0);

const getBillingTotal = (payment) =>
  toNumber(payment?.billing?.total ?? payment?.invoice_total ?? 0);

const getBillingBalance = (billing) =>
  toNumber(billing?.balance_due ?? 0);

const getReceiptMode = (payment) =>
  getBillingBalance(payment?.billing) <= 0 ? 'receipt' : 'invoice';

const getApiBaseUrl = () => {
  const envBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  if (envBaseUrl) return envBaseUrl;
  return `${window.location.origin.replace(':5173', ':8000')}/api`;
};

const getPublicDocumentUrl = (billing, mode = 'receipt') => {
  if (!billing?.uuid) return '';
  return `${getApiBaseUrl()}/public/documents/${mode}/${billing.uuid}`;
};

const extractPayment = (response) => response?.data?.data ?? response?.data ?? null;

const INITIAL_STATE = {
  payments: [],
  meta: { ...DEFAULT_META },
  summary: { ...DEFAULT_SUMMARY },
  page: 1,
  perPage: 25,
  effectivePerPage: 25,
  status: '',
  method: '',
  loading: false,
  selectedPayment: null,
  detailsLoading: false,
  error: '',
};

function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL_STATE };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
        error: action.payload ? '' : state.error,
      };

    case 'LOAD_SUCCESS':
      return {
        ...state,
        loading: false,
        payments: action.payments,
        meta: action.meta,
        summary: action.summary,
        effectivePerPage:
          action.meta?.per_page != null ? Number(action.meta.per_page) : state.effectivePerPage,
      };

    case 'LOAD_ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case 'SET_PAGE':
      return {
        ...state,
        page: action.payload,
      };

    case 'SET_PER_PAGE':
      return {
        ...state,
        perPage: action.payload,
        effectivePerPage: action.payload,
        page: 1,
      };

    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload,
        page: 1,
      };

    case 'SET_METHOD':
      return {
        ...state,
        method: action.payload,
        page: 1,
      };

    case 'OPEN_DETAILS_START':
      return {
        ...state,
        detailsLoading: true,
        error: '',
      };

    case 'OPEN_DETAILS_SUCCESS':
      return {
        ...state,
        detailsLoading: false,
        selectedPayment: action.payload,
      };

    case 'OPEN_DETAILS_ERROR':
      return {
        ...state,
        detailsLoading: false,
        error: action.payload,
      };

    case 'CLOSE_DETAILS':
      return {
        ...state,
        selectedPayment: null,
      };

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
          border: '2px solid var(--line, #dbe3ea)',
          borderTopColor: 'var(--brand-blue, #0E84C3)',
          borderRadius: '50%',
          animation: 'payments-spin 0.7s linear infinite',
          ...style,
        }}
      />
    </>
  );
});

const getStatusTone = (status) => {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'paid') return 'paid';
  if (normalized === 'partial') return 'partial';
  if (normalized === 'pending') return 'draft';
  return 'unpaid';
};

const PaymentStatusBadge = memo(function PaymentStatusBadge({ status }) {
  const normalized = getPaymentStatus({ status });
  return (
    <span className={`status-badge ${getStatusTone(normalized)}`}>
      {titleCase(normalized)}
    </span>
  );
});

const SummaryCard = memo(function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = 'soft',
  note,
}) {
  return (
    <article className={`metric-card metric-tone-${tone}`}>
      <div className="metric-card-top">
        <p>{label}</p>
        <div className="metric-icon-badge">
          <Icon size={18} />
        </div>
      </div>
      <h3>{value}</h3>
      {note ? <div className="payments-summary-note">{note}</div> : null}
    </article>
  );
});

const InlineActivity = memo(function InlineActivity({ payment }) {
  const events = [
    payment?.billing?.created_at
      ? {
          title: 'Billing created',
          text: `${getCashierName(payment)} opened billing ${getBillingRef(payment)} on ${formatDateTime(
            payment.billing.created_at
          )}.`,
        }
      : null,
    payment?.payment_date
      ? {
          title: 'Payment captured',
          text: `${titleCase(getPaymentMethod(payment))} payment recorded on ${formatDateTime(
            payment.payment_date
          )}.`,
        }
      : null,
    {
      title: 'Current ledger state',
      text: `Status is ${titleCase(getPaymentStatus(payment))}; balance after payment is ${currency(
        getBillingBalance(payment?.billing),
        payment?.billing?.store?.currency || payment?.billing?.currency || 'KES'
      )}.`,
    },
  ].filter(Boolean);

  return (
    <div className="payments-activity-list">
      {events.map((event, index) => (
        <div className="payments-activity-item" key={`${event.title}-${index}`}>
          <span className="payments-activity-dot" />
          <div>
            <strong>{event.title}</strong>
            <p>{event.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
});

export default function AdminPaymentsPage() {
  const { storeId, activeStore } = useStore();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState('today');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [showTaxColumn, setShowTaxColumn] = useState(true);
  const [showDiscountColumn, setShowDiscountColumn] = useState(true);
  const [expandedPaymentId, setExpandedPaymentId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [cashierFilter, setCashierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [allCashiers, setAllCashiers] = useState([]);
  const [allCategories, setAllCategories] = useState([]);

  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const {
    payments,
    meta,
    summary,
    page,
    perPage,
    effectivePerPage,
    status,
    method,
    loading,
    selectedPayment,
    detailsLoading,
    error,
  } = state;

  const prevStoreIdRef = useRef(storeId);
  const pendingParamsRef = useRef(null);
  const inFlightRef = useRef(false);

  const currencyCode = activeStore?.currency || 'KES';

  const activeRange = useMemo(() => {
    if (datePreset === 'custom') {
      return {
        from: customRange.from || '',
        to: customRange.to || '',
      };
    }

    return getPresetRange(datePreset);
  }, [datePreset, customRange]);

  const totalColumnCount = 11 + Number(showTaxColumn) + Number(showDiscountColumn);

  const runLoadPayments = useCallback(
    async ({
      storeId: targetStoreId,
      page: targetPage,
      search: targetSearch,
      perPage: targetPerPage,
      status: targetStatus,
      method: targetMethod,
      dateFrom: targetDateFrom,
      dateTo: targetDateTo,
      cashierId: targetCashierId,   // ✅ add
      categoryId: targetCategoryId, // ✅ add
    }) => {
      if (!targetStoreId) {
        dispatch({
          type: 'LOAD_SUCCESS',
          payments: [],
          meta: { ...DEFAULT_META },
          summary: { ...DEFAULT_SUMMARY },
        });
        return;
      }

      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const response = await paymentService.list({
          store_id: targetStoreId,
          page: targetPage,
          per_page: targetPerPage ?? effectivePerPage ?? 25,
          ...(targetSearch ? { search: targetSearch } : {}),
          ...(targetStatus ? { status: targetStatus } : {}),
          ...(targetMethod ? { payment_method: targetMethod } : {}),
          ...(targetDateFrom ? { date_from: targetDateFrom } : {}),
          ...(targetDateTo ? { date_to: targetDateTo } : {}),
                ...(targetCashierId ? { user_id: targetCashierId } : {}),    // ✅ add
      ...(targetCategoryId ? { category_id: targetCategoryId } : {}), // ✅ add
        });

        const payload = response ?? {};
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        const nextMeta = {
          ...DEFAULT_META,
          ...(payload?.meta || {}),
        };
        nextMeta.current_page = Number(nextMeta.current_page || 1);
        nextMeta.last_page = Number(nextMeta.last_page || 1);
        nextMeta.per_page = Number(nextMeta.per_page || targetPerPage || 25);
        nextMeta.total = Number(nextMeta.total || rows.length);
        nextMeta.has_prev_page = nextMeta.current_page > 1;
        nextMeta.has_next_page = nextMeta.current_page < nextMeta.last_page;

        dispatch({
          type: 'LOAD_SUCCESS',
          payments: rows,
          meta: nextMeta,
          summary: {
            ...DEFAULT_SUMMARY,
            ...(payload?.summary || {}),
          },
        });
      } catch (err) {
        dispatch({
          type: 'LOAD_ERROR',
          payload: err?.response?.data?.message || 'Unable to load payments.',
        });
      }
    },
    [effectivePerPage]
  );

  const loadPayments = useCallback(
    async (params = {}) => {
      const callParams = {
        storeId: params.storeId ?? storeId,
        page: params.page ?? page,
        search: params.search ?? debouncedSearch,
        perPage: params.perPage ?? perPage,
        status: params.status ?? status,
        method: params.method ?? method,
        dateFrom: params.dateFrom ?? activeRange.from,
        dateTo: params.dateTo ?? activeRange.to,
        cashierId: params.cashierId ?? cashierFilter,    // ✅ add
        categoryId: params.categoryId ?? categoryFilter, // ✅ add
      };

      if (inFlightRef.current) {
        pendingParamsRef.current = callParams;
        return;
      }

      inFlightRef.current = true;
      let current = callParams;

      while (current) {
        // eslint-disable-next-line no-await-in-loop
        await runLoadPayments(current);

        if (pendingParamsRef.current) {
          current = pendingParamsRef.current;
          pendingParamsRef.current = null;
        } else {
          current = null;
        }
      }

      inFlightRef.current = false;
    },
    [
      storeId,
      page,
      debouncedSearch,
      perPage,
      status,
      method,
      activeRange.from,
      activeRange.to,
      cashierFilter,   // ✅ add
      categoryFilter,  // ✅ add
      runLoadPayments,
    ]
  );

  useEffect(() => {
    const storeChanged = prevStoreIdRef.current !== storeId;
    prevStoreIdRef.current = storeId;

    if (storeChanged) {
      dispatch({ type: 'RESET' });
      setSearch('');
      setDatePreset('today');
      setCustomRange({ from: '', to: '' });
      setExpandedPaymentId(null);
      return;
    }

    loadPayments({
      storeId,
      page,
      search: debouncedSearch,
      perPage,
      status,
      method,
      dateFrom: activeRange.from,
      dateTo: activeRange.to,
      cashierId: cashierFilter,   // ✅ add
      categoryId: categoryFilter, // ✅ add
    });
  }, [
    storeId,
    page,
    perPage,
    status,
    method,
    debouncedSearch,
    activeRange.from,
    activeRange.to,
    cashierFilter,   // ✅ add
    categoryFilter,  // ✅ add
    loadPayments,
  ]);
    useEffect(() => {
    if (!storeId) {
      setAllCashiers([]);
      setAllCategories([]);
      return;
    }

    billingService.list({ store_id: storeId, per_page: 1000 })
      .then((response) => {
        const rows = extractPaginated(response, 1000).data || [];
        const map = new Map();
        rows.forEach((b) => {
          if (!b?.user?.user_id) return;
          const full = `${b.user.first_name || ''} ${b.user.last_name || ''}`.trim();
          map.set(String(b.user.user_id), {
            value: String(b.user.user_id),
            label: full || b.user.email || `User ${b.user.user_id}`,
          });
        });
        setAllCashiers(Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label)));
      })
      .catch(() => {});

    categoryService.list({ store_id: storeId })
      .then((response) => {
        const rows = response?.data || response || [];
        setAllCategories(
          rows.map((c) => ({ value: String(c.category_id), label: c.category_name }))
              .sort((a, b) => a.label.localeCompare(b.label))
        );
      })
      .catch(() => {});
  }, [storeId]);

  const handleRefresh = useCallback(() => {
    loadPayments({
      storeId,
      page,
      search: debouncedSearch,
      perPage,
      status,
      method,
      dateFrom: activeRange.from,
      dateTo: activeRange.to,
    });
  }, [
    loadPayments,
    storeId,
    page,
    debouncedSearch,
    perPage,
    status,
    method,
    activeRange.from,
    activeRange.to,
  ]);
  const handleReset = useCallback(() => {
    setSearch('');
    setDatePreset('today');
    setCustomRange({ from: '', to: '' });
    setCashierFilter('');
    setCategoryFilter('');
    setExpandedPaymentId(null);
    dispatch({ type: 'SET_STATUS', payload: '' });
    dispatch({ type: 'SET_METHOD', payload: '' });
    dispatch({ type: 'SET_PAGE', payload: 1 });
}, []);

  const handleSearchChange = useCallback((event) => {
    setSearch(event.target.value);
    dispatch({ type: 'SET_PAGE', payload: 1 });
  }, []);

  const handleStatusChange = useCallback((event) => {
    dispatch({ type: 'SET_STATUS', payload: event.target.value });
  }, []);

  const handleMethodChange = useCallback((event) => {
    dispatch({ type: 'SET_METHOD', payload: event.target.value });
  }, []);

  const handlePerPageChange = useCallback((event) => {
    dispatch({ type: 'SET_PER_PAGE', payload: Number(event.target.value) });
  }, []);

  const handlePresetChange = useCallback((preset) => {
    setDatePreset(preset);
    dispatch({ type: 'SET_PAGE', payload: 1 });
  }, []);

  const handleCustomRangeChange = useCallback((field, value) => {
    setDatePreset('custom');
    setCustomRange((current) => ({
      ...current,
      [field]: value,
    }));
    dispatch({ type: 'SET_PAGE', payload: 1 });
  }, []);

  const handlePrevPage = useCallback(() => {
    dispatch({ type: 'SET_PAGE', payload: Math.max(page - 1, 1) });
  }, [page]);

  const handleNextPage = useCallback(() => {
    dispatch({
      type: 'SET_PAGE',
      payload: Math.min(page + 1, meta.last_page || 1),
    });
  }, [page, meta.last_page]);

  const openDetails = useCallback(async (paymentId) => {
    dispatch({ type: 'OPEN_DETAILS_START' });

    try {
      const response = await paymentService.show(paymentId);
      dispatch({
        type: 'OPEN_DETAILS_SUCCESS',
        payload: extractPayment(response),
      });
    } catch (err) {
      dispatch({
        type: 'OPEN_DETAILS_ERROR',
        payload: err?.response?.data?.message || 'Unable to load payment details.',
      });
    }
  }, []);

  const closeDetails = useCallback(() => {
    dispatch({ type: 'CLOSE_DETAILS' });
  }, []);

  const toggleExpandedRow = useCallback((paymentId) => {
    setExpandedPaymentId((current) => (current === paymentId ? null : paymentId));
  }, []);

  const perPageOptions = useMemo(() => {
    const options = new Set(PAGE_SIZE_OPTIONS);
    if (effectivePerPage) options.add(Number(effectivePerPage));
    return Array.from(options).sort((a, b) => a - b);
  }, [effectivePerPage]);

  const pageSummary = useMemo(() => {
    const pageCollected = payments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0);
    const cashCollected = payments
      .filter((payment) => getPaymentMethod(payment) === 'cash')
      .reduce((sum, payment) => sum + getPaymentAmount(payment), 0);
    const cardCollected = payments
      .filter((payment) => CARD_METHODS.includes(getPaymentMethod(payment)))
      .reduce((sum, payment) => sum + getPaymentAmount(payment), 0);
    const digitalCollected = payments
      .filter((payment) => DIGITAL_METHODS.includes(getPaymentMethod(payment)))
      .reduce((sum, payment) => sum + getPaymentAmount(payment), 0);

    const refundedCount = payments.filter((payment) => getPaymentStatus(payment) === 'refunded').length;
    const failedCount = payments.filter((payment) => getPaymentStatus(payment) === 'failed').length;
    const partialCount = payments.filter((payment) => getPaymentStatus(payment) === 'partial').length;
    const avgTicket = payments.length ? pageCollected / payments.length : 0;

    return {
      totalRows: meta.total || payments.length,
      pageCollected,
      cashCollected,
      cardCollected,
      digitalCollected,
      refundedCount,
      failedCount,
      partialCount,
      avgTicket,
    };
  }, [payments, meta.total]);

  const dashboardSummary = useMemo(() => {
    return {
      totalRows: Number(summary.filtered_count || pageSummary.totalRows || 0),
      collected: toNumber(summary.total_received || pageSummary.pageCollected),
      cash: toNumber(summary.cash_total || pageSummary.cashCollected),
      card: toNumber(summary.card_total || pageSummary.cardCollected),
      digital: toNumber(summary.digital_total || pageSummary.digitalCollected),
      refundedCount: Number(summary.refunded_count || pageSummary.refundedCount || 0),
      failedCount: Number(summary.failed_count || pageSummary.failedCount || 0),
      partialCount: Number(pageSummary.partialCount || 0),
      avgTicket: toNumber(summary.average_ticket || pageSummary.avgTicket),
    };
  }, [summary, pageSummary]);

  const discrepancyCount =
    dashboardSummary.refundedCount + dashboardSummary.failedCount + dashboardSummary.partialCount;

  const targetValue = toNumber(
    activeStore?.daily_target ||
      activeStore?.sales_target ||
      activeStore?.collection_target ||
      0
  );

  const targetProgress =
    targetValue > 0 ? Math.min(Math.round((dashboardSummary.collected / targetValue) * 100), 999) : null;

  const exportAllRows = useCallback(async () => {
    if (!storeId) return;

    setExporting(true);

    try {
      let pageCursor = 1;
      let lastPage = 1;
      const rows = [];

      do {
        // eslint-disable-next-line no-await-in-loop
        const response = await paymentService.list({
          store_id: storeId,
          page: pageCursor,
          per_page: 100,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(status ? { status } : {}),
          ...(method ? { payment_method: method } : {}),
          ...(activeRange.from ? { date_from: activeRange.from } : {}),
          ...(activeRange.to ? { date_to: activeRange.to } : {}),
        });

const payload = response ?? {};
const chunk = Array.isArray(payload?.data) ? payload.data : [];
const responseMeta = payload?.meta || {};
        lastPage = Number(responseMeta.last_page || 1);
        rows.push(...chunk);
        pageCursor += 1;
      } while (pageCursor <= lastPage);

        const headers = [
        'Receipt',
        'Customer',
        'Billing Ref',
        'Method',
        'Received',
        'Tax Collected',
        'Discount Applied',
        'Change',
        'Status',
        'Cashier',
        'Date',
      ];

      const csvRows = [
        headers.join(','),
        ...rows.map((payment) =>
          [
            escapeCsv(getPaymentRef(payment)),
            escapeCsv(getCustomerName(payment)),
            escapeCsv(getBillingRef(payment)),
            escapeCsv(titleCase(getPaymentMethod(payment))),
            escapeCsv(getPaymentAmount(payment).toFixed(2)),
            escapeCsv(getTaxCollected(payment).toFixed(2)),
            escapeCsv(getDiscountApplied(payment).toFixed(2)),
            escapeCsv(getChangeReturned(payment).toFixed(2)),
            escapeCsv(titleCase(getPaymentStatus(payment))),
            escapeCsv(getCashierName(payment)),
            escapeCsv(payment?.payment_date ? formatDateTime(payment.payment_date) : '-'),
          ].join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');

      anchor.href = url;
      anchor.download = `payments-${storeId}-${stamp}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [storeId, debouncedSearch, status, method, activeRange.from, activeRange.to]);

  const handlePrintReport = useCallback(() => {
    if (!payments.length) return;

    setPrinting(true);

    try {
      const popup = window.open('', '_blank', 'width=1280,height=900');
      if (!popup) {
        setPrinting(false);
        return;
      }

      const headCells = [
        '<th>Receipt</th>',
        '<th>Customer</th>',
        '<th>Billing Ref</th>',
        '<th>Cashier</th>',
        '<th>Method</th>',
        '<th>Received</th>',
        showTaxColumn ? '<th>Tax</th>' : '',
        showDiscountColumn ? '<th>Discount</th>' : '',
        '<th>Change</th>',
        '<th>Status</th>',
        '<th>Date</th>',
      ].join('');

      const bodyRows = payments
        .map((payment) => {
          return `
            <tr>
              <td>${escapeHtml(getPaymentRef(payment))}</td>
              <td>${escapeHtml(getCustomerName(payment))}</td>
              <td>${escapeHtml(getBillingRef(payment))}</td>
              <td>${escapeHtml(getCashierName(payment))}</td>
              <td>${escapeHtml(titleCase(getPaymentMethod(payment)))}</td>
              <td>${escapeHtml(currency(getPaymentAmount(payment), currencyCode))}</td>
              ${
                showTaxColumn
                  ? `<td>${escapeHtml(currency(getTaxCollected(payment), currencyCode))}</td>`
                  : ''
              }
              ${
                showDiscountColumn
                  ? `<td>${escapeHtml(currency(getDiscountApplied(payment), currencyCode))}</td>`
                  : ''
              }
              <td>${escapeHtml(currency(getChangeReturned(payment), currencyCode))}</td>
              <td>${escapeHtml(titleCase(getPaymentStatus(payment)))}</td>
              <td>${escapeHtml(
                payment?.payment_date ? formatDateTime(payment.payment_date) : '-'
              )}</td>
            </tr>
          `;
        })
        .join('');

      popup.document.open();
      popup.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Payments Report</title>
            <style>
              body {
                margin: 24px;
                font-family: Inter, Arial, sans-serif;
                color: #111827;
              }
              h1 {
                margin: 0 0 6px;
                font-size: 24px;
              }
              p {
                margin: 0 0 16px;
                color: #6b7280;
              }
              .meta {
                display: grid;
                gap: 4px;
                margin-bottom: 18px;
              }
              .summary {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 12px;
                margin-bottom: 18px;
              }
              .summary-card {
                border: 1px solid #dbe3ea;
                border-radius: 12px;
                padding: 12px;
                background: #f8fafc;
              }
              .summary-card span {
                display: block;
                font-size: 12px;
                text-transform: uppercase;
                color: #64748b;
                margin-bottom: 6px;
                font-weight: 700;
              }
              .summary-card strong {
                font-size: 18px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                border: 1px solid #dbe3ea;
                padding: 10px 12px;
                text-align: left;
                font-size: 13px;
              }
              th {
                background: #0e84c3;
                color: white;
                text-transform: uppercase;
                font-size: 11px;
                letter-spacing: 0.06em;
              }
              tr:nth-child(even) td {
                background: #f8fafc;
              }
              @media print {
                body { margin: 0; }
              }
            </style>
          </head>
          <body>
            <h1>Payments Report</h1>
            <p>Filtered administrative ledger export</p>

            <div class="meta">
              <div><strong>Store:</strong> ${escapeHtml(activeStore?.store_name || `Store ${storeId}`)}</div>
              <div><strong>Date range:</strong> ${escapeHtml(
                activeRange.from && activeRange.to
                  ? `${activeRange.from} → ${activeRange.to}`
                  : 'All available dates'
              )}</div>
              <div><strong>Generated:</strong> ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
            </div>

            <div class="summary">
              <div class="summary-card">
                <span>Payments</span>
                <strong>${dashboardSummary.totalRows}</strong>
              </div>
              <div class="summary-card">
                <span>Collected</span>
                <strong>${escapeHtml(currency(dashboardSummary.collected, currencyCode))}</strong>
              </div>
              <div class="summary-card">
                <span>Cash</span>
                <strong>${escapeHtml(currency(dashboardSummary.cash, currencyCode))}</strong>
              </div>
              <div class="summary-card">
                <span>Digital</span>
                <strong>${escapeHtml(currency(dashboardSummary.digital, currencyCode))}</strong>
              </div>
            </div>

            <table>
              <thead>
                <tr>${headCells}</tr>
              </thead>
              <tbody>
                ${bodyRows}
              </tbody>
            </table>
          </body>
        </html>
      `);
      popup.document.close();

      popup.onload = () => {
        popup.focus();
        popup.print();
        setTimeout(() => setPrinting(false), 300);
      };
    } catch (error) {
      setPrinting(false);
    }
  }, [
    payments,
    showTaxColumn,
    showDiscountColumn,
    currencyCode,
    activeStore?.store_name,
    storeId,
    activeRange.from,
    activeRange.to,
    dashboardSummary.totalRows,
    dashboardSummary.collected,
    dashboardSummary.cash,
    dashboardSummary.digital,
  ]);

  const selectedPaymentMode = selectedPayment ? getReceiptMode(selectedPayment) : 'receipt';
  const selectedReceiptUrl = selectedPayment
    ? getPublicDocumentUrl(selectedPayment.billing, 'receipt')
    : '';
  const selectedInvoiceUrl = selectedPayment
    ? getPublicDocumentUrl(selectedPayment.billing, 'invoice')
    : '';

  return (
    <>
      <style>{SPINNER_STYLE}</style>
      <style>{LOCAL_PAGE_STYLES}</style>

      <div className="payments-page-wrapper">
        {loading ? (
          <div className="payments-loading-overlay">
            <Spinner size={34} />
          </div>
        ) : null}

        <section className="stack-lg">
          <div className="payments-hero-bar">
            <div>
              <h2>Payments</h2>
              <p>
                Cleaned payment ledger with export tools, date filters, operational trace,
                mobile-money visibility, and consistent currency formatting.
              </p>
            </div>

            <div className="payments-hero-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={handleRefresh}
                disabled={!storeId || loading}
              >
                <RefreshCw size={15} />
                Refresh
              </button>
                  <button
        type="button"
        className="ghost-button"
        onClick={handleReset}
        disabled={!storeId}
    >
        <X size={15} />
        Reset
    </button>

              <button
                type="button"
                className="ghost-button"
                onClick={handlePrintReport}
                disabled={!storeId || !payments.length || printing}
              >
                <Printer size={15} />
                {printing ? 'Preparing print…' : 'Print report'}
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={exportAllRows}
                disabled={!storeId || exporting}
              >
                <Download size={15} />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>

          <div className="payments-kpi-grid">
            <SummaryCard
              icon={CreditCard}
              label="Payments"
              value={dashboardSummary.totalRows}
              tone="soft"
              note={`${meta.total || payments.length} records in filtered ledger`}
            />

            <SummaryCard
              icon={BadgeDollarSign}
              label="Received"
              value={currency(dashboardSummary.collected, currencyCode)}
              tone="success"
              note="Primary ledger total"
            />

            <SummaryCard
              icon={Wallet}
              label="Cash"
              value={currency(dashboardSummary.cash, currencyCode)}
              tone="gold"
              note="Cash on hand within filters"
            />

            <SummaryCard
              icon={CreditCard}
              label="Card"
              value={currency(dashboardSummary.card, currencyCode)}
              tone="teal"
              note="POS / card settlements"
            />

            <SummaryCard
              icon={Smartphone}
              label="Mobile money / Wallets"
              value={currency(dashboardSummary.digital, currencyCode)}
              tone="soft"
              note="M-Pesa, wallet, bank, digital rails"
            />

            <SummaryCard
              icon={CalendarDays}
              label="Average ticket"
              value={currency(dashboardSummary.avgTicket, currencyCode)}
              tone="brown"
              note={
                targetProgress != null
                  ? `${targetProgress}% of configured target`
                  : 'No sales target configured'
              }
            />
          </div>

          <div className="payments-toolbar-card">
            <div className="payments-toolbar-top">
              <div className="payments-toolbar-left">
                <div className="payments-filter-grid">
                  <label className="payments-search-wrap">
                    <span className="muted">Search</span>
                    <input
                      className="text-input"
                      placeholder="Receipt, invoice, customer, cashier"
                      value={search}
                      onChange={handleSearchChange}
                      disabled={!storeId}
                    />
                  </label>

                  <label>
                    <span className="muted">Status</span>
                    <select
                      className="select-input"
                      value={status}
                      onChange={handleStatusChange}
                      disabled={!storeId}
                    >
                      <option value="">All statuses</option>
                      <option value="paid">Paid</option>
                      <option value="partial">Partial</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </label>

                  <label>
                    <span className="muted">Method</span>
                    <select
                      className="select-input"
                      value={method}
                      onChange={handleMethodChange}
                      disabled={!storeId}
                    >
                      <option value="">All methods</option>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="mpesa">M-Pesa</option>
                      <option value="bank">Bank</option>
                      <option value="wallet">Wallet</option>
                    </select>
                  </label>
                                    <label>
                    <span className="muted">Cashier</span>
                    <select
                      className="select-input"
                      value={cashierFilter}
                      onChange={(e) => { setCashierFilter(e.target.value); dispatch({ type: 'SET_PAGE', payload: 1 }); }}
                      disabled={!storeId}
                    >
                      <option value="">All cashiers</option>
                      {allCashiers.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="muted">Category</span>
                    <select
                      className="select-input"
                      value={categoryFilter}
                      onChange={(e) => { setCategoryFilter(e.target.value); dispatch({ type: 'SET_PAGE', payload: 1 }); }}
                      disabled={!storeId}
                    >
                      <option value="">All categories</option>
                      {allCategories.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="muted">Rows</span>
                    <div className="users-perpage-wrap">
                      <select
                        value={effectivePerPage}
                        onChange={handlePerPageChange}
                        disabled={!storeId}
                      >
                        {perPageOptions.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </div>
                  </label>
                </div>

                <div className="payments-preset-row">
                  <button
                    type="button"
                    className={`payments-preset-button ${datePreset === 'today' ? 'active' : ''}`}
                    onClick={() => handlePresetChange('today')}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`payments-preset-button ${datePreset === 'yesterday' ? 'active' : ''}`}
                    onClick={() => handlePresetChange('yesterday')}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    className={`payments-preset-button ${datePreset === 'this_week' ? 'active' : ''}`}
                    onClick={() => handlePresetChange('this_week')}
                  >
                    This week
                  </button>
                  <button
                    type="button"
                    className={`payments-preset-button ${datePreset === 'this_month' ? 'active' : ''}`}
                    onClick={() => handlePresetChange('this_month')}
                  >
                    This month
                  </button>
                  <button
                    type="button"
                    className={`payments-preset-button ${datePreset === 'custom' ? 'active' : ''}`}
                    onClick={() => handlePresetChange('custom')}
                  >
                    Custom
                  </button>
                </div>

                <div className="payments-custom-range">
                  <label>
                    <span className="muted">From</span>
                    <input
                      type="date"
                      className="text-input"
                      value={customRange.from}
                      onChange={(event) => handleCustomRangeChange('from', event.target.value)}
                      disabled={!storeId}
                    />
                  </label>

                  <label>
                    <span className="muted">To</span>
                    <input
                      type="date"
                      className="text-input"
                      value={customRange.to}
                      onChange={(event) => handleCustomRangeChange('to', event.target.value)}
                      disabled={!storeId}
                    />
                  </label>
                </div>

                <div className="payments-column-toggle-row">
                  <span className="muted">Visible ledger columns</span>

                  <button
                    type="button"
                    className={`payments-inline-chip ${showTaxColumn ? 'active' : ''}`}
                    onClick={() => setShowTaxColumn((current) => !current)}
                  >
                    Tax collected
                  </button>

                  <button
                    type="button"
                    className={`payments-inline-chip ${showDiscountColumn ? 'active' : ''}`}
                    onClick={() => setShowDiscountColumn((current) => !current)}
                  >
                    Discount applied
                  </button>
                </div>
              </div>

              <aside className="payments-quick-panel">
                <h4>Operational snapshot</h4>

                <div className="payments-quick-list">
                  <div className="payments-quick-item">
                    <div>
                      <strong>Active store</strong>
                      <span>{activeStore?.store_name || `Store ${storeId || '-'}`}</span>
                    </div>
                    <PaymentStatusBadge status="paid" />
                  </div>

                  <div className="payments-quick-item">
                    <div>
                      <strong>Date range</strong>
                      <span>
                        {activeRange.from && activeRange.to
                          ? `${activeRange.from} → ${activeRange.to}`
                          : 'No date filter'}
                      </span>
                    </div>
                    <span>{meta.total || payments.length} rows</span>
                  </div>

                  <div className="payments-quick-item">
                    <div>
                      <strong>Refund / failure watch</strong>
                      <span>Rows needing attention</span>
                    </div>
                    <span>{discrepancyCount}</span>
                  </div>

                  <div className="payments-quick-item">
                    <div>
                      <strong>Average ticket</strong>
                      <span>Filtered dataset</span>
                    </div>
                    <span>{currency(dashboardSummary.avgTicket, currencyCode)}</span>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          {discrepancyCount > 0 ? (
            <div className="payments-alert-pill">
              <History size={14} />
              {discrepancyCount} payment row(s) need review across refunded, failed, or partial states
            </div>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <article className="card payments-table-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Billing ref</th>
                    <th>Cashier</th>
                    <th>Method</th>
                    <th>Received</th>
                    {showTaxColumn ? <th>Tax</th> : null}
                    {showDiscountColumn ? <th>Discount</th> : null}
                    <th>Change</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {!storeId ? (
                    <tr>
                      <td colSpan={totalColumnCount} className="payments-empty-state">
                        Select a store first.
                      </td>
                    </tr>
                  ) : payments.length ? (
                    payments.map((payment) => {
                      const paymentId = payment.payment_id ?? payment.id;
                      const isExpanded = expandedPaymentId === paymentId;

                      return [
                        <tr key={`row-${paymentId}`}>
                          <td>
                            <strong>{getPaymentRef(payment)}</strong>
                            <div className="muted">{payment?.uuid || `ID ${paymentId}`}</div>
                          </td>

                          <td>
                            <strong>{getCustomerName(payment)}</strong>
                            <div className="muted">
                              {payment?.billing?.customer?.phone ||
                                payment?.billing?.customer?.email ||
                                'Walk-in'}
                            </div>
                          </td>

                          <td>
                            <strong>{getBillingRef(payment)}</strong>
                            <div className="muted">
                              Total {currency(getBillingTotal(payment), currencyCode)}
                            </div>
                          </td>

                          <td>
                            <strong>{getCashierName(payment)}</strong>
                            <div className="muted">
                              {payment?.billing?.user?.email || 'Cashier activity'}
                            </div>
                          </td>

                          <td>
                            <span className="badge">{titleCase(getPaymentMethod(payment))}</span>
                          </td>

                          <td>
                            <strong>{currency(getPaymentAmount(payment), currencyCode)}</strong>
                            <div className="muted">
                              Tendered {currency(getTenderedAmount(payment), currencyCode)}
                            </div>
                          </td>

                          {showTaxColumn ? (
                            <td>{currency(getTaxCollected(payment), currencyCode)}</td>
                          ) : null}

                          {showDiscountColumn ? (
                            <td>{currency(getDiscountApplied(payment), currencyCode)}</td>
                          ) : null}

                          <td>{currency(getChangeReturned(payment), currencyCode)}</td>

                          <td>
                            <PaymentStatusBadge status={getPaymentStatus(payment)} />
                          </td>

                          <td>{payment?.payment_date ? formatDateTime(payment.payment_date) : '-'}</td>

                          <td>
                            <div className="payments-row-actions">
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => openDetails(paymentId)}
                              >
                                <Eye size={14} />
                                View
                              </button>

                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => toggleExpandedRow(paymentId)}
                              >
                                <History size={14} />
                                {isExpanded ? 'Hide trace' : 'Trace'}
                              </button>
                            </div>
                          </td>
                        </tr>,

                        isExpanded ? (
                          <tr key={`trace-${paymentId}`}>
                            <td colSpan={totalColumnCount}>
                              <div className="payments-trace-panel">
                                <div className="payments-trace-grid">
                                  <div className="payments-trace-box">
                                    <span>Approved by</span>
                                    <strong>{getCashierName(payment)}</strong>
                                  </div>

                                  <div className="payments-trace-box">
                                    <span>Payment date</span>
                                    <strong>
                                      {payment?.payment_date
                                        ? formatDateTime(payment.payment_date)
                                        : '-'}
                                    </strong>
                                  </div>

                                  <div className="payments-trace-box">
                                    <span>Balance after</span>
                                    <strong>
                                      {currency(getBillingBalance(payment?.billing), currencyCode)}
                                    </strong>
                                  </div>

                                  <div className="payments-trace-box">
                                    <span>Document mode</span>
                                    <strong>{titleCase(getReceiptMode(payment))}</strong>
                                  </div>
                                </div>

                                <InlineActivity payment={payment} />
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ];
                    })
                  ) : (
                    <tr>
                      <td colSpan={totalColumnCount} className="payments-empty-state">
                        No payments found for the active filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="payments-footer-bar">
              <span className="muted">
                {meta.from && meta.to
                  ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
                  : `${payments.length} records`}
              </span>

              <div className="row-actions compact">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handlePrevPage}
                  disabled={loading || page <= 1}
                >
                  Previous
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleNextPage}
                  disabled={loading || page >= (meta.last_page || 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </article>
        </section>

        <Modal
          open={!!selectedPayment || detailsLoading}
          title="Payment details"
          onClose={closeDetails}
          width="1100px"
        >
          {detailsLoading && !selectedPayment ? (
            <div
              className="stack-md"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 0',
              }}
            >
              <Spinner size={34} />
            </div>
          ) : selectedPayment ? (
            <div className="stack-lg">
              <div className="payments-document-actions">
                {selectedReceiptUrl ? (
                  <a
                    className="ghost-button"
                    href={selectedReceiptUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText size={14} />
                    Open receipt
                  </a>
                ) : null}

                {selectedInvoiceUrl ? (
                  <a
                    className="ghost-button"
                    href={selectedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText size={14} />
                    Open invoice
                  </a>
                ) : null}

                <span className="badge">
                  Active document: {titleCase(selectedPaymentMode)}
                </span>
              </div>

              <div className="payments-modal-grid">
                <div className="info-tile compact">
                  <span>Receipt</span>
                  <strong>{getPaymentRef(selectedPayment)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Customer</span>
                  <strong>{getCustomerName(selectedPayment)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Billing ref</span>
                  <strong>{getBillingRef(selectedPayment)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Cashier</span>
                  <strong>{getCashierName(selectedPayment)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Method</span>
                  <strong>{titleCase(getPaymentMethod(selectedPayment))}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Status</span>
                  <strong>{titleCase(getPaymentStatus(selectedPayment))}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Received</span>
                  <strong>{currency(getPaymentAmount(selectedPayment), currencyCode)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Tendered</span>
                  <strong>{currency(getTenderedAmount(selectedPayment), currencyCode)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Change</span>
                  <strong>{currency(getChangeReturned(selectedPayment), currencyCode)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Tax</span>
                  <strong>{currency(getTaxCollected(selectedPayment), currencyCode)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Discount</span>
                  <strong>{currency(getDiscountApplied(selectedPayment), currencyCode)}</strong>
                </div>

                <div className="info-tile compact">
                  <span>Date</span>
                  <strong>
                    {selectedPayment?.payment_date
                      ? formatDateTime(selectedPayment.payment_date)
                      : '-'}
                  </strong>
                </div>
              </div>

              {selectedPayment?.billing?.notes ? (
                <div className="card" style={{ padding: '14px 16px' }}>
                  <p className="muted">Billing notes</p>
                  <strong>{selectedPayment.billing.notes}</strong>
                </div>
              ) : null}

              <div className="card">
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <div>
                    <h3>Line items</h3>
                    <p>Loaded from the linked billing record.</p>
                  </div>
                </div>

                {selectedPayment?.billing?.items?.length ? (
                  <div className="table-wrap">
                    <table className="data-table payments-items-table">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Unit price</th>
                          <th>VAT</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPayment.billing.items.map((item) => (
                          <tr key={item.billing_item_id ?? item.id}>
                            <td>{item?.product?.sku || '-'}</td>
                            <td>
                              <strong>{item?.product?.product_name || 'Product'}</strong>
                              <div className="muted">
                                {item?.product?.category?.category_name || 'Uncategorized'}
                              </div>
                            </td>
                            <td>{item?.quantity ?? 0}</td>
                            <td>{currency(item?.unit_price ?? 0, currencyCode)}</td>
                            <td>{currency(item?.vat_amount ?? 0, currencyCode)}</td>
                            <td>{currency(item?.total_amount ?? 0, currencyCode)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="payments-empty-state">
                    No billing items were included in the payment detail payload yet.
                  </div>
                )}
              </div>

              <div className="card">
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <div>
                    <h3>Operational trace</h3>
                    <p>Inline audit-style activity for review and handoff.</p>
                  </div>
                </div>

                <InlineActivity payment={selectedPayment} />
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    </>
  );
}
