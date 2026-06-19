import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CreditCard,
  Gauge,
  UserPlus,
  Wallet,
  Activity,
} from 'lucide-react';
import { useSuperAdminDashboard } from '../../hooks/useSuperAdminDashboard';
import { currency } from '../../utils/helpers';

/* =====================================================================
   HELPERS
   ===================================================================== */
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatPercent = (value, digits = 1) => `${toNumber(value).toFixed(digits)}%`;

const calcDelta = (current, previous) => {
  const safeCurrent = toNumber(current);
  const safePrevious = toNumber(previous);
  const diff = safeCurrent - safePrevious;

  if (!safePrevious && !safeCurrent) {
    return { diff: 0, percent: 0, direction: 'neutral', label: 'No change' };
  }

  if (!safePrevious && safeCurrent > 0) {
    return { diff, percent: 100, direction: 'up', label: 'Started this period' };
  }

  const percent = safePrevious ? (diff / safePrevious) * 100 : 0;

  return {
    diff,
    percent,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
    label: diff === 0 ? 'No change' : `${Math.abs(percent).toFixed(1)}% vs comparison`,
  };
};

/* =====================================================================
   PRESENTATIONAL COMPONENTS
   ===================================================================== */
function MiniBars({ series, currencyCode }) {
  const max = Math.max(...series.map((item) => toNumber(item.amount)), 1);

  return (
    <div className="mini-bars">
      {series.map((item) => (
        <div key={item.key} className="mini-bar-col">
          <span className="mini-bar-value">{currency(toNumber(item.amount), currencyCode)}</span>
          <div className="mini-bar-track">
            <div
              className="mini-bar-fill"
              style={{
                height: `${Math.max((toNumber(item.amount) / max) * 100, item.amount ? 12 : 4)}%`,
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
            {item.label_short || item.label}
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

/* =====================================================================
   MAIN PAGE
   ===================================================================== */
export default function SuperAdminDashboardPage() {
  const { summary, loading, error } = useSuperAdminDashboard();

  const signupTrend = useMemo(() => {
    if (!summary?.platform) return null;
    return calcDelta(summary.platform.new_tenants_30, summary.platform.prev_tenants_30);
  }, [summary]);
  if (loading && !summary) {
    return <div className="page-loader">Preparing dashboard…</div>;
  }

  // Hard error with nothing cached to fall back on
  if (error && !summary) {
    return (
      <section className="stack-lg super-admin-dashboard-v2">
        <div className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Dashboard unavailable</h3>
              <p>{error}</p>
            </div>
            <HeaderPill>Error</HeaderPill>
          </div>
        </div>
      </section>
    );
  }

  if (!summary) return null;
const {
    currency: currentCurrency,
    platform,
    today: todayData,
    stats,
    inventory,
    last_7_days,
    store_performance,
  } = summary;

  return (
    <section className="stack-lg super-admin-dashboard-v2">
      {error ? (
        <div className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Using last available dashboard data</h3>
              <p>{error}</p>
            </div>
            <HeaderPill>Warning</HeaderPill>
          </div>
        </div>
      ) : null}

      <div className="metrics-grid">
        <MetricCard
          icon={Wallet}
          label="Monthly recurring revenue"
          value={currency(platform.mrr, currentCurrency)}
          caption={`${platform.active_tenants} active paying tenants`}
          tone="gold"
        />

        <MetricCard
          icon={Building2}
          label="Active tenants"
          value={platform.active_tenants}
          caption={`${platform.total_tenants} total tenant accounts`}
          tone="brown"
        />

        <MetricCard
          icon={UserPlus}
          label="Tenant sign-up rate"
          value={formatPercent(platform.signup_rate)}
          caption={`${platform.new_tenants_30} new tenants in the last 30 days`}
          tone="soft"
          trend={signupTrend}
        />

        <MetricCard
          icon={AlertTriangle}
          label="Churn rate"
          value={formatPercent(platform.churn_rate)}
          caption={`${platform.churned_tenants_30} tenant cancellations in the last 30 days`}
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
              value={currency(todayData.collected, currentCurrency)}
              hint={`${todayData.orders} orders today`}
              tone="green"
              trendDirection={toNumber(todayData.collected) > 0 ? 'up' : 'neutral'}
            />

            <PulseTile
              icon={CreditCard}
              label="Refunds"
              value={currency(todayData.refund_value, currentCurrency)}
              hint={`${todayData.refund_count} refund rows`}
              tone="yellow"
              trendDirection={toNumber(todayData.refund_count) > 0 ? 'down' : 'neutral'}
            />

            <PulseTile
              icon={AlertTriangle}
              label="Voids / drafts"
              value={todayData.voids}
              hint="Orders needing review"
              tone="red"
              trendDirection={toNumber(todayData.voids) > 0 ? 'down' : 'neutral'}
            />

            <PulseTile
              icon={BarChart3}
              label="Open balances"
              value={currency(todayData.outstanding, currentCurrency)}
              hint="Still unpaid today"
              tone="blue"
              trendDirection={toNumber(todayData.outstanding) > 0 ? 'down' : 'up'}
            />

            <PulseTile
              icon={UserPlus}
              label="New tenants"
              value={todayData.new_tenants}
              hint="Created today"
              tone="blue"
              trendDirection={toNumber(todayData.new_tenants) > 0 ? 'up' : 'neutral'}
            />

            <PulseTile
              icon={Building2}
              label="Active tenants"
              value={platform.active_tenants}
              hint={`${platform.total_tenants} total accounts`}
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
            series={last_7_days}
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
                {store_performance.length ? (
                  store_performance.map((store, index) => (
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
                <strong>{formatPercent(inventory.health_pct)}</strong>
                <span>Inventory health</span>
              </div>
            </div>

            <div className="stat-retro-box">
              <div className="stat-retro-icon tone-blue">
                <Wallet size={18} />
              </div>
              <div>
                <strong>{currency(stats.projected_monthly, currentCurrency)}</strong>
                <span>Projected monthly collections</span>
              </div>
            </div>

            <div className="stat-retro-box">
              <div className="stat-retro-icon tone-blue">
                <BarChart3 size={18} />
              </div>
              <div>
                <strong>{formatPercent(stats.collection_rate)}</strong>
                <span>Collection rate</span>
              </div>
            </div>

            <div className="stat-retro-box">
              <div className="stat-retro-icon tone-yellow">
                <CreditCard size={18} />
              </div>
              <div>
                <strong>{currency(stats.average_ticket, currentCurrency)}</strong>
                <span>Average ticket amount</span>
              </div>
            </div>

            <div className="stat-retro-box span-2">
              <div className="stat-retro-icon tone-blue">
                <Building2 size={18} />
              </div>
              <div>
                <strong>{toNumber(stats.avg_orders_per_tenant).toFixed(1)}</strong>
                <span>
                  Avg orders per tenant ·{' '}
                  {toNumber(stats.avg_customers_per_tenant).toFixed(1)} customers per tenant
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

          <MiniBars series={last_7_days} currencyCode={currentCurrency} />
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
              value={inventory.healthy_count}
              total={inventory.total_rows}
              label="Healthy"
              sublabel={`${inventory.healthy_count} healthy rows · ${inventory.low_stock_count} low stock rows`}
            />

            <div className="inventory-legend-stack">
              <div className="inventory-legend-item">
                <span className="dot good" />
                <div>
                  <strong>Healthy inventory</strong>
                  <p>{inventory.healthy_count} rows above reorder level</p>
                </div>
              </div>

              <div className="inventory-legend-item">
                <span className="dot warn" />
                <div>
                  <strong>Low stock</strong>
                  <p>{inventory.low_stock_count} rows need replenishment</p>
                </div>
              </div>

              <div className="inventory-legend-item">
                <span className="dot neutral" />
                <div>
                  <strong>Total tracked rows</strong>
                  <p>{inventory.total_rows} inventory records across stores</p>
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
              <h3>Platform totals</h3>
              <p>Operational counts returned directly by the summary endpoint</p>
            </div>
            <HeaderPill>Counts</HeaderPill>
          </div>

          <div className="health-grid">
            <HealthTile
              icon={Activity}
              label="Products"
              value={stats.products}
              caption="Tracked products across visible stores"
              tone="soft"
            />
            <HealthTile
              icon={UserPlus}
              label="Customers"
              value={stats.customers}
              caption="Registered customers"
              tone="gold"
            />
            <HealthTile
              icon={Building2}
              label="Staff"
              value={stats.staff}
              caption="Non-admin users across allowed stores"
              tone="brown"
            />
            <HealthTile
              icon={BarChart3}
              label="Orders"
              value={stats.total_orders}
              caption="All non-draft billing rows"
              tone="soft"
            />
          </div>
        </article>

        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Useful alerts</h3>
              <p>Extra items worth monitoring across the platform</p>
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
                <strong>{stats.open_balances_count}</strong>
                <p>{currency(stats.outstanding_total, currentCurrency)}</p>
              </div>
            </div>

            <div className="list-row">
              <div>
                <strong>Low stock watch</strong>
                <p>Inventory rows at or below reorder level</p>
              </div>
              <div className="align-right">
                <strong>{inventory.low_stock_count}</strong>
                <p>Needs replenishment</p>
              </div>
            </div>

            <div className="list-row">
              <div>
                <strong>Average revenue per tenant</strong>
                <p>Paid collections divided by active tenants</p>
              </div>
              <div className="align-right">
                <strong>{currency(stats.avg_revenue_per_tenant, currentCurrency)}</strong>
                <p>Per active tenant</p>
              </div>
            </div>

            <div className="list-row">
              <div>
                <strong>Gross billed vs collected</strong>
                <p>Total invoiced compared with paid collections</p>
              </div>
              <div className="align-right">
                <strong>{currency(stats.gross_billed, currentCurrency)}</strong>
                <p>{currency(stats.paid_collections, currentCurrency)} collected</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
