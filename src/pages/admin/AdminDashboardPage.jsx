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

const getPaidAmount = (billing) => {
  const explicit = Number(
    billing?.paid_amount ?? billing?.amount_paid ?? billing?.total_paid
  );
  if (Number.isFinite(explicit)) return explicit;

  return isPaidStatus(billing?.status)
    ? toNumber(billing?.total || billing?.grand_total || billing?.total_amount || 0)
    : 0;
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

  if (loading) return <div className="page-loader">Preparing dashboard…</div>;

  return (
    <section className="stack-lg">
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

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>Platform revenue · last 7 days</h3>
              <p>Combined paid collections across all tenant stores</p>
            </div>
          </div>
          <MiniBars series={dashboard.last7Days} currencyCode={currentCurrency} />
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>Top-performing tenants</h3>
              <p>Highest-revenue tenant stores in the current workspace</p>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.storePerformance.length ? (
              dashboard.storePerformance.slice(0, 8).map((store, index) => (
                <div key={store.store_id} className="list-row">
                  <div className="list-row-flex">
                    <span className="rank-badge">#{index + 1}</span>
                    <div>
                      <strong>{store.store_name}</strong>
                      <p>{store.tier} · {store.location}</p>
                    </div>
                  </div>
                  <div className="align-right">
                    <strong>{currency(store.revenue, currentCurrency)}</strong>
                    <p>{store.orders} orders</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No tenant activity yet.</p>
            )}
          </div>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>Active tenants overview</h3>
              <p>Subscription tier, status, revenue, and operational pressure by tenant</p>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.storePerformance.length ? (
              dashboard.storePerformance.map((store) => (
                <div key={store.store_id} className="list-row">
                  <div>
                    <strong>{store.store_name}</strong>
                    <p>{store.tier} · {store.status || 'active'}</p>
                  </div>
                  <div className="align-right">
                    <strong>{store.orders} orders</strong>
                    <p>{store.lowStock} low stock · {store.outstanding} open balances</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No tenant rows yet.</p>
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>System health & DevOps</h3>
              <p>Optional live platform telemetry derived from available tenant metadata</p>
            </div>
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
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>M-Pesa / payment gateway status</h3>
              <p>Operational health of payment processing and callbacks</p>
            </div>
          </div>

          <div className="info-grid">
            <div className="info-tile compact">
              <strong>Gateway success rate</strong>
              <span>
                {dashboard.platform.systemHealth.gatewaySuccessRate !== null
                  ? formatPercent(dashboard.platform.systemHealth.gatewaySuccessRate)
                  : 'Not connected'}
              </span>
            </div>
            <div className="info-tile compact">
              <strong>Callback failures</strong>
              <span>{dashboard.platform.systemHealth.callbackFailures} incidents</span>
            </div>
            <div className="info-tile compact">
              <strong>Open support tickets</strong>
              <span>{dashboard.platform.systemHealth.supportTickets} active cases</span>
            </div>
            <div className="info-tile compact">
              <strong>Recent system errors</strong>
              <span>{dashboard.platform.systemHealth.systemErrors} logged events</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>Workspace snapshot</h3>
              <p>Operational summary across the current platform workspace</p>
            </div>
          </div>

          <div className="info-grid">
            <div className="info-tile compact">
              <strong>Products</strong>
              <span>{dashboard.products} catalog items</span>
            </div>
            <div className="info-tile compact">
              <strong>Customers</strong>
              <span>{dashboard.customers} saved profiles</span>
            </div>
            <div className="info-tile compact">
              <strong>Users</strong>
              <span>{dashboard.staff.length} accessible staff accounts</span>
            </div>
            <div className="info-tile compact">
              <strong>Inventory records</strong>
              <span>{dashboard.allInventory.length} rows across stores</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
