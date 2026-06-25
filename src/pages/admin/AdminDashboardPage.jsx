import { memo, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Building2,
  CreditCard,
  Gauge,
  Layers3,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useSuperAdminDashboard } from '../../hooks/useSuperAdminDashboard';
import { currency } from '../../utils/helpers';
import '../../styles/super-admin-dashboard.css';

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

const formatRelativeTime = (value) => {
  if (!value) return 'Just now';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';

  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffDay) >= 1) return rtf.format(diffDay, 'day');
  if (Math.abs(diffHr) >= 1) return rtf.format(diffHr, 'hour');
  if (Math.abs(diffMin) >= 1) return rtf.format(diffMin, 'minute');
  return rtf.format(diffSec, 'second');
};

const levelTone = (level) => {
  const safe = String(level || '').toLowerCase();

  if (['critical', 'danger', 'high', 'failed', 'error'].includes(safe)) return 'danger';
  if (['warning', 'warn', 'medium'].includes(safe)) return 'warning';
  if (['success', 'ok', 'healthy', 'resolved'].includes(safe)) return 'success';
  return 'neutral';
};

const formatCompact = (value) => {
  const n = toNumber(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

/* =====================================================================
   PRESENTATIONAL COMPONENTS
   ===================================================================== */
const HeaderPill = memo(function HeaderPill({ children, tone = 'info' }) {
  return <span className={`sa-pill sa-pill--${tone}`}>{children}</span>;
});

const SectionSkeleton = memo(function SectionSkeleton({ height = 220 }) {
  return (
    <div className="sa-skeleton-block" style={{ minHeight: height }}>
      <div className="sa-skeleton sa-skeleton--lg" />
      <div className="sa-skeleton sa-skeleton--md" />
      <div className="sa-skeleton sa-skeleton--sm" />
      <div className="sa-skeleton sa-skeleton--sm" />
    </div>
  );
});

const MetricCard = memo(function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
  tone = 'blue',
  trend,
}) {
  return (
    <article className={`sa-metric sa-metric--${tone}`}>
      <div className="sa-metric__top">
        <div>
          <p className="sa-metric__label">{label}</p>
          <h3 className="sa-metric__value">{value}</h3>
        </div>

        <div className="sa-icon-badge">
          <Icon size={18} />
        </div>
      </div>

      <div className="sa-metric__bottom">
        <span>{caption}</span>
        {trend ? (
          <small className={`sa-trend sa-trend--${trend.direction}`}>
            {trend.direction === 'up' ? <ArrowUpRight size={14} /> : null}
            {trend.direction === 'down' ? <ArrowDownRight size={14} /> : null}
            {trend.label}
          </small>
        ) : null}
      </div>
    </article>
  );
});

const PulseTile = memo(function PulseTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  trendDirection = 'neutral',
}) {
  return (
    <div className="sa-pulse">
      <div className={`sa-pulse__icon sa-pulse__icon--${tone}`}>
        <Icon size={18} />
      </div>

      <div className="sa-pulse__copy">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>

      <small className={`sa-trend sa-trend--${trendDirection}`}>{hint}</small>
    </div>
  );
});

const HealthTile = memo(function HealthTile({ icon: Icon, label, value, caption, tone = 'soft' }) {
  return (
    <div className={`sa-health sa-health--${tone}`}>
      <div className="sa-health__top">
        <div className="sa-icon-badge">
          <Icon size={16} />
        </div>
        <strong>{label}</strong>
      </div>
      <h4>{value}</h4>
      <p>{caption}</p>
    </div>
  );
});

const SimpleLineChart = memo(function SimpleLineChart({ series, lines, currencyCode }) {
  const width = 600;
  const height = 240;
  const padding = { top: 24, right: 24, bottom: 40, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const safeSeries = Array.isArray(series) ? series : [];

  const maxValue = Math.max(
    ...safeSeries.flatMap((item) => lines.map((line) => toNumber(item[line.key]))),
    1
  );

  const getX = (index) =>
    padding.left +
    (safeSeries.length <= 1
      ? innerWidth / 2
      : (index * innerWidth) / (safeSeries.length - 1));

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
    safeSeries
      .map((item, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(item[key])}`)
      .join(' ');

  return (
    <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="sa-chart-legend">
        {lines.map((line) => (
          <span key={line.key} className="sa-chart-legend__item">
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
            border: '1px solid var(--sa-border)',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,251,254,0.92))',
          }}
          role="img"
          aria-label="Revenue trend chart"
        >
          {gridLines.map((line) => (
            <g key={line.y}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={line.y}
                y2={line.y}
                className="sa-chart-grid"
              />
              <text
                x={padding.left - 8}
                y={line.y + 4}
                textAnchor="end"
                className="sa-chart-axis"
              >
                {line.label}
              </text>
            </g>
          ))}

          {safeSeries.map((item, i) => (
            <text
              key={item.key || `${item.label}-${i}`}
              x={getX(i)}
              y={height - 8}
              textAnchor="middle"
              className="sa-chart-axis"
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
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {lines.map((line) =>
            safeSeries.map((item, i) => (
              <circle
                key={`${line.key}-${item.key || i}`}
                cx={getX(i)}
                cy={getY(item[line.key])}
                r="4"
                fill={line.color}
                stroke="#fff"
                strokeWidth="2"
              />
            ))
          )}
        </svg>
      </div>

      <div className="sa-chart-summary">
        <div>
          <span>Collected</span>
          <strong>
            {currency(
              safeSeries.reduce((sum, item) => sum + toNumber(item.collected), 0),
              currencyCode
            )}
          </strong>
        </div>
        <div>
          <span>Billed</span>
          <strong>
            {currency(
              safeSeries.reduce((sum, item) => sum + toNumber(item.billed), 0),
              currencyCode
            )}
          </strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>
            {currency(
              safeSeries.reduce((sum, item) => sum + toNumber(item.outstanding), 0),
              currencyCode
            )}
          </strong>
        </div>
      </div>
    </div>
  );
});

const MiniBars = memo(function MiniBars({ series, currencyCode }) {
  const safeSeries = Array.isArray(series) ? series : [];
  const max = Math.max(...safeSeries.map((item) => toNumber(item.amount ?? item.collected)), 1);

  return (
    <div className="sa-mini-bars">
      {safeSeries.map((item, index) => {
        const amount = toNumber(item.amount ?? item.collected);

        return (
          <div key={item.key || index} className="sa-mini-bars__col">
            <span className="sa-mini-bars__value">{currency(amount, currencyCode)}</span>
            <div className="sa-mini-bars__track">
              <div
                className="sa-mini-bars__fill"
                style={{
                  height: `${Math.max((amount / max) * 100, amount ? 12 : 4)}%`,
                }}
              />
            </div>
            <strong>{item.label_short || item.label}</strong>
          </div>
        );
      })}
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
    <div className="sa-donut">
      <div className="sa-donut__visual">
        <svg viewBox="0 0 140 140" className="sa-donut__svg">
          <circle cx="70" cy="70" r={radius} className="sa-donut__track" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="sa-donut__progress"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        </svg>

        <div className="sa-donut__center">
          <strong>{formatPercent(ratio * 100)}</strong>
          <span>{label}</span>
        </div>
      </div>

      <p>{sublabel}</p>
    </div>
  );
});

const TierDistribution = memo(function TierDistribution({ items, currencyCode }) {
  const safeItems = Array.isArray(items) ? items : [];
  const max = Math.max(...safeItems.map((item) => toNumber(item.count)), 1);
  const total = safeItems.reduce((sum, item) => sum + toNumber(item.count), 0);

  if (!safeItems.length) {
    return <div className="sa-empty">No subscription tier data yet.</div>;
  }

  return (
    <div className="sa-distribution">
      {safeItems.map((item, index) => {
        const count = toNumber(item.count);
        const width = `${(count / max) * 100}%`;
        const share = total ? (count / total) * 100 : 0;

        return (
          <div className="sa-distribution__row" key={`${item.tier}-${index}`}>
            <div className="sa-distribution__meta">
              <div>
                <strong>{item.tier}</strong>
                <span>{count} tenants</span>
              </div>

              <div className="sa-distribution__stats">
                <strong>{formatPercent(share)}</strong>
                {item.mrr != null ? <span>{currency(item.mrr, currencyCode)} MRR</span> : null}
              </div>
            </div>

            <div className="sa-distribution__track">
              <div className="sa-distribution__fill" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
});

const JobsList = memo(function JobsList({ jobs }) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];

  if (!safeJobs.length) {
    return <div className="sa-empty">No background job activity returned.</div>;
  }

  return (
    <div className="sa-list">
      {safeJobs.map((job, index) => {
        const tone =
          toNumber(job.failed) > 0 ? 'danger' : toNumber(job.pending) > 0 ? 'warning' : 'success';

        return (
          <div key={job.name || index} className="sa-list__row">
            <div className="sa-list__left">
              <div className={`sa-dot sa-dot--${tone}`} />
              <div>
                <strong>{job.name || 'Unnamed job'}</strong>
                <p>
                  {toNumber(job.running)} running · {toNumber(job.pending)} pending ·{' '}
                  {toNumber(job.failed)} failed
                </p>
              </div>
            </div>

            <div className="sa-list__right">
              <HeaderPill tone={tone}>{job.status || 'Tracked'}</HeaderPill>
              <small>{formatRelativeTime(job.last_run_at)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const AuditFeed = memo(function AuditFeed({ events, meta, onPageChange, currentPage }) {
  const safeEvents = Array.isArray(events) ? events : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {!safeEvents.length ? (
        <div className="sa-empty" style={{ margin: 18 }}>No recent audit events.</div>
      ) : (
        <div className="sa-timeline">
          {safeEvents.map((event, index) => {
            const tone = levelTone(event.level);
            return (
              <div key={event.id || index} className="sa-timeline__item">
                <div className={`sa-timeline__badge sa-timeline__badge--${tone}`}>
                  <ShieldAlert size={14} />
                </div>
                <div className="sa-timeline__content">
                  <div className="sa-timeline__top">
                    <strong>{event.message || event.action || 'Audit event'}</strong>
                    <HeaderPill tone={tone}>{event.level || 'info'}</HeaderPill>
                  </div>
                  <p>
                    {event.tenant_name ? `${event.tenant_name} · ` : ''}
                    {event.actor_name || event.actor || 'System'}
                  </p>
                  <small>{formatRelativeTime(event.created_at || event.timestamp)}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {meta && meta.last_page > 1 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            borderTop: '1px solid var(--sa-border)',
          }}
        >
          <span style={{ fontSize: '0.82rem', color: 'var(--sa-text-soft)' }}>
            {meta.from && meta.to
              ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
              : `${safeEvents.length} events`}
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= meta.last_page}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

/* =====================================================================
   MAIN PAGE
   ===================================================================== */
export default function SuperAdminDashboardPage() {
  const outletContext = useOutletContext() || {};
  const selectedStore = outletContext.selectedStore || outletContext.activeStore || null;

  const selectedStoreId = selectedStore?.id || selectedStore?.store_id || null;
  const selectedStoreName =
    selectedStore?.name || selectedStore?.store_name || selectedStore?.title || null;

  const {
    data,
    loading,
    refreshing,
    error,
    sectionLoading,
    refresh,
    securityPage,
    changeSecurityPage,
    isScopedToStore,
  } = useSuperAdminDashboard({
    selectedStoreId,
  });

  const currentCurrency = data.currency;
  const summary = data.summary || {};
  const trends = data.trends || {};
  const operations = data.operations || {};
  const subscriptions = data.subscriptions || {};
  const security = data.security || {};

  const platform = summary.platform || {};
  const todayData = summary.today || {};
  const stats = summary.stats || {};
  const inventory = summary.inventory || {};
  const storePerformance = summary.store_performance || [];
  const last7Days = trends.last_7_days || [];
  const systemHealth = operations.system_health || {};
  const backgroundJobs = operations.background_jobs || [];
  const subscriptionDistribution = subscriptions.subscription_distribution || [];
  const auditEvents = security.audit_events || [];
  const auditMeta = security.meta || null;

  const signupTrend = useMemo(() => {
    return calcDelta(platform.new_tenants_30, platform.prev_tenants_30);
  }, [platform.new_tenants_30, platform.prev_tenants_30]);

  const scopeText = useMemo(() => {
    return isScopedToStore && selectedStoreName
      ? `Store · ${selectedStoreName}`
      : 'All stores';
  }, [isScopedToStore, selectedStoreName]);

  const hasPrimaryData = useMemo(() => {
    return (
      Object.keys(platform).length > 0 ||
      Object.keys(todayData).length > 0 ||
      Object.keys(stats).length > 0
    );
  }, [platform, todayData, stats]);

  const healthHeadline = useMemo(() => {
    const latency = toNumber(systemHealth.api_latency_ms);
    const errors = toNumber(systemHealth.api_error_rate);

    if (errors >= 5 || latency >= 1200) return 'Needs attention';
    if (errors >= 2 || latency >= 700) return 'Watch closely';
    return 'Healthy';
  }, [systemHealth.api_latency_ms, systemHealth.api_error_rate]);

  const healthTone = useMemo(() => {
    if (healthHeadline === 'Healthy') return 'success';
    if (healthHeadline === 'Watch closely') return 'warning';
    return 'danger';
  }, [healthHeadline]);

  const trendLines = useMemo(
    () => [
      { key: 'collected', label: 'Collected', color: '#18a36a' },
      { key: 'billed', label: 'Billed', color: '#0e84c3' },
      { key: 'outstanding', label: 'Outstanding', color: '#f08c4a' },
      { key: 'refunds', label: 'Refunds', color: '#d6336c' },
    ],
    []
  );

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleSecurityPageChange = useCallback(
    (page) => {
      void changeSecurityPage(page);
    },
    [changeSecurityPage]
  );
  return (
    <section className="sa-page">
      <header className="sa-hero">
          <button
            className="sa-refresh-btn"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>

      </header>

      {error ? (
        <div className="sa-banner sa-banner--warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Using last available dashboard data</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <div className="sa-metric-grid">
        <MetricCard
          icon={Wallet}
          label="Monthly recurring revenue"
          value={currency(platform.mrr, currentCurrency)}
          caption={`${toNumber(platform.active_tenants)} active paying tenants`}
          tone="gold"
        />

        <MetricCard
          icon={Building2}
          label="Active tenants"
          value={toNumber(platform.active_tenants)}
          caption={`${toNumber(platform.total_tenants)} total tenant accounts`}
          tone="blue"
        />

        <MetricCard
          icon={UserPlus}
          label="Tenant sign-up rate"
          value={formatPercent(platform.signup_rate)}
          caption={`${toNumber(platform.new_tenants_30)} new tenants in the last 30 days`}
          tone="teal"
          trend={signupTrend}
        />

        <MetricCard
          icon={AlertTriangle}
          label="Churn rate"
          value={formatPercent(platform.churn_rate)}
          caption={`${toNumber(platform.churned_tenants_30)} tenant cancellations in the last 30 days`}
          tone="danger"
        />
      </div>

      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Today&apos;s platform pulse</h3>
              <p>Quick operational snapshot across the current scope</p>
            </div>
            <HeaderPill tone="info">Today</HeaderPill>
          </div>

          {sectionLoading.summary ? (
            <SectionSkeleton height={220} />
          ) : (
            <div className="sa-pulse-grid">
              <PulseTile
                icon={Wallet}
                label="Collected"
                value={currency(todayData.collected, currentCurrency)}
                hint={`${toNumber(todayData.orders)} orders today`}
                tone="green"
                trendDirection={toNumber(todayData.collected) > 0 ? 'up' : 'neutral'}
              />

              <PulseTile
                icon={CreditCard}
                label="Refunds"
                value={currency(todayData.refund_value, currentCurrency)}
                hint={`${toNumber(todayData.refund_count)} refund rows`}
                tone="yellow"
                trendDirection={toNumber(todayData.refund_count) > 0 ? 'down' : 'neutral'}
              />

              <PulseTile
                icon={AlertTriangle}
                label="Voids / drafts"
                value={toNumber(todayData.voids)}
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
                label="New staff today"
                value={toNumber(todayData.new_tenants)}
                hint={`${toNumber(stats.staff)} total staff`}
                tone="blue"
                trendDirection={toNumber(todayData.new_tenants) > 0 ? 'up' : 'neutral'}
              />

              <PulseTile
                icon={Building2}
                label="Active stores"
                value={toNumber(platform.active_tenants)}
                hint={`${toNumber(platform.total_tenants)} total stores`}
                tone="green"
                trendDirection="up"
              />
            </div>
          )}
        </article>

        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Revenue & billing trend</h3>
              <p>Collections, billing, refunds, and outstanding balances</p>
            </div>
            <HeaderPill tone="info">Last 7 days</HeaderPill>
          </div>

          {sectionLoading.trends ? (
            <SectionSkeleton height={300} />
          ) : (
            <SimpleLineChart
              series={last7Days}
              currencyCode={currentCurrency}
              lines={trendLines}
            />
          )}
        </article>
      </div>

      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>System health & infrastructure status</h3>
              <p>API health, webhooks, incidents, and queue visibility</p>
            </div>
            <HeaderPill tone={healthTone}>{healthHeadline}</HeaderPill>
          </div>

          {sectionLoading.operations ? (
            <SectionSkeleton height={280} />
          ) : (
            <div className="sa-stack">
              <div className="sa-health-grid">
                <HealthTile
                  icon={Gauge}
                  label="API latency"
                  value={`${toNumber(systemHealth.api_latency_ms)} ms`}
                  caption="Platform-wide request latency"
                  tone="soft"
                />
                <HealthTile
                  icon={AlertTriangle}
                  label="API error rate"
                  value={formatPercent(systemHealth.api_error_rate)}
                  caption="Failed responses across the platform"
                  tone="gold"
                />
                <HealthTile
                  icon={BellRing}
                  label="Webhook success"
                  value={formatPercent(systemHealth.webhook_success_rate)}
                  caption="Successful webhook deliveries"
                  tone="soft"
                />
                <HealthTile
                  icon={ServerCog}
                  label="Active incidents"
                  value={toNumber(systemHealth.incident_count)}
                  caption="Open infrastructure alerts"
                  tone="brown"
                />
              </div>

              <div className="sa-subsection">
                <div className="sa-subsection__title">
                  <Layers3 size={16} />
                  <strong>Background jobs</strong>
                </div>

                <JobsList jobs={backgroundJobs} />
              </div>
            </div>
          )}
        </article>

        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Tenant subscription tier distribution</h3>
              <p>Understand which plans are driving business value</p>
            </div>
            <HeaderPill tone="accent">Monetization</HeaderPill>
          </div>

          {sectionLoading.subscriptions ? (
            <SectionSkeleton height={280} />
          ) : (
            <div className="sa-stack">
              <TierDistribution items={subscriptionDistribution} currencyCode={currentCurrency} />

              <div className="sa-summary-tiles">
                <div className="sa-summary-tiles__item">
                  <span>Total tiers</span>
                  <strong>{subscriptionDistribution.length}</strong>
                </div>

                <div className="sa-summary-tiles__item">
                  <span>Total subscribed tenants</span>
                  <strong>
                    {subscriptionDistribution.reduce((sum, item) => sum + toNumber(item.count), 0)}
                  </strong>
                </div>

                <div className="sa-summary-tiles__item">
                  <span>Top plan</span>
                  <strong>{subscriptionDistribution[0]?.tier || '—'}</strong>
                </div>
              </div>
            </div>
          )}
        </article>
      </div>

      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Immediate security & audit events</h3>
              <p>Recent administrative actions, failed logins, and abuse signals</p>
            </div>
            <HeaderPill tone="danger">Security</HeaderPill>
          </div>

          {sectionLoading.security ? (
            <SectionSkeleton height={280} />
          ) : (
            <AuditFeed
              events={auditEvents}
              meta={auditMeta}
              currentPage={securityPage}
              onPageChange={handleSecurityPageChange}
            />
          )}
        </article>

        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Top rank tenants</h3>
              <p>Highest performing stores by paid collections</p>
            </div>
            <HeaderPill tone="info">Ranked</HeaderPill>
          </div>

          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Tier</th>
                  <th>Orders</th>
                  <th>Value</th>
                </tr>
              </thead>

              <tbody>
                {storePerformance.length ? (
                  storePerformance.map((store, index) => (
                    <tr key={store.store_id || index}>
                      <td>
                        <strong>
                          {index + 1} · {store.store_name}
                        </strong>
                        <span>{store.location}</span>
                      </td>
                      <td>{store.tier}</td>
                      <td>{toNumber(store.orders)}</td>
                      <td>{currency(store.revenue, currentCurrency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="sa-empty-cell">
                      No tenant activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Commercial stats</h3>
              <p>High-level performance indicators</p>
            </div>
            <HeaderPill tone="info">Overview</HeaderPill>
          </div>

          <div className="sa-stat-grid">
            <div className="sa-stat-box">
              <div className="sa-icon-badge">
                <Gauge size={16} />
              </div>
              <div>
                <strong>{formatPercent(inventory.health_pct)}</strong>
                <span>Inventory health</span>
              </div>
            </div>

            <div className="sa-stat-box">
              <div className="sa-icon-badge">
                <Wallet size={16} />
              </div>
              <div>
                <strong>{currency(stats.projected_monthly, currentCurrency)}</strong>
                <span>Projected monthly collections</span>
              </div>
            </div>

            <div className="sa-stat-box">
              <div className="sa-icon-badge">
                <BarChart3 size={16} />
              </div>
              <div>
                <strong>{formatPercent(stats.collection_rate)}</strong>
                <span>Collection rate</span>
              </div>
            </div>

            <div className="sa-stat-box">
              <div className="sa-icon-badge">
                <CreditCard size={16} />
              </div>
              <div>
                <strong>{currency(stats.average_ticket, currentCurrency)}</strong>
                <span>Average ticket amount</span>
              </div>
            </div>

            <div className="sa-stat-box sa-stat-box--wide">
              <div className="sa-icon-badge">
                <Building2 size={16} />
              </div>
              <div>
                <strong>{toNumber(stats.avg_orders_per_tenant).toFixed(1)}</strong>
                <span>
                  Avg orders per tenant · {toNumber(stats.avg_customers_per_tenant).toFixed(1)} customers per tenant
                </span>
              </div>
            </div>
          </div>
        </article>

        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Inventory stats</h3>
              <p>Healthy stock vs items at or below reorder level</p>
            </div>
            <HeaderPill tone="warning">Inventory</HeaderPill>
          </div>

          <div className="sa-inventory">
            <DonutChart
              value={inventory.healthy_count}
              total={inventory.total_rows}
              label="Healthy"
              sublabel={`${toNumber(inventory.healthy_count)} healthy rows · ${toNumber(
                inventory.low_stock_count
              )} low stock rows`}
            />

            <div className="sa-legend">
              <div className="sa-legend__item">
                <span className="sa-dot sa-dot--success" />
                <div>
                  <strong>Healthy inventory</strong>
                  <p>{toNumber(inventory.healthy_count)} rows above reorder level</p>
                </div>
              </div>

              <div className="sa-legend__item">
                <span className="sa-dot sa-dot--warning" />
                <div>
                  <strong>Low stock</strong>
                  <p>{toNumber(inventory.low_stock_count)} rows need replenishment</p>
                </div>
              </div>

              <div className="sa-legend__item">
                <span className="sa-dot sa-dot--neutral" />
                <div>
                  <strong>Total tracked rows</strong>
                  <p>{toNumber(inventory.total_rows)} inventory records across stores</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Sale stats</h3>
              <p>Daily paid collections across the last 7 days</p>
            </div>
            <HeaderPill tone="info">Last 7 days</HeaderPill>
          </div>

          {sectionLoading.trends ? (
            <SectionSkeleton height={220} />
          ) : (
            <div className="sa-card__body">
              <MiniBars series={last7Days} currencyCode={currentCurrency} />
            </div>
          )}
        </article>

        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Useful alerts</h3>
              <p>Extra items worth monitoring across the platform</p>
            </div>
            <HeaderPill tone="warning">Actionable</HeaderPill>
          </div>

          <div className="sa-list">
            <div className="sa-list__row">
              <div className="sa-list__left">
                <div className="sa-dot sa-dot--warning" />
                <div>
                  <strong>Open balances</strong>
                  <p>Billings with unpaid balances across stores</p>
                </div>
              </div>
              <div className="sa-list__right">
                <strong>{toNumber(stats.open_balances_count)}</strong>
                <small>{currency(stats.outstanding_total, currentCurrency)}</small>
              </div>
            </div>

            <div className="sa-list__row">
              <div className="sa-list__left">
                <div className="sa-dot sa-dot--danger" />
                <div>
                  <strong>Low stock watch</strong>
                  <p>Inventory rows at or below reorder level</p>
                </div>
              </div>
              <div className="sa-list__right">
                <strong>{toNumber(inventory.low_stock_count)}</strong>
                <small>Needs replenishment</small>
              </div>
            </div>

            <div className="sa-list__row">
              <div className="sa-list__left">
                <div className="sa-dot sa-dot--success" />
                <div>
                  <strong>Average revenue per tenant</strong>
                  <p>Paid collections divided by active tenants</p>
                </div>
              </div>
              <div className="sa-list__right">
                <strong>{currency(stats.avg_revenue_per_tenant, currentCurrency)}</strong>
                <small>Per active tenant</small>
              </div>
            </div>

            <div className="sa-list__row">
              <div className="sa-list__left">
                <div className="sa-dot sa-dot--neutral" />
                <div>
                  <strong>Gross billed vs collected</strong>
                  <p>Total invoiced compared with paid collections</p>
                </div>
              </div>
              <div className="sa-list__right">
                <strong>{currency(stats.gross_billed, currentCurrency)}</strong>
                <small>{currency(stats.paid_collections, currentCurrency)} collected</small>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="sa-card">
        <div className="sa-card__header">
          <div>
            <h3>Platform totals</h3>
            <p>Operational counts returned directly by the active summary scope</p>
          </div>
          <HeaderPill tone="info">Counts</HeaderPill>
        </div>

        <div className="sa-health-grid">
          <HealthTile
            icon={Activity}
            label="Products"
            value={toNumber(stats.products)}
            caption="Tracked products across visible stores"
            tone="soft"
          />
          <HealthTile
            icon={UserPlus}
            label="Customers"
            value={toNumber(stats.customers)}
            caption="Registered customers"
            tone="gold"
          />
          <HealthTile
            icon={Building2}
            label="Staff"
            value={toNumber(stats.staff)}
            caption="Non-admin users across allowed stores"
            tone="brown"
          />
          <HealthTile
            icon={BarChart3}
            label="Orders"
            value={toNumber(stats.total_orders)}
            caption="All non-draft billing rows"
            tone="soft"
          />
        </div>
      </div>
    </section>
  );
}
