import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileDown,
  Printer,
  Search,
  ShoppingBag,
} from 'lucide-react';
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

  if (Array.isArray(order?.items)) {
    return order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  return Number(order?.items_count || 0);
};

const getItemsCountLabel = (order) => {
  const count = getItemsCount(order);
  return `${count} ${count === 1 ? 'item' : 'items'}`;
};

const formatFulfillmentType = (value) =>
  value === 'delivery' ? 'Delivery' : 'Walk-in Counter';

const formatFulfillmentStatus = (value) => {
  switch (value) {
    case 'processing':
      return 'Processing';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'pending':
    default:
      return 'Pending';
  }
};

const FULFILLMENT_BADGE = {
  pending: 'warning',
  processing: 'partial',
  shipped: 'unpaid',
  delivered: 'paid',
};

const computeAverageFulfillmentMinutes = (records = []) => {
  const durations = records
    .map((order) => {
      if (!order?.billing_date || !order?.stock_applied_at) return null;

      const start = new Date(order.billing_date).getTime();
      const end = new Date(order.stock_applied_at).getTime();

      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
      return Math.round((end - start) / 60000);
    })
    .filter((value) => value != null);

  if (!durations.length) return null;

  const total = durations.reduce((sum, value) => sum + value, 0);
  return Math.round(total / durations.length);
};

const serializeCsvValue = (value) => {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const buildPrintMarkup = (orders = []) => {
  const cards = orders
    .map(
      (order) => `
        <section style="border:1px solid #dbe4ea;border-radius:12px;padding:16px 18px;margin-bottom:16px;page-break-inside:avoid;">
          <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Order</div>
              <div style="font-size:18px;font-weight:700;color:#0f172a;">${getOrderNumber(order)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Fulfillment</div>
              <div style="font-size:14px;font-weight:600;color:#0f172a;">${formatFulfillmentStatus(order.fulfillment_status)}</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px;">
            <div>
              <div style="font-size:12px;color:#64748b;">Customer</div>
              <div style="font-size:14px;font-weight:600;color:#0f172a;">${order.customer?.full_name || 'Walk-in customer'}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#64748b;">Date</div>
              <div style="font-size:14px;font-weight:600;color:#0f172a;">${order.billing_date ? formatDateTime(order.billing_date) : '-'}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#64748b;">Fulfillment type</div>
              <div style="font-size:14px;font-weight:600;color:#0f172a;">${formatFulfillmentType(order.fulfillment_type)}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#64748b;">Reference</div>
              <div style="font-size:14px;font-weight:600;color:#0f172a;">${order.invnumber || '-'}</div>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">Product</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${
                order.items?.length
                  ? order.items
                      .map(
                        (item) => `
                          <tr>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;">${item.product?.product_name || '-'}</td>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;">${item.quantity}</td>
                          </tr>
                        `
                      )
                      .join('')
                  : `
                      <tr>
                        <td colspan="2" style="padding:8px;color:#64748b;">No items found for this order.</td>
                      </tr>
                    `
              }
            </tbody>
          </table>
        </section>
      `
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <title>Order Tickets</title>
        <meta charset="utf-8" />
      </head>
      <body style="font-family:Inter,Arial,sans-serif;background:#ffffff;padding:24px;color:#0f172a;">
        <h1 style="margin:0 0 16px;font-size:24px;">Order Tickets</h1>
        ${cards}
      </body>
    </html>
  `;
};

const openPrintWindow = (orders = []) => {
  if (!orders.length || typeof window === 'undefined') return;

  const popup = window.open('', '_blank', 'width=980,height=760');
  if (!popup) return;

  popup.document.open();
  popup.document.write(buildPrintMarkup(orders));
  popup.document.close();
  popup.focus();

  setTimeout(() => {
    popup.print();
  }, 250);
};

// ─── UI atoms ───────────────────────────────────────────────────────────────

const FulfillmentBadge = memo(function FulfillmentBadge({ value }) {
  const normalized = value || 'pending';

  return (
    <span
      className={`status-badge ${FULFILLMENT_BADGE[normalized] ?? 'warning'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        textTransform: 'capitalize',
        minWidth: 108,
        justifyContent: 'center',
      }}
    >
      {formatFulfillmentStatus(normalized)}
      <ChevronDown size={12} />
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

const SummaryCard = memo(function SummaryCard({
  title,
  value,
  icon,
  accent = 'default',
  loading = false,
}) {
  const cardStyle =
    accent === 'warning'
      ? {
          background:
            'linear-gradient(180deg, rgba(255,251,235,1) 0%, rgba(255,255,255,1) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          boxShadow: '0 8px 24px rgba(245, 158, 11, 0.10)',
        }
      : {
          background: '#ffffff',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
        };

  const iconWrapStyle =
    accent === 'warning'
      ? {
          background: 'rgba(251, 191, 36, 0.14)',
          color: '#d97706',
        }
      : {
          background: 'rgba(14, 116, 144, 0.10)',
          color: '#0f766e',
        };

  return (
    <article
      className="card"
      style={{
        ...cardStyle,
        padding: 18,
        borderRadius: 16,
        minHeight: 96,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <p className="muted" style={{ marginBottom: 6 }}>
            {title}
          </p>
          <h3 style={{ margin: 0, fontSize: 30, lineHeight: 1.1 }}>
            {loading ? '—' : value}
          </h3>
        </div>

        <div
          style={{
            ...iconWrapStyle,
            width: 40,
            height: 40,
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </article>
  );
});

// ─── static option lists ─────────────────────────────────────────────────────

const fulfillmentStatusOptions = [
  { value: '', label: 'Fulfillment Status (All)' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
];

const fulfillmentTypeOptions = [
  { value: '', label: 'Fulfillment Types (All)' },
  { value: 'walk_in_counter', label: 'Walk-in Counter' },
  { value: 'delivery', label: 'Delivery' },
];

const detailFulfillmentStatusOptions = fulfillmentStatusOptions.filter((o) => o.value);
const detailFulfillmentTypeOptions = fulfillmentTypeOptions.filter((o) => o.value);

// ─── row ────────────────────────────────────────────────────────────────────

const OrderRow = memo(function OrderRow({
  order,
  checked,
  onToggle,
  onView,
  onPrint,
}) {
  const handleToggle = useCallback(() => onToggle(order.billing_id), [onToggle, order.billing_id]);
  const handleView = useCallback(() => onView(order.billing_id), [onView, order.billing_id]);
  const handlePrint = useCallback(() => onPrint(order), [onPrint, order]);

  return (
    <tr style={checked ? { background: 'rgba(14, 116, 144, 0.05)' } : undefined}>
      <td style={{ width: 44 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={handleToggle}
          aria-label={`Select ${getOrderNumber(order)}`}
        />
      </td>
      <td>{getOrderNumber(order)}</td>
      <td>{order.customer?.full_name || 'Walk-in customer'}</td>
      <td>{getItemsCountLabel(order)}</td>
      <td>{formatFulfillmentType(order.fulfillment_type)}</td>
      <td>
        <FulfillmentBadge value={order.fulfillment_status} />
      </td>
      <td>{order.billing_date ? formatDateTime(order.billing_date) : '-'}</td>
      <td>
        <div className="row-actions compact" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="ghost-button" onClick={handleView}>
            View
          </button>

          <button
            type="button"
            className="ghost-button"
            onClick={handlePrint}
            aria-label={`Print ${getOrderNumber(order)}`}
            title="Print ticket"
            style={{
              width: 38,
              minWidth: 38,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Printer size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
});

// ─── main page ───────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const { storeId } = useStore();

  // list state
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15); // backend default restored
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // summary cards
  const [summary, setSummary] = useState({
    totalOrders: 0,
    pendingCount: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // selection / bulk actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // detail / modal state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // edit state inside modal
  const [draftStatus, setDraftStatus] = useState('');
  const [draftType, setDraftType] = useState('');
  const [savingFulfillment, setSavingFulfillment] = useState(false);

  // feedback
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // request refs
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const summaryRequestRef = useRef(0);

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
      setMeta(parsed.meta ?? { ...EMPTY_META });
      setOrders(parsed.data ?? []);
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      setError(err?.response?.data?.message || 'Unable to load orders.');
      setMeta({ ...EMPTY_META });
      setOrders([]);
    } finally {
      if (requestId === listRequestRef.current) {
        setLoading(false);
      }
    }
  }, [orderParams, perPage, storeId]);

  const loadSummary = useCallback(async () => {
    if (!storeId) {
      setSummary({ totalOrders: 0, pendingCount: 0 });
      setSummaryLoading(false);
      return;
    }

    const requestId = ++summaryRequestRef.current;
    setSummaryLoading(true);

    try {
      const [allOrdersResponse, pendingOrdersResponse] = await Promise.all([
        billingService.list({
          page: 1,
          per_page: 1,
          store_id: storeId,
        }),
        billingService.list({
          page: 1,
          per_page: 1,
          store_id: storeId,
          fulfillment_status: 'pending',
        }),
      ]);

      if (requestId !== summaryRequestRef.current) return;

      const allOrders = extractPaginated(allOrdersResponse, 1);
      const pendingOrders = extractPaginated(pendingOrdersResponse, 1);

      setSummary({
        totalOrders: Number(allOrders?.meta?.total || 0),
        pendingCount: Number(pendingOrders?.meta?.total || 0),
      });
    } catch {
      if (requestId !== summaryRequestRef.current) return;

      setSummary({
        totalOrders: 0,
        pendingCount: 0,
      });
    } finally {
      if (requestId === summaryRequestRef.current) {
        setSummaryLoading(false);
      }
    }
  }, [storeId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setSelectedOrder(null);
    setError('');
    setSuccess('');
    setSelectedIds([]);
    setSearchTerm('');
    setPage(1);
  }, [storeId]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    const validIds = new Set(orders.map((order) => String(order.billing_id)));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(String(id))));
  }, [orders]);

  const displayedOrders = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return orders;

    return orders.filter((order) => {
      const haystack = [
        getOrderNumber(order),
        order.customer?.full_name,
        order.customer?.email,
        order.invnumber,
        formatFulfillmentType(order.fulfillment_type),
        formatFulfillmentStatus(order.fulfillment_status),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [orders, searchTerm]);

  const selectedIdSet = useMemo(
    () => new Set(selectedIds.map((id) => String(id))),
    [selectedIds]
  );

  const visibleIds = useMemo(
    () => displayedOrders.map((order) => String(order.billing_id)),
    [displayedOrders]
  );

  const allVisibleSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIdSet.has(id)),
    [visibleIds, selectedIdSet]
  );

  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedIdSet.has(String(order.billing_id))),
    [orders, selectedIdSet]
  );

  const averageFulfillmentMinutes = useMemo(
    () => computeAverageFulfillmentMinutes(orders),
    [orders]
  );

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
      setDraftStatus(record?.fulfillment_status || 'pending');
      setDraftType(record?.fulfillment_type || 'walk_in_counter');
    } catch (err) {
      if (requestId !== detailRequestRef.current) return;
      setError(err?.response?.data?.message || 'Unable to load order detail.');
    } finally {
      if (requestId === detailRequestRef.current) {
        setDetailLoading(false);
      }
    }
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedOrder(null);
    setError('');
    setSuccess('');
  }, []);

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

      setSelectedOrder((prev) => (prev ? { ...prev, ...updated } : prev));

      setOrders((prev) =>
        prev.map((order) =>
          String(order.billing_id) === String(updated.billing_id)
            ? { ...order, ...updated }
            : order
        )
      );

      setSuccess('Order fulfillment updated successfully.');
      loadSummary();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update fulfillment.');
    } finally {
      setSavingFulfillment(false);
    }
  }, [selectedOrder?.billing_id, draftStatus, draftType, loadSummary]);

  const handleToggleOrder = useCallback((billingId) => {
    setSelectedIds((prev) => {
      const exists = prev.some((id) => String(id) === String(billingId));
      return exists
        ? prev.filter((id) => String(id) !== String(billingId))
        : [...prev, billingId];
    });
  }, []);

  const handleToggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const prevSet = new Set(prev.map((id) => String(id)));
      const isAllSelected =
        visibleIds.length > 0 && visibleIds.every((id) => prevSet.has(id));

      if (isAllSelected) {
        return prev.filter((id) => !visibleIds.includes(String(id)));
      }

      const next = [...prev];
      visibleIds.forEach((id) => {
        if (!prevSet.has(id)) next.push(id);
      });
      return next;
    });
  }, [visibleIds]);

  const handleBulkMarkDelivered = useCallback(async () => {
    if (!selectedIds.length) return;

    setBulkSaving(true);
    setError('');
    setSuccess('');

    try {
      const responses = await Promise.all(
        selectedIds.map((billingId) =>
          billingService
            .update(billingId, { fulfillment_status: 'delivered' })
            .then(extractRecord)
        )
      );

      const updatedMap = new Map(
        responses.map((item) => [String(item.billing_id), item])
      );

      setOrders((prev) =>
        prev.map((order) =>
          updatedMap.has(String(order.billing_id))
            ? { ...order, ...updatedMap.get(String(order.billing_id)) }
            : order
        )
      );

      setSelectedOrder((prev) =>
        prev && updatedMap.has(String(prev.billing_id))
          ? { ...prev, ...updatedMap.get(String(prev.billing_id)) }
          : prev
      );

      setSelectedIds([]);
      setSuccess(
        `${responses.length} ${responses.length === 1 ? 'order was' : 'orders were'} marked delivered.`
      );
      loadSummary();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update selected orders.');
    } finally {
      setBulkSaving(false);
    }
  }, [selectedIds, loadSummary]);

  const handleExportSelected = useCallback(() => {
    if (!selectedOrders.length || typeof window === 'undefined') return;

    const rows = [
      [
        'Order',
        'Customer',
        'Items Count',
        'Fulfillment Type',
        'Fulfillment Status',
        'Date',
        'Reference',
      ],
      ...selectedOrders.map((order) => [
        getOrderNumber(order),
        order.customer?.full_name || 'Walk-in customer',
        getItemsCount(order),
        formatFulfillmentType(order.fulfillment_type),
        formatFulfillmentStatus(order.fulfillment_status),
        order.billing_date ? formatDateTime(order.billing_date) : '-',
        order.invnumber || '-',
      ]),
    ];

    const csv = rows
      .map((row) => row.map(serializeCsvValue).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const fileUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `orders-selection-store-${storeId || 'all'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(fileUrl);
  }, [selectedOrders, storeId]);

  const handlePrintSingle = useCallback((order) => {
    openPrintWindow([order]);
  }, []);

  const handleBulkPrint = useCallback(() => {
    openPrintWindow(selectedOrders);
  }, [selectedOrders]);

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

  const handleDraftStatusChange = useCallback((e) => setDraftStatus(e.target.value), []);
  const handleDraftTypeChange = useCallback((e) => setDraftType(e.target.value), []);
  const handleSearchChange = useCallback((e) => setSearchTerm(e.target.value), []);

  return (
    <section className="stack-lg">
      {/* ── header ── */}
      <div
        className="section-header"
        style={{ justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}
      >
        <div>
          <h2 style={{ marginBottom: 6 }}>Orders</h2>
          <p className="muted" style={{ margin: 0 }}>
            Track fulfillment, review order details, and manage live store operations.
          </p>
        </div>
      </div>

      {/* ── summary cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <SummaryCard
          title="Total Store Orders"
          value={summary.totalOrders}
          loading={summaryLoading}
          icon={<ShoppingBag size={18} />}
        />
        <SummaryCard
          title="Pending Fulfillment Count"
          value={summary.pendingCount}
          loading={summaryLoading}
          accent="warning"
          icon={<AlertTriangle size={18} />}
        />
        <SummaryCard
          title="Average Fulfillment Time"
          value={averageFulfillmentMinutes != null ? `${averageFulfillmentMinutes} mins` : '—'}
          icon={<Clock3 size={18} />}
        />
      </div>

      {/* ── toolbar card ── */}
      <article
        className="card"
        style={{
          padding: 16,
          borderRadius: 16,
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div
          className="users-toolbar-row"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            className="users-toolbar-controls"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              flex: 1,
            }}
          >
            <select
              className="select-input users-filter-select"
              value={fulfillmentStatus}
              onChange={handleFulfillmentStatusChange}
              disabled={!storeId}
              style={{ minWidth: 220 }}
            >
              {fulfillmentStatusOptions.map((o) => (
                <option key={o.value || 'all-status'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              className="select-input users-filter-select"
              value={fulfillmentType}
              onChange={handleFulfillmentTypeChange}
              disabled={!storeId}
              style={{ minWidth: 220 }}
            >
              {fulfillmentTypeOptions.map((o) => (
                <option key={o.value || 'all-type'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <div
              style={{
                position: 'relative',
                minWidth: 260,
                flex: '1 1 260px',
              }}
            >
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-secondary)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                className="text-input"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search current page orders"
                disabled={!storeId}
                style={{ paddingLeft: 36, width: '100%' }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.22)',
              background: '#fff',
              color: 'var(--color-text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            <CalendarDays size={16} />
            <span style={{ fontSize: 14 }}>
              {storeId ? `Store ${storeId}` : 'No store selected'}
            </span>
          </div>
        </div>
      </article>

      {/* ── table card ── */}
      <article
        className="card"
        style={{
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
        }}
      >
        {error ? <p className="form-error" style={{ margin: 16 }}>{error}</p> : null}
        {success ? <p className="form-success" style={{ margin: 16 }}>{success}</p> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr
                style={{
                  background: 'linear-gradient(180deg, #4f8098 0%, #44758c 100%)',
                }}
              >
                <th style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleToggleAllVisible}
                    disabled={!displayedOrders.length}
                    aria-label="Select all visible orders"
                  />
                </th>
                <th>Order</th>
                <th>Customer</th>
                <th>Items Count</th>
                <th>Fulfillment Type</th>
                <th>Fulfillment Status</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!storeId ? (
                <tr>
                  <td colSpan="8">Select a store first.</td>
                </tr>
              ) : loading && orders.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '32px 0' }}>
                    <Spinner
                      size={20}
                      style={{
                        margin: '0 auto',
                        display: 'block',
                        color: 'var(--color-text-secondary)',
                      }}
                    />
                  </td>
                </tr>
              ) : displayedOrders.length ? (
                displayedOrders.map((order) => (
                  <OrderRow
                    key={order.billing_id}
                    order={order}
                    checked={selectedIdSet.has(String(order.billing_id))}
                    onToggle={handleToggleOrder}
                    onView={openDetails}
                    onPrint={handlePrintSingle}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan="8">
                    {searchTerm ? 'No orders match your search on this page.' : 'No orders found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedIds.length ? (
          <div
            style={{
              position: 'sticky',
              bottom: 12,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              marginTop: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                pointerEvents: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                padding: 12,
                borderRadius: 16,
                background: 'rgba(241, 245, 249, 0.96)',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
                border: '1px solid rgba(148,163,184,0.22)',
              }}
            >
              <span className="muted" style={{ marginRight: 4 }}>
                {selectedIds.length} selected
              </span>

              <button
                type="button"
                className="ghost-button"
                onClick={handleBulkMarkDelivered}
                disabled={bulkSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {bulkSaving ? <Spinner size={14} /> : <CheckCircle2 size={16} />}
                Bulk Mark Delivered
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={handleBulkPrint}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Printer size={16} />
                Bulk Print Tickets
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={handleExportSelected}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <FileDown size={16} />
                Export Selection to CSV
              </button>
            </div>
          </div>
        ) : null}

        {storeId ? (
          <div
            className="row-actions"
            style={{
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
              padding: '0 16px 16px',
            }}
          >
            <span className="muted">
              {meta.from && meta.to
                ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
                : `${displayedOrders.length} items`}
            </span>

            <div
              className="row-actions compact"
              style={{ alignItems: 'center', gap: 10 }}
            >
              <div className="users-perpage-wrap">
                <select value={perPage} onChange={handlePerPageChange} disabled={!storeId}>
                  {[5, 10, 15, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>

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

              <div>
                <p className="muted">Fulfillment status</p>
                <select
                  className="select-input"
                  value={draftStatus}
                  onChange={handleDraftStatusChange}
                >
                  {detailFulfillmentStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
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
                    <option key={o.value} value={o.value}>
                      {o.label}
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
                type="button"
                className="ghost-button"
                onClick={() => handlePrintSingle(selectedOrder)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Printer size={16} />
                Print
              </button>

              <button
                className="primary-button"
                onClick={handleSaveFulfillment}
                disabled={savingFulfillment}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {savingFulfillment ? (
                  <>
                    <Spinner size={14} /> Saving…
                  </>
                ) : (
                  'Save fulfillment'
                )}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
