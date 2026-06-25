import { memo, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  CreditCard,
  Gauge,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useStore } from '../../contexts/StoreContext';
import { useManagerDashboard } from '../../hooks/useManagerDashboard';
import { currency, formatDateTime } from '../../utils/helpers';
import '../../styles/manager-dashboard.css';

/* =====================================================================
   HELPERS
   ===================================================================== */
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatPercent = (value, digits = 1) =>
  `${toNumber(value).toFixed(digits)}%`;

const formatCompact = (value) => {
  const n = toNumber(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

const calcDelta = (current, previous) => {
  const safeCurrent = toNumber(current);
  const safePrevious = toNumber(previous);
  const diff = safeCurrent - safePrevious;

  if (!safePrevious && !safeCurrent) {
    return { diff: 0, percent: 0, direction: 'neutral', label: 'No change' };
  }

  if (!safePrevious && safeCurrent > 0) {
    return { diff, percent: 100, direction: 'up', label: 'Started today' };
  }

  const percent = safePrevious ? (diff / safePrevious) * 100 : 0;

  return {
    diff,
    percent,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
    label:
      diff === 0
        ? 'No change'
        : `${Math.abs(percent).toFixed(1)}% vs yesterday`,
  };
};

const CHART_COLORS = {
  sales: '#0e84c3',
  refunds: '#d6336c',
  cost: '#d95b74',
  profit: '#18a36a',
  net: '#5f97ab',
};

/* =====================================================================
   PRESENTATIONAL COMPONENTS
   ===================================================================== */
const HeaderPill = memo(function HeaderPill({ children, tone = 'info' }) {
  return <span className={`mg-pill mg-pill--${tone}`}>{children}</span>;
});

const SectionSkeleton = memo(function SectionSkeleton({ height = 220 }) {
  return (
    <div className="mg-skeleton-block" style={{ minHeight: height }}>
      <div className="mg-skeleton mg-skeleton--lg" />
      <div className="mg-skeleton mg-skeleton--md" />
      <div className="mg-skeleton mg-skeleton--sm" />
      <div className="mg-skeleton mg-skeleton--sm" />
    </div>
  );
});

const PulseTile = memo(function PulseTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  trend,
}) {
  return (
    <div className="mg-pulse">
      <div className={`mg-pulse__icon mg-pulse__icon--${tone}`}>
        <Icon size={18} />
      </div>

      <div className="mg-pulse__copy">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>

      {trend ? (
        <small className={`mg-trend mg-trend--${trend.direction}`}>
          {trend.direction === 'up' ? <ArrowUpRight size={14} /> : null}
          {trend.direction === 'down' ? <ArrowDownRight size={14} /> : null}
          {trend.label}
        </small>
      ) : (
        <small className="mg-trend mg-trend--neutral">{hint}</small>
      )}
    </div>
  );
});

const StatBox = memo(function StatBox({ icon: Icon, label, value, tone = 'soft' }) {
  return (
    <div className={`mg-stat mg-stat--${tone}`}>
      <div className="mg-icon-badge">
        <Icon size={16} />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
});

const SalesGraph = memo(function SalesGraph({ series, currencyCode }) {
  const width = 600;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 40, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const safe = Array.isArray(series) ? series : [];

  const lines = useMemo(
    () => [
      { key: 'profit', label: 'Profit', color: CHART_COLORS.profit },
      { key: 'cost', label: 'Cost', color: CHART_COLORS.cost },
      { key: 'sales', label: 'Sales', color: CHART_COLORS.sales },
      { key: 'refunds', label: 'Refunds', color: CHART_COLORS.refunds },
      { key: 'net', label: 'Net', color: CHART_COLORS.net },
    ],
    []
  );

  const maxValue = Math.max(
    ...safe.flatMap((row) => lines.map((line) => Math.abs(toNumber(row[line.key])))),
    1
  );

  const getX = (index) =>
    padding.left +
    (safe.length <= 1
      ? innerWidth / 2
      : (index * innerWidth) / (safe.length - 1));

  const getY = (value) =>
    padding.top + innerHeight - (toNumber(value) / maxValue) * innerHeight;

  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const ratio = i / gridCount;
    return {
      y: padding.top + innerHeight - innerHeight * ratio,
      label: formatCompact(maxValue * ratio),
    };
  });

  const buildPath = (key) =>
    safe
      .map((row, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(row[key])}`)
      .join(' ');

  const totals = safe.reduce(
    (acc, row) => ({
      sales: acc.sales + toNumber(row.sales),
      refunds: acc.refunds + toNumber(row.refunds),
      profit: acc.profit + toNumber(row.profit),
    }),
    { sales: 0, refunds: 0, profit: 0 }
  );

  return (
    <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="mg-chart-legend">
        {lines.map((line) => (
          <span key={line.key} className="mg-chart-legend__item">
            <i style={{ background: line.color }} />
            {line.label}
          </span>
        ))}
      </div>

      <div style={{ width: '100%', overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: 16,
            border: '1px solid var(--mg-border)',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,251,254,0.92))',
          }}
          role="img"
          aria-label="Sales trend chart"
        >
          {gridLines.map((line) => (
            <g key={line.y}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={line.y}
                y2={line.y}
                className="mg-chart-grid"
              />
              <text
                x={padding.left - 8}
                y={line.y + 4}
                textAnchor="end"
                className="mg-chart-axis"
              >
                {line.label}
              </text>
            </g>
          ))}

          {safe.map((row, i) => (
            <text
              key={row.key || i}
              x={getX(i)}
              y={height - 8}
              textAnchor="middle"
              className="mg-chart-axis"
            >
              {row.label_short || row.label}
            </text>
          ))}

          {lines.map((line) => (
            <path
              key={line.key}
              d={buildPath(line.key)}
              fill="none"
              stroke={line.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {lines.map((line) =>
            safe.map((row, i) => (
              <circle
                key={`${line.key}-${row.key || i}`}
                cx={getX(i)}
                cy={getY(row[line.key])}
                r="3.5"
                fill={line.color}
                stroke="#fff"
                strokeWidth="2"
              />
            ))
          )}
        </svg>
      </div>

      <div className="mg-chart-summary">
        <div>
          <span>Sales</span>
          <strong>{currency(totals.sales, currencyCode)}</strong>
        </div>
        <div>
          <span>Refunds</span>
          <strong>{currency(totals.refunds, currencyCode)}</strong>
        </div>
        <div>
          <span>Profit</span>
          <strong>{currency(totals.profit, currencyCode)}</strong>
        </div>
      </div>
    </div>
  );
});

const DonutChart = memo(function DonutChart({ value, total, label, sublabel }) {
  const safeTotal = Math.max(toNumber(total), 1);
  const ratio = Math.min(Math.max(toNumber(value) / safeTotal, 0), 1);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;

  return (
    <div className="mg-donut">
      <div className="mg-donut__visual">
        <svg viewBox="0 0 140 140" className="mg-donut__svg">
          <circle cx="70" cy="70" r={radius} className="mg-donut__track" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="mg-donut__progress"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        </svg>

        <div className="mg-donut__center">
          <strong>{formatPercent(ratio * 100)}</strong>
          <span>{label}</span>
        </div>
      </div>

      <p>{sublabel}</p>
    </div>
  );
});

/* =====================================================================
   MAIN PAGE
   ===================================================================== */
export default function ManagerDashboardPage() {
  const { stores, storeId, activeStore } = useStore();

  const {
    data,
    loading,
    refreshing,
    error,
    sectionLoading,
    refresh,
  } = useManagerDashboard({ selectedStoreId: storeId });

  const currentCurrency = data.currency || activeStore?.currency || stores?.[0]?.currency || 'KES';

  const summary = data.summary || {};
  const todayData = summary.today || {};
  const stats = summary.stats || {};
  const loyalty = summary.loyalty || {};
  const topItems = summary.top_items || [];
  const cashierPerformance = summary.cashier_performance || [];
  const registerPerformance = summary.register_performance || [];
  const last7Days = data.trends?.last_7_days || [];
  const recent = data.activity?.recent || [];
  const pendingOrders = data.activity?.pending_orders || [];
  const lowStockRows = data.activity?.low_stock_rows || [];

  const salesTrend = useMemo(
    () => calcDelta(todayData.transactions, todayData.transactions_prev),
    [todayData.transactions, todayData.transactions_prev]
  );

  const refundTrend = useMemo(
    () => calcDelta(todayData.refund_value, todayData.refund_value_prev),
    [todayData.refund_value, todayData.refund_value_prev]
  );

  const voidTrend = useMemo(
    () => calcDelta(todayData.void_count, todayData.void_count_prev),
    [todayData.void_count, todayData.void_count_prev]
  );

  const netTrend = useMemo(
    () => calcDelta(todayData.net_sales, todayData.net_sales_prev),
    [todayData.net_sales, todayData.net_sales_prev]
  );

  const costTrend = useMemo(
    () => calcDelta(todayData.cost, todayData.cost_prev),
    [todayData.cost, todayData.cost_prev]
  );

  const profitTrend = useMemo(
    () => calcDelta(todayData.profit, todayData.profit_prev),
    [todayData.profit, todayData.profit_prev]
  );

  const hasPrimaryData = useMemo(
    () => Object.keys(todayData).length > 0 || Object.keys(stats).length > 0,
    [todayData, stats]
  );

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (loading && !hasPrimaryData) {
    return (
      <section className="mg-page">
        <div className="mg-page__loader">
          <div className="spinner" />
          <p>Preparing dashboard…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mg-page">
      <header className="mg-hero">
        <div className="mg-hero__copy">
          <span className="mg-kicker">Manager · Store overview</span>
          <h1>{activeStore?.store_name || 'My store'}</h1>
          <p>Live cashier performance, today&apos;s takings, and inventory health.</p>
        </div>

        <div className="mg-hero__actions">
          <button
            className="mg-refresh-btn"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="mg-banner mg-banner--warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Using last available dashboard data</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      {/* ── Today's takings ─────────────────────────────────────────── */}
      <div className="mg-grid mg-grid--2">
        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Today&apos;s takings</h3>
              <p>Live sales pulse for this store</p>
            </div>
            <HeaderPill tone="info">Today</HeaderPill>
          </div>

          {sectionLoading.summary ? (
            <SectionSkeleton height={260} />
          ) : (
            <div className="mg-pulse-grid">
              <PulseTile
                icon={ShoppingCart}
                label="Sales"
                value={toNumber(todayData.transactions)}
                hint={`${currency(todayData.gross_sales, currentCurrency)} gross`}
                tone="green"
                trend={salesTrend}
              />

              <PulseTile
                icon={RotateCcw}
                label="Refunds"
                value={currency(todayData.refund_value, currentCurrency)}
                hint="Refunded today"
                tone="yellow"
                trend={refundTrend}
              />

              <PulseTile
                icon={AlertTriangle}
                label="Voids / drafts"
                value={toNumber(todayData.void_count)}
                hint="Orders needing review"
                tone="red"
                trend={voidTrend}
              />

              <PulseTile
                icon={Wallet}
                label="Net sales"
                value={currency(todayData.net_sales, currentCurrency)}
                hint="After refunds"
                tone="blue"
                trend={netTrend}
              />

              <PulseTile
                icon={Receipt}
                label="Cost"
                value={currency(todayData.cost, currentCurrency)}
                hint="COGS today"
                tone="yellow"
                trend={costTrend}
              />

              <PulseTile
                icon={TrendingUp}
                label="Profit"
                value={currency(todayData.profit, currentCurrency)}
                hint={`${formatPercent(stats.average_margin)} margin`}
                tone="green"
                trend={profitTrend}
              />
            </div>
          )}
        </article>

        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Sales graph</h3>
              <p>7-day performance across sales, cost, profit and refunds</p>
            </div>
            <HeaderPill tone="info">Last 7 days</HeaderPill>
          </div>

          {sectionLoading.trends ? (
            <SectionSkeleton height={300} />
          ) : (
            <SalesGraph series={last7Days} currencyCode={currentCurrency} />
          )}
        </article>
      </div>

      {/* ── Top items + stats ─────────────────────────────────────── */}
      <div className="mg-grid mg-grid--2">
        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Top rank items</h3>
              <p>Best performing products this month</p>
            </div>
            <HeaderPill tone="info">Top 10</HeaderPill>
          </div>

          <div className="mg-table-wrap">
            <table className="mg-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {topItems.length ? (
                  topItems.map((item, index) => (
                    <tr key={item.product_id || `${item.name}-${index}`}>
                      <td>
                        <strong>{index + 1} · {item.name}</strong>
                      </td>
                      <td>{toNumber(item.qty)}</td>
                      <td>{currency(item.amount, currentCurrency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="mg-empty-cell">
                      No item performance data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Operational stats</h3>
              <p>Fast health metrics for this store</p>
            </div>
            <HeaderPill tone="accent">Overview</HeaderPill>
          </div>

          <div className="mg-stat-grid">
            <StatBox
              icon={Package}
              label="Inventory grace"
              value={formatPercent(stats.inventory_health_pct, 0)}
              tone="soft"
            />
            <StatBox
              icon={CircleDollarSign}
              label="Monthly projected"
              value={currency(stats.monthly_projected_sales, currentCurrency)}
              tone="gold"
            />
            <StatBox
              icon={Percent}
              label="Average margin"
              value={formatPercent(stats.average_margin)}
              tone="soft"
            />
            <StatBox
              icon={Wallet}
              label="Avg ticket"
              value={currency(todayData.avg_ticket, currentCurrency)}
              tone="soft"
            />
            <StatBox
              icon={Users}
              label="Unique customers today"
              value={toNumber(todayData.unique_customers)}
              tone="soft"
            />
            <StatBox
              icon={Store}
              label="Active registers"
              value={toNumber(stats.active_registers)}
              tone="gold"
            />
          </div>
        </article>
      </div>

      {/* ── Cashier + Register performance ─────────────────────────── */}
      <div className="mg-grid mg-grid--2">
        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Cashier performance</h3>
              <p>Sales accountability by staff member this month</p>
            </div>
            <HeaderPill tone="info">Ranked</HeaderPill>
          </div>

          {sectionLoading.summary ? (
            <SectionSkeleton height={220} />
          ) : (
            <div className="mg-list">
              {cashierPerformance.length ? (
                cashierPerformance.map((cashier, index) => (
                  <div key={`${cashier.name}-${index}`} className="mg-list__row">
                    <div className="mg-list__left">
                      <span className="mg-rank">#{index + 1}</span>
                      <div>
                        <strong>{cashier.name}</strong>
                        <p>{toNumber(cashier.orders)} processed orders</p>
                      </div>
                    </div>
                    <div className="mg-list__right">
                      <strong>{currency(cashier.revenue, currentCurrency)}</strong>
                      <small>Sales value</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="mg-empty">No cashier activity yet.</div>
              )}
            </div>
          )}
        </article>

        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Register / till activity</h3>
              <p>Cash registers active today</p>
            </div>
            <HeaderPill tone="accent">Today</HeaderPill>
          </div>

          {sectionLoading.summary ? (
            <SectionSkeleton height={220} />
          ) : (
            <div className="mg-list">
              {registerPerformance.length ? (
                registerPerformance.map((reg, index) => (
                  <div key={`${reg.name}-${index}`} className="mg-list__row">
                    <div className="mg-list__left">
                      <div className="mg-icon-badge">
                        <Store size={16} />
                      </div>
                      <div>
                        <strong>{reg.name}</strong>
                        <p>{toNumber(reg.orders)} orders today</p>
                      </div>
                    </div>
                    <div className="mg-list__right">
                      <strong>{currency(reg.collected, currentCurrency)}</strong>
                      <small>Collected</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="mg-empty">No register activity today.</div>
              )}
            </div>
          )}
        </article>
      </div>

      {/* ── Recent + Pending ───────────────────────────────────────── */}
      <div className="mg-grid mg-grid--2">
        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Recent billing activity</h3>
              <p>Latest receipts and invoices in this store</p>
            </div>
            <HeaderPill tone="info">Recent</HeaderPill>
          </div>

          {sectionLoading.activity ? (
            <SectionSkeleton height={240} />
          ) : (
            <div className="mg-list">
              {recent.length ? (
                recent.map((billing) => (
                  <div key={billing.billing_id} className="mg-list__row">
                    <div className="mg-list__left">
                      <div className="mg-icon-badge">
                        <Receipt size={16} />
                      </div>
                      <div>
                        <strong>{billing.invnumber}</strong>
                        <p>
                          {billing.customer_name} · {billing.status}
                        </p>
                      </div>
                    </div>
                    <div className="mg-list__right">
                      <strong>{currency(billing.total, currentCurrency)}</strong>
                      <small>{formatDateTime(billing.billing_date)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="mg-empty">No billing activity yet.</div>
              )}
            </div>
          )}
        </article>

        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Pending orders / drafts</h3>
              <p>Receipts, parked invoices or quotes needing attention</p>
            </div>
            <HeaderPill tone="warning">Action</HeaderPill>
          </div>

          {sectionLoading.activity ? (
            <SectionSkeleton height={240} />
          ) : (
            <div className="mg-list">
              {pendingOrders.length ? (
                pendingOrders.map((billing) => (
                  <div key={billing.billing_id} className="mg-list__row">
                    <div className="mg-list__left">
                      <div className="mg-icon-badge">
                        <CreditCard size={16} />
                      </div>
                      <div>
                        <strong>{billing.invnumber}</strong>
                        <p>
                          {billing.customer_name} · {billing.status}
                        </p>
                      </div>
                    </div>
                    <div className="mg-list__right">
                      <strong>{currency(billing.total, currentCurrency)}</strong>
                      <small>{formatDateTime(billing.billing_date)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="mg-empty">No pending drafts or parked invoices.</div>
              )}
            </div>
          )}
        </article>
      </div>

      {/* ── Inventory + Low stock ──────────────────────────────────── */}
      <div className="mg-grid mg-grid--2">
        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Inventory health</h3>
              <p>Healthy stock vs items at or below reorder level</p>
            </div>
            <HeaderPill tone="warning">Inventory</HeaderPill>
          </div>

          <div className="mg-inventory">
            <DonutChart
              value={stats.healthy_stock_count}
              total={stats.total_inventory_rows}
              label="Healthy"
              sublabel={`${toNumber(stats.healthy_stock_count)} healthy · ${toNumber(
                stats.low_stock_count
              )} low · ${toNumber(stats.out_of_stock_count)} out of stock`}
            />

            <div className="mg-legend">
              <div className="mg-legend__item">
                <span className="mg-dot mg-dot--success" />
                <div>
                  <strong>Healthy items</strong>
                  <p>{toNumber(stats.healthy_stock_count)} items above reorder level</p>
                </div>
              </div>

              <div className="mg-legend__item">
                <span className="mg-dot mg-dot--warning" />
                <div>
                  <strong>Low stock</strong>
                  <p>{toNumber(stats.low_stock_count)} items need replenishment</p>
                </div>
              </div>

              <div className="mg-legend__item">
                <span className="mg-dot mg-dot--danger" />
                <div>
                  <strong>Out of stock</strong>
                  <p>{toNumber(stats.out_of_stock_count)} items unavailable</p>
                </div>
              </div>

              <div className="mg-legend__item">
                <span className="mg-dot mg-dot--neutral" />
                <div>
                  <strong>Stock value</strong>
                  <p>
                    {currency(stats.total_inventory_value, currentCurrency)} ·{' '}
                    {toNumber(stats.total_inventory_units)} units
                  </p>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Low stock alerts</h3>
              <p>Products that have reached or fallen below reorder level</p>
            </div>
            <HeaderPill tone="danger">Replenish</HeaderPill>
          </div>

          {sectionLoading.activity ? (
            <SectionSkeleton height={240} />
          ) : (
            <div className="mg-list">
              {lowStockRows.length ? (
                lowStockRows.map((row) => {
                  const qty = toNumber(row.quantity);
                  const reorder = toNumber(row.reorder_level);
                  const isOut = qty <= 0;

                  return (
                    <div
                      key={row.inventory_id || `${row.product_id}-${row.store_id}`}
                      className="mg-list__row"
                    >
                      <div className="mg-list__left">
                        <div className={`mg-dot ${isOut ? 'mg-dot--danger' : 'mg-dot--warning'}`} />
                        <div>
                          <strong>{row.product_name}</strong>
                          <p>Minimum threshold {reorder}</p>
                        </div>
                      </div>
                      <div className="mg-list__right">
                        <strong>{qty} units</strong>
                        <small className={isOut ? 'mg-text-danger' : ''}>
                          {isOut
                            ? 'Out of stock'
                            : `${Math.max(reorder - qty, 0)} below target`}
                        </small>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="mg-empty">No low stock items right now.</div>
              )}
            </div>
          )}
        </article>
      </div>

      {/* ── Loyalty + totals ────────────────────────────────────────── */}
      <div className="mg-card">
        <div className="mg-card__header">
          <div>
            <h3>Loyalty &amp; customer activity</h3>
            <p>Daily customer movement and points activity</p>
          </div>
          <HeaderPill tone="info">Loyalty</HeaderPill>
        </div>

        <div className="mg-stat-grid">
          <StatBox
            icon={Users}
            label="New customers today"
            value={toNumber(loyalty.new_customers_today)}
            tone="soft"
          />
          <StatBox
            icon={TrendingUp}
            label="Points issued today"
            value={toNumber(loyalty.issued_today)}
            tone="gold"
          />
          <StatBox
            icon={Gauge}
            label="Points redeemed today"
            value={toNumber(loyalty.redeemed_today)}
            tone="soft"
          />
          <StatBox
            icon={BarChart3}
            label="Active staff"
            value={toNumber(stats.active_staff)}
            tone="gold"
          />
        </div>
      </div>
    </section>
  );
}
