import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CreditCard,
  Gauge,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { billingService } from '../../services/billingService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { productService } from '../../services/productService';
import { userService } from '../../services/userService';
import { currency } from '../../utils/helpers';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';

const PAGE_SIZE = 200;
const paidStatuses = ['paid', 'partial'];

const extractList = (response) => {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
};

const extractMeta = (response) =>
  response?.data?.meta || response?.meta || response?.pagination || null;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const isPaidStatus = (value) => paidStatuses.includes(normalizeStatus(value));

const shiftDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const dateOnlyKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getBillingDate = (billing) =>
  billing?.billing_date || billing?.created_at || billing?.updated_at || null;

const getBillingTotal = (billing) =>
  toNumber(billing?.total || billing?.grand_total || billing?.total_amount || 0);

const getPaidAmount = (billing) => {
  const explicit = Number(
    billing?.paid_amount ?? billing?.amount_paid ?? billing?.total_paid
  );
  if (Number.isFinite(explicit)) return explicit;

  return isPaidStatus(billing?.status)
    ? toNumber(billing?.total || billing?.grand_total || billing?.total_amount || 0)
    : 0;
};

const getOutstandingAmount = (billing) => {
  const total = getBillingTotal(billing);
  const explicitBalance = Number(billing?.balance_due ?? billing?.balance);
  if (Number.isFinite(explicitBalance)) return Math.max(explicitBalance, 0);
  return Math.max(total - getPaidAmount(billing), 0);
};

const averageDefined = (values) => {
  const valid = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const formatPercent = (value, digits = 1) => `${toNumber(value).toFixed(digits)}%`;

const calcDelta = (current, previous) => {
  const diff = toNumber(current) - toNumber(previous);

  if (!previous && !current) {
    return { diff: 0, percent: 0, direction: 'neutral', label: 'No change' };
  }

  if (!previous && current > 0) {
    return { diff, percent: 100, direction: 'up', label: 'Started this period' };
  }

  const percent = previous ? (diff / previous) * 100 : 0;

  return {
    diff,
    percent,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
    label:
      diff === 0
        ? 'No change'
        : `${Math.abs(percent).toFixed(1)}% vs comparison`,
  };
};

async function fetchAllFromList(service, params = {}) {
  const firstResponse = await service.list({ page: 1, per_page: PAGE_SIZE, ...params });
  const firstRows = extractList(firstResponse);
  const meta = extractMeta(firstResponse);

  const currentPage = Number(meta?.current_page || meta?.page || 1);
  const lastPage = Number(meta?.last_page || meta?.total_pages || 1);

  if (!lastPage || lastPage <= 1 || currentPage >= lastPage) {
    return firstRows;
  }

  const pages = Array.from(
    { length: lastPage - currentPage },
    (_, index) => currentPage + index + 1
  );

  const restResponses = await Promise.all(
    pages.map((page) => service.list({ page, per_page: PAGE_SIZE, ...params }))
  );

  return [...firstRows, ...restResponses.flatMap((response) => extractList(response))];
}

function buildLast7DaysSeries(billings) {
  const today = new Date();
  const map = new Map();

  for (let i = 6; i >= 0; i -= 1) {
    const date = shiftDays(today, -i);
    const key = dateOnlyKey(date);
    const label = date.toLocaleDateString(undefined, { weekday: 'short' });
    map.set(key, { key, label, amount: 0 });
  }

  billings.forEach((billing) => {
    if (!isPaidStatus(billing?.status)) return;
    const key = dateOnlyKey(getBillingDate(billing));
    if (!key || !map.has(key)) return;
    map.get(key).amount += getPaidAmount(billing);
  });

  return Array.from(map.values());
}

function buildLast7DaysDetailedSeries(billings) {
  const today = new Date();
  const map = new Map();

  for (let i = 6; i >= 0; i -= 1) {
    const date = shiftDays(today, -i);
    const key = dateOnlyKey(date);
    const label = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

    map.set(key, {
      key,
      label,
      collected: 0,
      billed: 0,
      outstanding: 0,
      refunds: 0,
    });
  }

  billings.forEach((billing) => {
    const key = dateOnlyKey(getBillingDate(billing));
    if (!key || !map.has(key)) return;

    const row = map.get(key);
    const status = normalizeStatus(billing?.status);
    const total = getBillingTotal(billing);
    const paid = getPaidAmount(billing);
    const outstanding = getOutstandingAmount(billing);

    if (status !== 'draft') {
      row.billed += total;
      row.outstanding += outstanding;
    }

    if (isPaidStatus(status)) {
      row.collected += paid;
    }

    if (['refund', 'refunded'].includes(status)) {
      row.refunds += total || paid;
    }
  });

  return Array.from(map.values());
}

const getStoreStatus = (store) =>
  normalizeStatus(
    store?.account_status || store?.status || store?.subscription_status || 'active'
  );

const getStoreTier = (store) =>
  store?.subscription_tier ||
  store?.plan_name ||
  store?.package_name ||
  store?.tier ||
  'Standard';

const getTenantMonthlyFee = (store) =>
  toNumber(
    store?.subscription_amount ||
      store?.monthly_fee ||
      store?.plan_price ||
      store?.subscription_price ||
      store?.monthly_amount ||
      0
  );

const isTenantActive = (store) => {
  const status = getStoreStatus(store);
  return !['cancelled', 'canceled', 'inactive', 'suspended', 'archived'].includes(
    status
  );
};

const isWithinRange = (value, start, end) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date < end;
};

function buildSystemHealth(stores, user) {
  const apiLatencyMs = averageDefined([
    user?.system_metrics?.api_latency_ms,
    ...stores.map(
      (store) =>
        store?.api_latency_ms ||
        store?.system_metrics?.api_latency_ms ||
        store?.monitoring?.api_latency_ms
    ),
  ]);

  const dbReadMs = averageDefined([
    user?.system_metrics?.db_read_ms,
    ...stores.map(
      (store) =>
        store?.db_read_ms ||
        store?.system_metrics?.db_read_ms ||
        store?.monitoring?.db_read_ms
    ),
  ]);

  const dbWriteMs = averageDefined([
    user?.system_metrics?.db_write_ms,
    ...stores.map(
      (store) =>
        store?.db_write_ms ||
        store?.system_metrics?.db_write_ms ||
        store?.monitoring?.db_write_ms
    ),
  ]);

  const serverUptimePct = averageDefined([
    user?.system_metrics?.server_uptime_pct,
    ...stores.map(
      (store) =>
        store?.server_uptime_pct ||
        store?.system_metrics?.server_uptime_pct ||
        store?.monitoring?.server_uptime_pct
    ),
  ]);

  const gatewaySuccessRate = averageDefined([
    user?.system_metrics?.mpesa_success_rate,
    ...stores.map(
      (store) =>
        store?.mpesa_success_rate ||
        store?.payment_gateway_success_rate ||
        store?.system_metrics?.mpesa_success_rate ||
        store?.monitoring?.mpesa_success_rate
    ),
  ]);

  const callbackFailures = stores.reduce(
    (sum, store) =>
      sum +
      toNumber(
        store?.mpesa_callback_failures ||
          store?.callback_failures ||
          store?.monitoring?.callback_failures ||
          0
      ),
    0
  );

  const supportTickets = stores.reduce(
    (sum, store) =>
      sum +
      toNumber(
        store?.open_support_tickets ||
          store?.support_tickets_open ||
          store?.monitoring?.open_support_tickets ||
          0
      ),
    0
  );

  const systemErrors = stores.reduce(
    (sum, store) =>
      sum +
      toNumber(
        store?.recent_system_errors ||
          store?.error_count ||
          store?.monitoring?.recent_errors ||
          0
      ),
    0
  );

  return {
    apiLatencyMs,
    dbReadMs,
    dbWriteMs,
    serverUptimePct,
    gatewaySuccessRate,
    callbackFailures,
    supportTickets,
    systemErrors,
  };
}

function MiniBars({ series, currencyCode }) {
  const max = Math.max(...series.map((item) => item.amount), 1);

  return (
    <div className="mini-bars">
      {series.map((item) => (
        <div key={item.key} className="mini-bar-col">
          <span className="mini-bar-value">{currency(item.amount, currencyCode)}</span>
          <div className="mini-bar-track">
            <div
              className="mini-bar-fill"
              style={{
                height: `${Math.max((item.amount / max) * 100, item.amount ? 12 : 4)}%`,
              }}
            />
          </div>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, caption, tone = 'brown', trend }) {
  return (
    <article className={`metric-card metric-tone-${tone}`}>
      <div className="metric-card-top">
        <p className="metric-label-alignment">{label}</p>
        <div className="metric-icon-badge">
          <Icon size={20} />
        </div>
      </div>

      <h3>{value}</h3>

      <div className="metric-card-bottom">
        <span>{caption}</span>
        {trend ? (
          <small className={`metric-trend ${trend.direction}`}>
            {trend.direction === 'up' ? <ArrowUpRight size={14} /> : null}
            {trend.direction === 'down' ? <ArrowDownRight size={14} /> : null}
            {trend.label}
          </small>
        ) : null}
      </div>
    </article>
  );
}

function HealthTile({ icon: Icon, label, value, caption, tone = 'soft' }) {
  return (
    <div className={`health-tile tone-${tone}`}>
      <div className="health-tile-top">
        <div className="metric-icon-badge">
          <Icon size={18} />
        </div>
        <strong>{label}</strong>
      </div>
      <h4>{value}</h4>
      <p>{caption}</p>
    </div>
  );
}

function HeaderPill({ children }) {
  return <span className="dashboard-header-pill">{children}</span>;
}

function PulseTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  trendDirection = 'neutral',
}) {
  return (
    <div className="pulse-tile">
      <div className={`pulse-icon tone-${tone}`}>
        <Icon size={18} />
      </div>

      <div className="pulse-copy">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>

      <small className={`pulse-trend ${trendDirection}`}>{hint}</small>
    </div>
  );
}

function SimpleLineChart({ series, lines, currencyCode }) {
  const width = 640;
  const height = 260;
  const padding = { top: 20, right: 16, bottom: 34, left: 16 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(
    ...series.flatMap((item) => lines.map((line) => toNumber(item[line.key]))),
    1
  );

  const getX = (index) =>
    padding.left +
    (series.length <= 1 ? innerWidth / 2 : (index * innerWidth) / (series.length - 1));

  const getY = (value) =>
    padding.top + innerHeight - (toNumber(value) / maxValue) * innerHeight;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((step) => ({
    y: padding.top + innerHeight - innerHeight * step,
  }));

  const buildPath = (key) =>
    series
      .map((item, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(item[key])}`)
      .join(' ');

  return (
    <div className="sales-graph-shell">
      <div className="sales-legend">
        {lines.map((line) => (
          <span key={line.key} className="sales-legend-item">
            <i style={{ background: line.color }} />
            {line.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="sales-graph-svg" role="img">
        {gridLines.map((line) => (
          <line
            key={line.y}
            x1={padding.left}
            x2={width - padding.right}
            y1={line.y}
            y2={line.y}
            className="sales-grid-line"
          />
        ))}

        {series.map((item, index) => (
          <text
            key={item.key}
            x={getX(index)}
            y={height - 10}
            textAnchor="middle"
            className="sales-axis-label"
          >
            {item.label}
          </text>
        ))}

        {lines.map((line) => (
          <path
            key={line.key}
            d={buildPath(line.key)}
            fill="none"
            stroke={line.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {lines.map((line) =>
          series.map((item, index) => (
            <circle
              key={`${line.key}-${item.key}`}
              cx={getX(index)}
              cy={getY(item[line.key])}
              r="4"
              fill={line.color}
              stroke="#fff"
              strokeWidth="2"
            />
          ))
        )}
      </svg>

      <div className="sales-graph-summary">
        <div>
          <span>Collected</span>
          <strong>
            {currency(
              series.reduce((sum, item) => sum + toNumber(item.collected), 0),
              currencyCode
            )}
          </strong>
        </div>
        <div>
          <span>Billed</span>
          <strong>
            {currency(
              series.reduce((sum, item) => sum + toNumber(item.billed), 0),
              currencyCode
            )}
          </strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>
            {currency(
              series.reduce((sum, item) => sum + toNumber(item.outstanding), 0),
              currencyCode
            )}
          </strong>
        </div>
      </div>
    </div>
  );
}

function DonutChart({ value, total, label, sublabel }) {
  const safeTotal = Math.max(toNumber(total), 1);
  const ratio = Math.min(Math.max(toNumber(value) / safeTotal, 0), 1);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;

  return (
    <div className="donut-card">
      <div className="donut-visual">
        <svg viewBox="0 0 140 140" className="donut-svg">
          <circle cx="70" cy="70" r={radius} className="donut-track" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="donut-progress"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        </svg>

        <div className="donut-center">
          <strong>{formatPercent(ratio * 100)}</strong>
          <span>{label}</span>
        </div>
      </div>

      <p>{sublabel}</p>
    </div>
  );
}

export default function SuperAdminDashboardPage() {
  const { user } = useAuth();
  const { stores, activeStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({
    products: 0,
    customers: 0,
    staff: [],
    allBillings: [],
    allInventory: [],
    last7Days: [],
    storePerformance: [],
    platform: {
      mrr: 0,
      activeTenants: 0,
      newTenants30: 0,
      prevTenants30: 0,
      signupRate: 0,
      churnedTenants30: 0,
      churnRate: 0,
      systemHealth: {
        apiLatencyMs: null,
        dbReadMs: null,
        dbWriteMs: null,
        serverUptimePct: null,
        gatewaySuccessRate: null,
        callbackFailures: 0,
        supportTickets: 0,
        systemErrors: 0,
      },
    },
  });

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const scopedStoreIds = stores
          .map((store) => Number(store.store_id))
          .filter(Boolean);

        const [products, customers, users, billingGroups, inventoryGroups] =
          await Promise.all([
            fetchAllFromList(productService),
            fetchAllFromList(customerService),
            fetchAllFromList(userService),
            Promise.all(
              scopedStoreIds.map((id) =>
                fetchAllFromList(billingService, { store_id: id })
              )
            ),
            Promise.all(
              scopedStoreIds.map((id) =>
                fetchAllFromList(inventoryService, { store_id: id })
              )
            ),
          ]);

        const staff = users.filter((item) => item?.role !== 'admin');

        const allBillings = billingGroups.flatMap((rows, index) =>
          rows.map((item) => ({
            ...item,
            store_id: item?.store_id ?? scopedStoreIds[index],
          }))
        );

        const allInventory = inventoryGroups.flatMap((rows, index) =>
          rows.map((item) => ({
            ...item,
            store_id: item?.store_id ?? scopedStoreIds[index],
          }))
        );

        const storePerformance = stores
          .map((store) => {
            const storeBillings = allBillings.filter(
              (item) => String(item?.store_id) === String(store?.store_id)
            );
            const storeInventory = allInventory.filter(
              (item) => String(item?.store_id) === String(store?.store_id)
            );

            const revenue = storeBillings
              .filter((item) => isPaidStatus(item?.status))
              .reduce((sum, item) => sum + getPaidAmount(item), 0);

            const orders = storeBillings.filter(
              (item) => normalizeStatus(item?.status) !== 'draft'
            ).length;

            const lowStock = storeInventory.filter(
              (item) => toNumber(item?.quantity) <= toNumber(item?.reorder_level)
            ).length;

            const outstanding = storeBillings.filter(
              (item) =>
                toNumber(item?.balance_due ?? item?.balance ?? 0) > 0 ||
                (toNumber(item?.total || item?.grand_total || 0) - getPaidAmount(item)) > 0
            ).length;

            return {
              store_id: store?.store_id,
              store_name: store?.store_name || 'Unnamed store',
              location: store?.location || store?.physical_address || '—',
              tier: getStoreTier(store),
              status: getStoreStatus(store),
              revenue,
              orders,
              lowStock,
              outstanding,
            };
          })
          .sort((a, b) => b.revenue - a.revenue);

        const activeTenants = stores.filter(isTenantActive);
        const now = new Date();
        const thirtyDaysAgo = shiftDays(now, -30);
        const sixtyDaysAgo = shiftDays(now, -60);

        const newTenants30 = stores.filter((store) =>
          isWithinRange(store?.created_at || store?.createdAt, thirtyDaysAgo, now)
        ).length;

        const prevTenants30 = stores.filter((store) =>
          isWithinRange(store?.created_at || store?.createdAt, sixtyDaysAgo, thirtyDaysAgo)
        ).length;

        const churnedTenants30 = stores.filter((store) => {
          const status = getStoreStatus(store);
          const inactive = ['cancelled', 'canceled', 'inactive', 'suspended'].includes(
            status
          );

          return (
            inactive &&
            isWithinRange(
              store?.updated_at ||
                store?.cancelled_at ||
                store?.canceled_at ||
                store?.deactivated_at,
              thirtyDaysAgo,
              now
            )
          );
        }).length;

        const mrr = activeTenants.reduce(
          (sum, store) => sum + getTenantMonthlyFee(store),
          0
        );

        const signupRate =
          prevTenants30 > 0
            ? ((newTenants30 - prevTenants30) / prevTenants30) * 100
            : newTenants30 > 0
            ? 100
            : 0;

        const churnRate =
          activeTenants.length + churnedTenants30 > 0
            ? (churnedTenants30 / (activeTenants.length + churnedTenants30)) * 100
            : 0;

        setDashboard({
          products: products.length,
          customers: customers.length,
          staff,
          allBillings,
          allInventory,
          last7Days: buildLast7DaysSeries(allBillings),
          storePerformance,
          platform: {
            mrr,
            activeTenants: activeTenants.length,
            newTenants30,
            prevTenants30,
            signupRate,
            churnedTenants30,
            churnRate,
            systemHealth: buildSystemHealth(stores, user),
          },
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [stores, activeStore, user]);

  const currentCurrency = useMemo(
    () => activeStore?.currency || stores?.[0]?.currency || 'KES',
    [activeStore, stores]
  );

  const signupTrend = calcDelta(
    dashboard.platform.newTenants30,
    dashboard.platform.prevTenants30
  );

  const analytics = useMemo(() => {
    const todayKey = dateOnlyKey(new Date());
    const billings = dashboard.allBillings;
    const inventory = dashboard.allInventory;
    const detailed7Days = buildLast7DaysDetailedSeries(billings);

    const todayBillings = billings.filter(
      (billing) => dateOnlyKey(getBillingDate(billing)) === todayKey
    );

    const todayCollected = todayBillings
      .filter((item) => isPaidStatus(item?.status))
      .reduce((sum, item) => sum + getPaidAmount(item), 0);

    const todayOrders = todayBillings.filter(
      (item) => normalizeStatus(item?.status) !== 'draft'
    ).length;

    const todayRefunds = todayBillings.filter((item) =>
      ['refund', 'refunded'].includes(normalizeStatus(item?.status))
    );

    const todayRefundValue = todayRefunds.reduce(
      (sum, item) => sum + (getBillingTotal(item) || getPaidAmount(item)),
      0
    );

    const todayVoids = todayBillings.filter((item) =>
      ['void', 'voided', 'cancelled', 'canceled', 'draft'].includes(
        normalizeStatus(item?.status)
      )
    ).length;

    const todayOutstanding = todayBillings.reduce(
      (sum, item) => sum + getOutstandingAmount(item),
      0
    );

    const grossBilled = billings
      .filter((item) => normalizeStatus(item?.status) !== 'draft')
      .reduce((sum, item) => sum + getBillingTotal(item), 0);

    const paidCollections = billings
      .filter((item) => isPaidStatus(item?.status))
      .reduce((sum, item) => sum + getPaidAmount(item), 0);

    const outstandingTotal = billings.reduce(
      (sum, item) => sum + getOutstandingAmount(item),
      0
    );

    const allOrders = billings.filter(
      (item) => normalizeStatus(item?.status) !== 'draft'
    ).length;

    const averageTicket = allOrders > 0 ? paidCollections / allOrders : 0;
    const avgOrdersPerTenant =
      dashboard.platform.activeTenants > 0
        ? allOrders / dashboard.platform.activeTenants
        : 0;

    const avgCustomersPerTenant =
      dashboard.platform.activeTenants > 0
        ? dashboard.customers / dashboard.platform.activeTenants
        : 0;

    const avgRevenuePerTenant =
      dashboard.platform.activeTenants > 0
        ? paidCollections / dashboard.platform.activeTenants
        : 0;

    const collectionRate = grossBilled > 0 ? (paidCollections / grossBilled) * 100 : 0;

    const lowStockCount = inventory.filter(
      (item) => toNumber(item?.quantity) <= toNumber(item?.reorder_level)
    ).length;

    const healthyStockCount = Math.max(inventory.length - lowStockCount, 0);
    const inventoryHealth =
      inventory.length > 0 ? (healthyStockCount / inventory.length) * 100 : 0;

    const newTenantsToday = stores.filter(
      (store) => dateOnlyKey(store?.created_at || store?.createdAt) === todayKey
    ).length;

    const projectedMonthlyCollections =
      detailed7Days.length > 0
        ? (detailed7Days.reduce((sum, item) => sum + item.collected, 0) / detailed7Days.length) *
          30
        : 0;

    const openBalancesCount = billings.filter(
      (item) => getOutstandingAmount(item) > 0
    ).length;

    return {
      detailed7Days,
      todayCollected,
      todayOrders,
      todayRefundCount: todayRefunds.length,
      todayRefundValue,
      todayVoids,
      todayOutstanding,
      grossBilled,
      paidCollections,
      outstandingTotal,
      allOrders,
      averageTicket,
      avgOrdersPerTenant,
      avgCustomersPerTenant,
      avgRevenuePerTenant,
      collectionRate,
      lowStockCount,
      healthyStockCount,
      inventoryHealth,
      newTenantsToday,
      projectedMonthlyCollections,
      openBalancesCount,
    };
  }, [dashboard, stores]);

  if (loading) return <div className="page-loader">Preparing dashboard…</div>;

  return (
    <section className="stack-lg super-admin-dashboard-v2">
      <div className="metrics-grid">
        <MetricCard
          icon={Wallet}
          label="Monthly recurring revenue"
          value={currency(dashboard.platform.mrr, currentCurrency)}
          caption={`${dashboard.platform.activeTenants} active paying tenants`}
          tone="gold"
        />

        <MetricCard
          icon={Building2}
          label="Active tenants"
          value={dashboard.platform.activeTenants}
          caption={`${stores.length} total tenant accounts`}
          tone="brown"
        />

        <MetricCard
          icon={UserPlus}
          label="Tenant sign-up rate"
          value={formatPercent(dashboard.platform.signupRate)}
          caption={`${dashboard.platform.newTenants30} new tenants in the last 30 days`}
          tone="soft"
          trend={signupTrend}
        />

        <MetricCard
          icon={AlertTriangle}
          label="Churn rate"
          value={formatPercent(dashboard.platform.churnRate)}
          caption={`${dashboard.platform.churnedTenants30} tenant cancellations in the last 30 days`}
          tone="brown"
        />
      </div>

      <div className="dashboard-grid dashboard-hero-grid">
        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Today's platform pulse</h3>
              <p>Quick operational snapshot across all connected stores</p>
            </div>
            <HeaderPill>Today</HeaderPill>
          </div>

          <div className="takings-grid">
            <PulseTile
              icon={Wallet}
              label="Collected"
              value={currency(analytics.todayCollected, currentCurrency)}
              hint={`${analytics.todayOrders} orders today`}
              tone="green"
              trendDirection={analytics.todayCollected > 0 ? 'up' : 'neutral'}
            />

            <PulseTile
              icon={CreditCard}
              label="Refunds"
              value={currency(analytics.todayRefundValue, currentCurrency)}
              hint={`${analytics.todayRefundCount} refund rows`}
              tone="yellow"
              trendDirection={analytics.todayRefundCount > 0 ? 'down' : 'neutral'}
            />

            <PulseTile
              icon={AlertTriangle}
              label="Voids / drafts"
              value={analytics.todayVoids}
              hint="Orders needing review"
              tone="red"
              trendDirection={analytics.todayVoids > 0 ? 'down' : 'neutral'}
            />

            <PulseTile
              icon={BarChart3}
              label="Open balances"
              value={currency(analytics.todayOutstanding, currentCurrency)}
              hint="Still unpaid today"
              tone="blue"
              trendDirection={analytics.todayOutstanding > 0 ? 'down' : 'up'}
            />

            <PulseTile
              icon={UserPlus}
              label="New tenants"
              value={analytics.newTenantsToday}
              hint="Created today"
              tone="blue"
              trendDirection={analytics.newTenantsToday > 0 ? 'up' : 'neutral'}
            />

            <PulseTile
              icon={Building2}
              label="Active tenants"
              value={dashboard.platform.activeTenants}
              hint={`${stores.length} total accounts`}
              tone="green"
              trendDirection="up"
            />
          </div>
        </article>

        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Sales graph</h3>
              <p>Collections, billing, and outstanding balances over the last 7 days</p>
            </div>
            <HeaderPill>Last 7 days</HeaderPill>
          </div>

          <SimpleLineChart
            series={analytics.detailed7Days}
            currencyCode={currentCurrency}
            lines={[
              { key: 'collected', label: 'Collected', color: '#37b26c' },
              { key: 'billed', label: 'Billed', color: '#0e84c3' },
              { key: 'outstanding', label: 'Outstanding', color: '#e17a38' },
              { key: 'refunds', label: 'Refunds', color: '#d9485f' },
            ]}
          />
        </article>
      </div>

      <div className="dashboard-grid dashboard-hero-grid">
        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Top rank tenants</h3>
              <p>Highest performing stores by paid collections</p>
            </div>
            <HeaderPill>Ranked</HeaderPill>
          </div>

          <div className="table-wrap dashboard-rank-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Tier</th>
                  <th>Orders</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.storePerformance.length ? (
                  dashboard.storePerformance.slice(0, 8).map((store, index) => (
                    <tr key={store.store_id}>
                      <td>
                        <strong>
                          #{index + 1} · {store.store_name}
                        </strong>
                        <span className="muted">{store.location}</span>
                      </td>
                      <td>{store.tier}</td>
                      <td>{store.orders}</td>
                      <td>{currency(store.revenue, currentCurrency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="catalog-empty-cell">
                      No tenant activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Stats</h3>
              <p>High-level commercial performance indicators</p>
            </div>
            <HeaderPill>Overview</HeaderPill>
          </div>

          <div className="stats-grid-retro">
            <div className="stat-retro-box">
              <div className="stat-retro-icon tone-yellow">
                <Gauge size={18} />
              </div>
              <div>
                <strong>{formatPercent(analytics.inventoryHealth)}</strong>
                <span>Inventory health</span>
              </div>
            </div>

            <div className="stat-retro-box">
              <div className="stat-retro-icon tone-blue">
                <Wallet size={18} />
              </div>
              <div>
                <strong>{currency(analytics.projectedMonthlyCollections, currentCurrency)}</strong>
                <span>Projected monthly collections</span>
              </div>
            </div>

            <div className="stat-retro-box">
              <div className="stat-retro-icon tone-blue">
                <BarChart3 size={18} />
              </div>
              <div>
                <strong>{formatPercent(analytics.collectionRate)}</strong>
                <span>Collection rate</span>
              </div>
            </div>

            <div className="stat-retro-box">
              <div className="stat-retro-icon tone-yellow">
                <CreditCard size={18} />
              </div>
              <div>
                <strong>{currency(analytics.averageTicket, currentCurrency)}</strong>
                <span>Average ticket amount</span>
              </div>
            </div>

            <div className="stat-retro-box span-2">
              <div className="stat-retro-icon tone-blue">
                <Building2 size={18} />
              </div>
              <div>
                <strong>{analytics.avgOrdersPerTenant.toFixed(1)}</strong>
                <span>
                  Avg orders per tenant · {analytics.avgCustomersPerTenant.toFixed(1)} customers
                  per tenant
                </span>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="dashboard-grid dashboard-hero-grid">
        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Sale stats</h3>
              <p>Daily paid collections across the last 7 days</p>
            </div>
            <HeaderPill>Last 7 days</HeaderPill>
          </div>

          <MiniBars series={dashboard.last7Days} currencyCode={currentCurrency} />
        </article>

        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Inventory stats</h3>
              <p>Healthy stock vs items at or below reorder level</p>
            </div>
            <HeaderPill>Inventory</HeaderPill>
          </div>

          <div className="inventory-split">
            <DonutChart
              value={analytics.healthyStockCount}
              total={dashboard.allInventory.length}
              label="Healthy"
              sublabel={`${analytics.healthyStockCount} healthy rows · ${analytics.lowStockCount} low stock rows`}
            />

            <div className="inventory-legend-stack">
              <div className="inventory-legend-item">
                <span className="dot good" />
                <div>
                  <strong>Healthy inventory</strong>
                  <p>{analytics.healthyStockCount} rows above reorder level</p>
                </div>
              </div>

              <div className="inventory-legend-item">
                <span className="dot warn" />
                <div>
                  <strong>Low stock</strong>
                  <p>{analytics.lowStockCount} rows need replenishment</p>
                </div>
              </div>

              <div className="inventory-legend-item">
                <span className="dot neutral" />
                <div>
                  <strong>Total tracked rows</strong>
                  <p>{dashboard.allInventory.length} inventory records across stores</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="dashboard-grid dashboard-hero-grid">
        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>System health & DevOps</h3>
              <p>Optional live platform telemetry derived from tenant metadata</p>
            </div>
            <HeaderPill>Live</HeaderPill>
          </div>

          <div className="health-grid">
            <HealthTile
              icon={Gauge}
              label="API latency"
              value={
                dashboard.platform.systemHealth.apiLatencyMs !== null
                  ? `${dashboard.platform.systemHealth.apiLatencyMs.toFixed(0)} ms`
                  : 'Not connected'
              }
              caption="Average response latency"
              tone="soft"
            />
            <HealthTile
              icon={Activity}
              label="Server uptime"
              value={
                dashboard.platform.systemHealth.serverUptimePct !== null
                  ? formatPercent(dashboard.platform.systemHealth.serverUptimePct)
                  : 'Not connected'
              }
              caption="Observed uptime from connected telemetry"
              tone="gold"
            />
            <HealthTile
              icon={BarChart3}
              label="DB read / write"
              value={
                dashboard.platform.systemHealth.dbReadMs !== null ||
                dashboard.platform.systemHealth.dbWriteMs !== null
                  ? `${Math.round(dashboard.platform.systemHealth.dbReadMs || 0)} / ${Math.round(
                      dashboard.platform.systemHealth.dbWriteMs || 0
                    )} ms`
                  : 'Not connected'
              }
              caption="Average database read and write timings"
              tone="brown"
            />
            <HealthTile
              icon={CreditCard}
              label="Gateway success"
              value={
                dashboard.platform.systemHealth.gatewaySuccessRate !== null
                  ? formatPercent(dashboard.platform.systemHealth.gatewaySuccessRate)
                  : 'Not connected'
              }
              caption="Payment API success rate"
              tone="soft"
            />
          </div>
        </article>

        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Useful alerts</h3>
              <p>Extra items worth monitoring beyond the screenshot layout</p>
            </div>
            <HeaderPill>Actionable</HeaderPill>
          </div>

          <div className="list-stack">
            <div className="list-row">
              <div>
                <strong>Open balances</strong>
                <p>Billings with unpaid balances across stores</p>
              </div>
              <div className="align-right">
                <strong>{analytics.openBalancesCount}</strong>
                <p>{currency(analytics.outstandingTotal, currentCurrency)}</p>
              </div>
            </div>

            <div className="list-row">
              <div>
                <strong>Low stock watch</strong>
                <p>Inventory rows at or below reorder level</p>
              </div>
              <div className="align-right">
                <strong>{analytics.lowStockCount}</strong>
                <p>Needs replenishment</p>
              </div>
            </div>

            <div className="list-row">
              <div>
                <strong>Payment gateway incidents</strong>
                <p>Callback failures, tickets, and recent system errors</p>
              </div>
              <div className="align-right">
                <strong>
                  {dashboard.platform.systemHealth.callbackFailures +
                    dashboard.platform.systemHealth.supportTickets +
                    dashboard.platform.systemHealth.systemErrors}
                </strong>
                <p>Total tracked issues</p>
              </div>
            </div>

            <div className="list-row">
              <div>
                <strong>Average revenue per tenant</strong>
                <p>Paid collections divided by active tenants</p>
              </div>
              <div className="align-right">
                <strong>{currency(analytics.avgRevenuePerTenant, currentCurrency)}</strong>
                <p>Per active tenant</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
