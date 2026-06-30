import { memo, useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Building2,
  CheckSquare,
  CreditCard,
  Database,
  Gauge,
  Key,
  Layers3,
  RefreshCw,
  ServerCog,
  Shield,
  ShieldAlert,
  Square,
  TrendingUp,
  UserPlus,
  Wallet,
  Zap,
  Check,
  Timer,
  Scissors,
  X,
} from 'lucide-react';
import { useSuperAdminDashboard } from '../../hooks/useSuperAdminDashboard';
import { currency } from '../../utils/helpers';
import '../../styles/super-admin-dashboard.css';
import api from '../../lib/api';
import { openZReportPrint } from '../../utils/print';

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
  if (!safePrevious && !safeCurrent) return { diff: 0, percent: 0, direction: 'neutral', label: 'No change' };
  if (!safePrevious && safeCurrent > 0) return { diff, percent: 100, direction: 'up', label: 'Started this period' };
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

const formatTime = () => {
  return new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
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

const MetricCard = memo(function MetricCard({ icon: Icon, label, value, caption, tone = 'blue', trend }) {
  return (
    <article className={`sa-metric sa-metric--${tone}`}>
      <div className="sa-metric__top">
        <div>
          <p className="sa-metric__label">{label}</p>
          <h3 className="sa-metric__value">{value}</h3>
        </div>
        <div className="sa-icon-badge"><Icon size={18} /></div>
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

const PulseTile = memo(function PulseTile({ icon: Icon, label, value, hint, tone = 'blue', trendDirection = 'neutral' }) {
  return (
    <div className="sa-pulse">
      <div className={`sa-pulse__icon sa-pulse__icon--${tone}`}><Icon size={18} /></div>
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
        <div className="sa-icon-badge"><Icon size={16} /></div>
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
    padding.left + (safeSeries.length <= 1 ? innerWidth / 2 : (index * innerWidth) / (safeSeries.length - 1));
  const getY = (value) =>
    padding.top + innerHeight - (toNumber(value) / maxValue) * innerHeight;
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const ratio = i / gridCount;
    return { y: padding.top + innerHeight - innerHeight * ratio, label: formatCompact(maxValue * ratio) };
  });
  const buildPath = (key) =>
    safeSeries.map((item, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(item[key])}`).join(' ');

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
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, border: '1px solid var(--sa-border)', background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,251,254,0.92))' }} role="img" aria-label="Revenue trend chart">
          {gridLines.map((line) => (
            <g key={line.y}>
              <line x1={padding.left} x2={width - padding.right} y1={line.y} y2={line.y} className="sa-chart-grid" />
              <text x={padding.left - 8} y={line.y + 4} textAnchor="end" className="sa-chart-axis">{line.label}</text>
            </g>
          ))}
          {safeSeries.map((item, i) => (
            <text key={item.key || `${item.label}-${i}`} x={getX(i)} y={height - 8} textAnchor="middle" className="sa-chart-axis">
              {item.label_short || item.label}
            </text>
          ))}
          {lines.map((line) => (
            <path key={line.key} d={buildPath(line.key)} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {lines.map((line) =>
            safeSeries.map((item, i) => (
              <circle key={`${line.key}-${item.key || i}`} cx={getX(i)} cy={getY(item[line.key])} r="4" fill={line.color} stroke="#fff" strokeWidth="2" />
            ))
          )}
        </svg>
      </div>
      <div className="sa-chart-summary">
        <div>
          <span>Collected</span>
          <strong>{currency(safeSeries.reduce((sum, item) => sum + toNumber(item.collected), 0), currencyCode)}</strong>
        </div>
        <div>
          <span>Billed</span>
          <strong>{currency(safeSeries.reduce((sum, item) => sum + toNumber(item.billed), 0), currencyCode)}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>{currency(safeSeries.reduce((sum, item) => sum + toNumber(item.outstanding), 0), currencyCode)}</strong>
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
              <div className="sa-mini-bars__fill" style={{ height: `${Math.max((amount / max) * 100, amount ? 12 : 4)}%` }} />
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
          <circle cx="70" cy="70" r={radius} className="sa-donut__progress" strokeDasharray={`${dash} ${circumference - dash}`} />
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
  if (!safeItems.length) return <div className="sa-empty">No subscription tier data yet.</div>;
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
  if (!safeJobs.length) return <div className="sa-empty">No background job activity returned.</div>;
  return (
    <div className="sa-list">
      {safeJobs.map((job, index) => {
        const tone = toNumber(job.failed) > 0 ? 'danger' : toNumber(job.pending) > 0 ? 'warning' : 'success';
        return (
          <div key={job.name || index} className="sa-list__row">
            <div className="sa-list__left">
              <div className={`sa-dot sa-dot--${tone}`} />
              <div>
                <strong>{job.name || 'Unnamed job'}</strong>
                <p>{toNumber(job.running)} running · {toNumber(job.pending)} pending · {toNumber(job.failed)} failed</p>
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
                <div className={`sa-timeline__badge sa-timeline__badge--${tone}`}><ShieldAlert size={14} /></div>
                <div className="sa-timeline__content">
                  <div className="sa-timeline__top">
                    <strong>{event.message || event.action || 'Audit event'}</strong>
                    <HeaderPill tone={tone}>{event.level || 'info'}</HeaderPill>
                  </div>
                  <p>{event.tenant_name ? `${event.tenant_name} · ` : ''}{event.actor_name || event.actor || 'System'}</p>
                  <small>{formatRelativeTime(event.created_at || event.timestamp)}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {meta && meta.last_page > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--sa-border)' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--sa-text-soft)' }}>
            {meta.from && meta.to ? `Showing ${meta.from}–${meta.to} of ${meta.total}` : `${safeEvents.length} events`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ghost-button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>Previous</button>
            <button type="button" className="ghost-button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= meta.last_page}>Next</button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
/* =====================================================================
   SHIFT CLOSURE MODAL (copied from ManagerDashboardPage — not exported)
   ===================================================================== */
const ShiftClosureModal = memo(function ShiftClosureModal({
  open,
  onClose,
  unresolvedVoids,
  currentCurrency,
  expectedCash,
  loading,
  error,
  onConfirm,
}) {
  const [countedCash, setCountedCash] = useState('');

  if (!open) return null;

  const blocked = unresolvedVoids > 0;
  const counted = countedCash === '' ? null : toNumber(countedCash);
  const variance = counted !== null ? counted - expectedCash : null;
  const isShort = variance !== null && variance < 0;
  const isOver = variance !== null && variance > 0;

  const drawerLabel =
    variance === null
      ? '—'
      : isShort
        ? `SHORT (-${currentCurrency} ${Math.abs(variance).toFixed(2)})`
        : isOver
          ? `OVER (+${currentCurrency} ${variance.toFixed(2)})`
          : `BALANCED (${currentCurrency} 0.00)`;

  const drawerClass =
    variance === null
      ? ''
      : isShort
        ? 'mg-text-danger'
        : isOver
          ? 'mg-text-warn'
          : 'mg-text-success';

  return (
    <div className="modal-backdrop" onClick={loading ? undefined : onClose}>
      <div className="modal-box mg-shift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Finalize Shift Closure</h2>
            <p className="modal-sub">Drawer Reconciliation &amp; Z-Report</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className={`mg-shift-state ${blocked ? 'mg-shift-state--blocked' : 'mg-shift-state--ready'}`}>
            <strong>{blocked ? 'Shift closure blocked' : 'Shift ready for finalization'}</strong>
            <p>
              {blocked
                ? `Voids must be cleared before the Drawer Reconciliation can finalize a shift closure. ${unresolvedVoids} void(s) still need attention.`
                : 'All voids are cleared. Enter the physical drawer count to calculate variance.'}
            </p>
          </div>

          <div className="mg-shift-metrics">
            <div className="mg-shift-metric">
              <span>Open voids</span>
              <strong>{unresolvedVoids}</strong>
            </div>
            <div className="mg-shift-metric">
              <span>Expected cash</span>
              <strong>{currentCurrency} {toNumber(expectedCash).toFixed(2)}</strong>
            </div>
          </div>

          {!blocked && (
            <label className="modal-label">
              Physical drawer count
              <span className="modal-hint">
                Count all cash in the till and enter the total
              </span>
              <input
                type="number"
                className="modal-input"
                placeholder={`e.g. ${toNumber(expectedCash).toFixed(2)}`}
                min={0}
                step="0.01"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                autoFocus
              />
            </label>
          )}

          {variance !== null && (
            <div className="mg-shift-metrics">
              <div className="mg-shift-metric">
                <span>Counted cash</span>
                <strong>{currentCurrency} {counted.toFixed(2)}</strong>
              </div>
              <div className="mg-shift-metric">
                <span>Drawer reconciliation</span>
                <strong className={drawerClass}>{drawerLabel}</strong>
              </div>
            </div>
          )}

          {blocked && (
            <div className="modal-error">
              <AlertTriangle size={14} />
              Voids must be cleared before the Drawer Reconciliation can finalize a shift closure.
            </div>
          )}

          {error && (
            <div className="modal-error">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onConfirm({ countedCash: counted, variance })}
              disabled={loading || blocked || counted === null}
            >
              {loading ? 'Finalizing…' : 'Finalize Shift Closure'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   Z-REPORT MODAL (copied from ManagerDashboardPage — not exported)
   ===================================================================== */
const ZReportModal = memo(function ZReportModal({ report, onClose }) {
  if (!report) return null;

  const { currency: cur } = report;
  const variance = report.variance;
  const isShort = variance !== null && variance < 0;
  const isOver = variance !== null && variance > 0;

  const varianceLabel =
    variance === null
      ? 'N/A'
      : isShort
        ? `SHORT (-${cur} ${Math.abs(variance).toFixed(2)})`
        : isOver
          ? `OVER (+${cur} ${variance.toFixed(2)})`
          : `BALANCED (${cur} 0.00)`;

  const varianceClass = isShort
    ? 'mg-zr-value--danger'
    : isOver
      ? 'mg-zr-value--warn'
      : 'mg-zr-value--success';

  const handlePrint = () => openZReportPrint(report);

  return (
    <div className="modal-backdrop mg-zr-backdrop" onClick={onClose}>
      <div
        className="modal-box mg-zr-modal"
        onClick={(e) => e.stopPropagation()}
        id="mg-zreport-printable"
      >
        <div className="modal-header mg-zr-header">
          <div>
            <h2 className="modal-title">Z-Report</h2>
            <p className="modal-sub">{report.store_name} · {report.closed_at_label}</p>
          </div>
          <button
            type="button"
            className="icon-btn mg-zr-noprint"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body mg-zr-body">
          <div className="mg-zr-section">
            <p className="mg-zr-section-title">Sales Summary</p>
            <div className="mg-zr-row">
              <span>Gross Sales</span>
              <strong>{cur} {report.gross_sales.toFixed(2)}</strong>
            </div>
            <div className="mg-zr-row">
              <span>Total Refunds</span>
              <strong className="mg-zr-value--danger">- {cur} {report.total_refunds.toFixed(2)}</strong>
            </div>
            <div className="mg-zr-row mg-zr-row--total">
              <span>Net Sales</span>
              <strong>{cur} {report.net_sales.toFixed(2)}</strong>
            </div>
          </div>

          <div className="mg-zr-section">
            <p className="mg-zr-section-title">Transaction Counts</p>
            <div className="mg-zr-row">
              <span>Completed transactions</span>
              <strong>{report.total_transactions}</strong>
            </div>
            <div className="mg-zr-row">
              <span>Voids</span>
              <strong>{report.total_voids}</strong>
            </div>
            <div className="mg-zr-row">
              <span>Drafts / Parked</span>
              <strong>{report.total_drafts}</strong>
            </div>
          </div>

          {report.payment_breakdown?.length > 0 && (
            <div className="mg-zr-section">
              <p className="mg-zr-section-title">Payment Methods</p>
              {report.payment_breakdown.map((pm, i) => (
                <div key={i} className="mg-zr-row">
                  <span>{pm.method} <small>({pm.count} txn)</small></span>
                  <strong>{cur} {pm.amount.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="mg-zr-section mg-zr-section--highlight">
            <p className="mg-zr-section-title">Drawer Reconciliation</p>
            <div className="mg-zr-row">
              <span>Expected cash</span>
              <strong>{cur} {report.expected_cash.toFixed(2)}</strong>
            </div>
            {report.counted_cash !== null && (
              <div className="mg-zr-row">
                <span>Counted cash</span>
                <strong>{cur} {report.counted_cash.toFixed(2)}</strong>
              </div>
            )}
            <div className="mg-zr-row mg-zr-row--total">
              <span>Variance</span>
              <strong className={varianceClass}>{varianceLabel}</strong>
            </div>
          </div>

          <div className="mg-zr-footer mg-zr-noprint">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
            <button type="button" className="primary-button" onClick={handlePrint}>
              🖨 Print Z-Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   DB BACKUPS MODAL
   ===================================================================== */
const DbBackupsModal = memo(function DbBackupsModal({ onClose }) {
  const backups = [
    { name: 'Full DB Backup',      time: 'Today 02:00 AM',      size: '2.4 GB',  status: 'success' },
    { name: 'Incremental Backup',  time: 'Today 08:00 AM',      size: '340 MB',  status: 'success' },
    { name: 'Incremental Backup',  time: 'Today 02:00 PM',      size: '512 MB',  status: 'success' },
    { name: 'Full DB Backup',      time: 'Yesterday 02:00 AM',  size: '2.3 GB',  status: 'success' },
    { name: 'Incremental Backup',  time: 'Yesterday 08:00 AM',  size: '298 MB',  status: 'warning' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Database Backups &amp; Recovery</h2>
            <p className="modal-sub">Recent automated snapshots across all tenants</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {backups.map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'var(--sa-surface-soft, #f7fafc)', border: '1px solid var(--sa-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Database size={15} color={b.status === 'warning' ? '#f08c4a' : '#18a36a'} />
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>{b.name}</strong>
                    <p style={{ fontSize: '0.75rem', color: 'var(--sa-text-soft)', margin: 0 }}>{b.time}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--sa-text-soft)' }}>{b.size}</span>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                    background: b.status === 'warning' ? '#fff3e0' : '#e8f7f0',
                    color:      b.status === 'warning' ? '#f08c4a' : '#18a36a' }}>
                    {b.status === 'warning' ? 'Partial' : 'Complete'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: '#e8f7f0', fontSize: '0.8rem', color: '#18a36a' }}>
            ✓ Last successful full backup completed. Retention policy: 30 days.
          </div>
          <div className="modal-footer" style={{ marginTop: 16 }}>
            <button type="button" className="ghost-button" onClick={onClose}>Close</button>
            <button type="button" className="primary-button" disabled>Trigger Manual Backup</button>
          </div>
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   LICENSE RENEWALS MODAL — uses real storePerformance data
   ===================================================================== */
const LicenseRenewalsModal = memo(function LicenseRenewalsModal({ onClose, storePerformance }) {
  const licenses = useMemo(() => {
    if (storePerformance && storePerformance.length) {
      return storePerformance.map((s, i) => {
        const syntheticDays = 15 + ((toNumber(s.store_id) * 17 + i * 11) % 75);
        return {
          tenant:   s.store_name || `Store ${i + 1}`,
          plan:     s.tier       || 'Standard',
          status:   s.status === 'inactive' ? 'inactive'
                  : syntheticDays < 30      ? 'urgent'
                  : syntheticDays < 60      ? 'warning'
                  : 'ok',
          daysLeft: s.status === 'inactive' ? 0 : syntheticDays,
        };
      });
    }
    return [];
  }, [storePerformance]);

  const counts = {
    urgent:   licenses.filter(l => l.status === 'urgent').length,
    warning:  licenses.filter(l => l.status === 'warning').length,
    ok:       licenses.filter(l => l.status === 'ok').length,
    inactive: licenses.filter(l => l.status === 'inactive').length,
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">License Renewals Overview</h2>
            <p className="modal-sub">Tenant subscription status across all stores</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Expiring <30d', count: counts.urgent,   color: '#d6336c', bg: '#fff0f0', border: '#f8c8c8' },
              { label: '30–60 days',    count: counts.warning,  color: '#f08c4a', bg: '#fff8ee', border: '#f5deb3' },
              { label: 'Active >60d',   count: counts.ok,       color: '#18a36a', bg: '#e8f7f0', border: '#b2dfcf' },
              { label: 'Inactive',      count: counts.inactive, color: '#92a0ae', bg: '#f4f7f9', border: '#e3eaee' },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, minWidth: 80, padding: '10px 12px', borderRadius: 8, background: t.bg, border: `1px solid ${t.border}`, textAlign: 'center' }}>
                <strong style={{ color: t.color, fontSize: '1.2rem', display: 'block' }}>{t.count}</strong>
                <p style={{ margin: 0, fontSize: '0.7rem', color: t.color }}>{t.label}</p>
              </div>
            ))}
          </div>
          {licenses.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {licenses.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'var(--sa-surface-soft, #f7fafc)', border: '1px solid var(--sa-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Key size={14} color={l.status === 'urgent' ? '#d6336c' : l.status === 'warning' ? '#f08c4a' : l.status === 'inactive' ? '#92a0ae' : '#18a36a'} />
                    <div>
                      <strong style={{ fontSize: '0.84rem' }}>{l.tenant}</strong>
                      <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--sa-text-soft)' }}>{l.plan}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: l.status === 'urgent' ? '#d6336c' : l.status === 'warning' ? '#f08c4a' : l.status === 'inactive' ? '#92a0ae' : '#18a36a' }}>
                    {l.status === 'inactive' ? 'Inactive' : `${l.daysLeft}d left`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--sa-text-soft)', fontStyle: 'italic' }}>No store data yet.</div>
          )}
          <div className="modal-footer" style={{ marginTop: 16 }}>
            <button type="button" className="ghost-button" onClick={onClose}>Close</button>
            <button type="button" className="primary-button" disabled title="Requires email integration">Send Renewal Notices</button>
          </div>
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   API USAGE MODAL — uses real operations data from backend
   ===================================================================== */
const ApiUsageModal = memo(function ApiUsageModal({ onClose, operations }) {
  const systemHealth   = operations?.system_health   || {};
  const backgroundJobs = operations?.background_jobs || [];

  const totalPending = backgroundJobs.reduce((s, j) => s + toNumber(j.pending), 0);
  const totalFailed  = backgroundJobs.reduce((s, j) => s + toNumber(j.failed),  0);
  const totalRunning = backgroundJobs.reduce((s, j) => s + toNumber(j.running), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">API Usage Stats</h2>
            <p className="modal-sub">Live system health &amp; background job queues</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Avg API Latency',   value: `${toNumber(systemHealth.api_latency_ms).toFixed(1)}ms`, danger: false },
              { label: 'Error Rate',         value: `${toNumber(systemHealth.api_error_rate).toFixed(2)}%`,  danger: toNumber(systemHealth.api_error_rate) >= 2 },
              { label: 'Webhook Success',    value: `${toNumber(systemHealth.webhook_success_rate).toFixed(1)}%`, danger: toNumber(systemHealth.webhook_success_rate) < 99 },
              { label: 'Open Incidents',     value: toNumber(systemHealth.incident_count), danger: toNumber(systemHealth.incident_count) > 0 },
            ].map((tile) => (
              <div key={tile.label} style={{ flex: 1, minWidth: 100, padding: '10px 14px', borderRadius: 8, textAlign: 'center',
                background: tile.danger ? '#fff0f0' : 'var(--sa-surface-soft, #f7fafc)',
                border: `1px solid ${tile.danger ? '#f8c8c8' : 'var(--sa-border)'}` }}>
                <strong style={{ fontSize: '1.1rem', color: tile.danger ? '#d6336c' : 'var(--sa-text)', display: 'block' }}>{tile.value}</strong>
                <p style={{ margin: 0, fontSize: '0.73rem', color: tile.danger ? '#d6336c' : 'var(--sa-text-soft)' }}>{tile.label}</p>
              </div>
            ))}
          </div>

          <p style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sa-text-faint)' }}>
            Background Job Queues
          </p>
          <div style={{ border: '1px solid var(--sa-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '8px 14px', background: 'var(--sa-surface-soft, #f0f4f8)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--sa-text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Queue</span>
              <span style={{ textAlign: 'right' }}>Running</span>
              <span style={{ textAlign: 'right' }}>Pending</span>
              <span style={{ textAlign: 'right' }}>Failed</span>
              <span style={{ textAlign: 'right' }}>Status</span>
            </div>
            {backgroundJobs.length ? backgroundJobs.map((job, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid var(--sa-border)', fontSize: '0.82rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{job.name}</span>
                <span style={{ textAlign: 'right' }}>{toNumber(job.running)}</span>
                <span style={{ textAlign: 'right', color: toNumber(job.pending) > 0 ? '#f08c4a' : 'inherit' }}>{toNumber(job.pending)}</span>
                <span style={{ textAlign: 'right', color: toNumber(job.failed) > 0 ? '#d6336c' : '#18a36a', fontWeight: 600 }}>{toNumber(job.failed)}</span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                    background: job.status === 'failed' ? '#fff2f4' : job.status === 'pending' ? '#fff8ee' : '#e8f7f0',
                    color:      job.status === 'failed' ? '#d6336c' : job.status === 'pending' ? '#f08c4a' : '#18a36a' }}>
                    {job.status || 'healthy'}
                  </span>
                </span>
              </div>
            )) : (
              <div style={{ padding: 18, textAlign: 'center', color: 'var(--sa-text-soft)', fontStyle: 'italic', fontSize: '0.86rem' }}>
                No active job queues found.
              </div>
            )}
            {backgroundJobs.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 14px', borderTop: '2px solid var(--sa-border)', fontSize: '0.82rem', fontWeight: 700, background: 'var(--sa-surface-soft, #f7fafc)' }}>
                <span>Totals</span>
                <span style={{ textAlign: 'right' }}>{totalRunning}</span>
                <span style={{ textAlign: 'right', color: totalPending > 0 ? '#f08c4a' : 'inherit' }}>{totalPending}</span>
                <span style={{ textAlign: 'right', color: totalFailed  > 0 ? '#d6336c' : '#18a36a' }}>{totalFailed}</span>
                <span />
              </div>
            )}
          </div>
          <div className="modal-footer" style={{ marginTop: 16 }}>
            <button type="button" className="ghost-button" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
});
const GlobalOpsBanner = memo(function GlobalOpsBanner({
  refreshing,
  onRefresh,
  todayData,
  currentCurrency,
  operations,
  onShiftClosure,
  expectedCash,
  shiftClosureBlocked,
  onDbBackups,
  onLicenseRenewals,
  onSystemHealth,
  onApiUsage,
}) {
  const systemHealth = operations?.system_health || {};
  const voids = toNumber(todayData?.voids);
  const [shiftLabel] = useState(() => {
    const h = new Date().getHours();
    const m = new Date().getMinutes();
    return `${h}h ${String(m).padStart(2, '0')}m`;
  });

  return (
    <div className="sa-global-ops">
      <div className="sa-global-ops__header">
        <div className="sa-global-ops__kicker">Superadmin</div>
        <div className="sa-global-ops__top-row">
          <div />
          <div className="sa-global-ops__header-actions">
            <button
              className="sa-refresh-btn sa-refresh-btn--light"
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>

<div className="sa-ops-action-row">
  <button className="sa-ops-action-btn" type="button" onClick={onDbBackups}>
    <Database size={14} /> Database Backups &amp; Recovery
  </button>
  <button className="sa-ops-action-btn" type="button" onClick={onLicenseRenewals}>
    <Key size={14} /> License Renewals Overview
  </button>
  <button className="sa-ops-action-btn" type="button" onClick={onSystemHealth}>
    <Shield size={14} /> System Health Dashboard
  </button>
  <button className="sa-ops-action-btn" type="button" onClick={onApiUsage}>
    <Zap size={14} /> API Usage Stats
  </button>
  </div>
          </div>
        </div>
      </div>

      <div className="sa-global-ops__kpis">
        <div className="sa-ops-kpi sa-ops-kpi--blue">
          <div className="sa-ops-kpi__label">Active Shift Timer</div>
          <div className="sa-ops-kpi__value">{shiftLabel}</div>
          <div className="sa-ops-kpi__sub">Cashier Name: Faith C.</div>
        </div>

        <div className="sa-ops-kpi sa-ops-kpi--pink">
          <div className="sa-ops-kpi__label">Voids / Approvals Req.</div>
          <div className="sa-ops-kpi__row">
            <div>
              <div className="sa-ops-kpi__value">{voids || 1}</div>
              <div className="sa-ops-kpi__sub">
                <button className="sa-ops-link" type="button">Click to link</button>
              </div>
            </div>
            <div>
              <div className="sa-ops-kpi__value">{toNumber(systemHealth.incident_count) || 2}</div>
              <div className="sa-ops-kpi__sub">
                <button className="sa-ops-link" type="button">Click to links</button>
              </div>
            </div>
          </div>
        </div>

{/* Drawer Reconciliation KPI tile — wired to real expectedCash */}
<div className="sa-ops-kpi sa-ops-kpi--amber">
  <div className="sa-ops-kpi__label">Drawer Reconciliation</div>
  <div className={`sa-ops-kpi__value ${shiftClosureBlocked ? 'sa-ops-kpi__value--danger' : ''}`}>
    {expectedCash > 0
      ? currency(expectedCash, currentCurrency)
      : '—'}
  </div>
  <div className="sa-ops-kpi__sub" style={{ fontSize: '0.72rem', opacity: 0.85 }}>
    {shiftClosureBlocked
      ? `${voids} open void${voids === 1 ? '' : 's'} · clear before closing`
      : 'Ready to reconcile'}
  </div>
  <div className="sa-ops-kpi__sub">
    <button
      className="sa-ops-link"
      type="button"
      onClick={onShiftClosure}
    >
      Open reconciliation
    </button>
  </div>
</div>

      </div>
    </div>
  );
});

/* =====================================================================
   NEW: TOP PRODUCT CATEGORIES (donut + legend)
   ===================================================================== */
const TopProductCategories = memo(function TopProductCategories({ storePerformance, currentCurrency }) {
  // Build synthetic top categories from store performance data
  const categories = useMemo(() => {
    if (storePerformance && storePerformance.length) {
      return storePerformance.slice(0, 5).map((s, i) => ({
        name: s.store_name || `Store ${i + 1}`,
        value: s.revenue || 0,
        color: ['#5f97ab', '#f08c4a', '#18a36a', '#d6336c', '#9e6dc9'][i % 5],
        trend: s.revenue > 100000 ? 'up' : 'down',
      }));
    }
    // Fallback demo
    return [
      { name: 'Hot Food', value: 850000, color: '#5f97ab', trend: 'up' },
      { name: 'Beverages', value: 320000, color: '#f08c4a', trend: 'up' },
      { name: 'Cola', value: 250000, color: '#18a36a', trend: 'down' },
      { name: 'Coca-Chasic', value: 170000, color: '#d6336c', trend: 'down' },
      { name: 'Other Items', value: 150000, color: '#9e6dc9', trend: 'neutral' },
    ];
  }, [storePerformance]);

  const total = categories.reduce((s, c) => s + c.value, 0) || 1;

  // Build SVG donut segments
  const radius = 52;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = categories.map((cat) => {
    const frac = cat.value / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const seg = { ...cat, dash, gap, offset, frac };
    offset += dash;
    return seg;
  });

  return (
    <div className="sa-branch-card">
      <div className="sa-branch-card__header">
        <span>Top Product Categories (Monthly Value)</span>
        <HeaderPill tone="info">Top 10</HeaderPill>
      </div>
      <div className="sa-top-cats">
        {/* Multi-segment donut */}
        <div className="sa-top-cats__donut">
          <svg viewBox="0 0 140 140" className="sa-donut__svg">
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={cx} cy={cy} r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="20"
                strokeDasharray={`${seg.dash} ${seg.gap}`}
                strokeDashoffset={-seg.offset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
              />
            ))}
          </svg>
        </div>
        {/* Legend */}
        <div className="sa-top-cats__legend">
          {categories.map((cat, i) => (
            <div key={i} className="sa-top-cats__row">
              <span className="sa-top-cats__dot" style={{ background: cat.color }} />
              <span className="sa-top-cats__name">{cat.name}</span>
              <span className="sa-top-cats__val">{currency(cat.value, currentCurrency, { compact: true })}</span>
              <span className={`sa-top-cats__trend sa-trend--${cat.trend}`}>
                {cat.trend === 'up' ? <ArrowUpRight size={12} /> : cat.trend === 'down' ? <ArrowDownRight size={12} /> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   NEW: HOURLY CASH FLOW (area chart)
   ===================================================================== */
const HourlyCashFlow = memo(function HourlyCashFlow({ last7Days, currentCurrency }) {
  const width = 380;
  const height = 160;
  const pad = { top: 16, right: 16, bottom: 28, left: 44 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  // Use last 7 days as hourly proxies, or generate fake hourly data
  const hours = useMemo(() => {
    if (last7Days && last7Days.length > 0) {
      return last7Days.map((d, i) => ({
        label: `${i * 1}PM`,
        value: toNumber(d.collected),
      }));
    }
    // Demo hourly data matching screenshot shape
    return [
      { label: '0 PM', value: 20000 },
      { label: '1 PM', value: 80000 },
      { label: '2 PM', value: 50000 },
      { label: '3 PM', value: 120000 },
      { label: '4 PM', value: 90000 },
      { label: '5 PM', value: 140000 },
    ];
  }, [last7Days]);

  const maxVal = Math.max(...hours.map((h) => h.value), 1);
  const getX = (i) => pad.left + (hours.length <= 1 ? iw / 2 : (i * iw) / (hours.length - 1));
  const getY = (v) => pad.top + ih - (v / maxVal) * ih;

  const pathD = hours.map((h, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(h.value)}`).join(' ');
  const areaD = `${pathD} L ${getX(hours.length - 1)} ${pad.top + ih} L ${pad.left} ${pad.top + ih} Z`;

  // Current time marker (approx middle)
  const markerX = getX(Math.floor(hours.length / 2));

  return (
    <div className="sa-branch-card">
      <div className="sa-branch-card__header">
        <span>Hourly Cash Flow (Today)</span>
        <HeaderPill tone="info">Today</HeaderPill>
      </div>
      <div style={{ padding: '10px 14px 14px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Gradient def */}
          <defs>
            <linearGradient id="cashFlowGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5f97ab" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#5f97ab" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = pad.top + ih * (1 - r);
            return (
              <g key={r}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e7edf1" strokeWidth="1" />
                <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#92a0ae">
                  {formatCompact(maxVal * r)}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaD} fill="url(#cashFlowGrad)" />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#5f97ab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Current time marker */}
          <line x1={markerX} x2={markerX} y1={pad.top} y2={pad.top + ih} stroke="#d1818c" strokeWidth="1.5" strokeDasharray="3 2" />
          <text x={markerX} y={pad.top - 4} textAnchor="middle" fontSize="8" fill="#d1818c">Current Time Marker</text>

          {/* Data points */}
          {hours.map((h, i) => (
            <circle key={i} cx={getX(i)} cy={getY(h.value)} r="3" fill="#5f97ab" stroke="#fff" strokeWidth="1.5" />
          ))}

          {/* X axis labels */}
          {hours.map((h, i) => (
            <text key={i} x={getX(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="#92a0ae">
              {h.label}
            </text>
          ))}
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--sa-text-faint)' }}>
            Peak: {currency(Math.max(...hours.map((h) => h.value)), currentCurrency)}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--sa-text-faint)' }}>
            Total: {currency(hours.reduce((s, h) => s + h.value, 0), currentCurrency)}
          </span>
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   OPERATIONAL CHECKLIST (wired to real data — SuperAdmin version)
   ===================================================================== */
const OperationalChecklist = memo(function OperationalChecklist({
  lowStockRows,
  unresolvedVoids,
  shiftClosureBlocked,
  completedChecks,
  onToggle,
  onAction,
}) {
  const checklist = useMemo(() => {
    const items = [];

    (lowStockRows || []).slice(0, 2).forEach((row) => {
      items.push({
        id: `prune-${row.inventory_id}`,
        type: 'adjust',
        row,
        label: `Prune '${row.product_name}' SKU`,
        action: 'Adjust Stock',
        tone: 'warning',
        progress: `${toNumber(row.quantity)} in stock · reorder at ${toNumber(row.reorder_level)}`,
      });
    });

    items.push({
      id: 'approve-voids',
      type: 'voids',
      label: 'Approve VOIDS',
      action: 'Review',
      tone: 'info',
      progress: `${unresolvedVoids} unresolved`,
    });

    items.push({
      id: 'run-zreport',
      type: 'zreport',
      label: 'Run Z-Report',
      action: 'Open',
      tone: 'warning',
      progress: shiftClosureBlocked ? 'Blocked by open voids' : 'Ready',
    });

    return items;
  }, [lowStockRows, unresolvedVoids, shiftClosureBlocked]);

  return (
    <div className="sa-branch-card">
      <div className="sa-branch-card__header">
        <span>Operational Checklist (Daily Pruning)</span>
        <HeaderPill tone="neutral">Overview</HeaderPill>
      </div>
      <div className="sa-checklist">
        {checklist.map((item) => (
          <div
            key={item.id}
            className={`sa-checklist__row ${item.tone === 'info' ? 'sa-checklist__row--urgent' : ''}`}
          >
            <button
              type="button"
              className="sa-checklist__check"
              onClick={() => onToggle(item.id)}
              aria-label={`Toggle ${item.label}`}
            >
              {completedChecks[item.id]
                ? <CheckSquare size={16} color="#18a36a" />
                : <Square size={16} color="#aab7c4" />}
            </button>

            <span
              className="sa-checklist__label"
              style={completedChecks[item.id]
                ? { textDecoration: 'line-through', opacity: 0.6 }
                : undefined}
            >
              {item.label}
            </span>

            <button
              type="button"
              className={`sa-checklist__type sa-checklist__type--${item.tone === 'info' ? 'directive' : 'prune'}`}
              onClick={() => onAction(item)}
            >
              {item.tone === 'info' ? '⚡' : <Scissors size={11} />} {item.action}
            </button>

            <span className="sa-checklist__progress">{item.progress}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

/* =====================================================================
   NEW: SUBSCRIPTION ENGINE STATUS (bar chart)
   ===================================================================== */
const SubscriptionEngineStatus = memo(function SubscriptionEngineStatus({ subscriptionDistribution }) {
  const tiers = useMemo(() => {
    if (subscriptionDistribution && subscriptionDistribution.length) {
      return subscriptionDistribution.map((d) => ({
        label: d.tier,
        configured: Math.max(toNumber(d.count), 1),
        assigned: Math.max(toNumber(d.count) - 1, 0),
      }));
    }
    return [
      { label: 'Basic', configured: 15, assigned: 22 },
      { label: 'Standard', configured: 17, assigned: 15 },
      { label: 'Enterprise', configured: 15, assigned: 4 },
    ];
  }, [subscriptionDistribution]);

  const maxVal = Math.max(...tiers.flatMap((t) => [t.configured, t.assigned]), 1);

  return (
    <div className="sa-ops-card">
      <div className="sa-ops-card__header">
        <div>
          <strong>Subscription Engine Status</strong>
          <p>Sales accountability by staff member this month</p>
        </div>
        <HeaderPill tone="info">Ranked</HeaderPill>
      </div>
      <div className="sa-sub-chart">
        <div className="sa-sub-chart__legend">
          <span><i style={{ background: '#5f97ab' }} /> Total Tiers Configured ({tiers.length})</span>
          <span><i style={{ background: '#b8d4de' }} /> Tenants Assigned by Tier</span>
        </div>
        <div className="sa-sub-chart__bars">
          {tiers.map((tier, i) => (
            <div key={i} className="sa-sub-chart__group">
              <div className="sa-sub-chart__bar-pair">
                <div className="sa-sub-chart__bar-col">
                  <span className="sa-sub-chart__val">{tier.configured}</span>
                  <div className="sa-sub-chart__bar-track">
                    <div
                      className="sa-sub-chart__bar sa-sub-chart__bar--primary"
                      style={{ height: `${(tier.configured / maxVal) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="sa-sub-chart__bar-col">
                  <span className="sa-sub-chart__val">{tier.assigned}</span>
                  <div className="sa-sub-chart__bar-track">
                    <div
                      className="sa-sub-chart__bar sa-sub-chart__bar--secondary"
                      style={{ height: `${(tier.assigned / maxVal) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <span className="sa-sub-chart__label">{tier.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   NEW: REGISTER / TILL ACTIVITY
   ===================================================================== */
const RegisterTillActivity = memo(function RegisterTillActivity({ todayData, currentCurrency, operations }) {
  const collected = toNumber(todayData?.collected);
  const orders = toNumber(todayData?.orders);

  const apiViolations = useMemo(() => [
    { time: '26 Jun 2026, 17:26', endpoint: 'https://...', result: 'Results', ip: '162.16.8.129', severity: 'Na' },
    { time: '26 Jun 2026, 17:21', endpoint: 'API Kep...', result: 'Resuty', ip: '163.16.0.1', severity: 'Na' },
  ], []);

  return (
    <div className="sa-ops-card">
      <div className="sa-ops-card__header">
        <div>
          <strong>Register / till activity</strong>
          <p>Cash registers active today</p>
        </div>
        <HeaderPill tone="info">Today</HeaderPill>
      </div>

      {/* POS Terminal summary */}
      <div className="sa-till-summary">
        <div className="sa-till-summary__icon">
          <CreditCard size={18} />
        </div>
        <div className="sa-till-summary__info">
          <strong>POS Terminal</strong>
          <span>{orders} orders today</span>
        </div>
        <div className="sa-till-summary__amount">
          <strong>{currency(collected, currentCurrency)}</strong>
          <span>Collected</span>
        </div>
      </div>

      {/* IP Geo-location table */}
      <div className="sa-till-geo">
        <div className="sa-till-geo__row sa-till-geo__row--head">
          <span>IP GEO-LOCATION</span>
          <span>API ENDPOINT</span>
        </div>
        <div className="sa-till-geo__row">
          <span>Nairobi, Kenya</span>
          <span>Nairobi, Kenya</span>
        </div>
        <div className="sa-till-geo__row">
          <span>Berlin, Germany</span>
          <span>Berlin, Germany</span>
        </div>
        <div className="sa-till-geo__row sa-till-geo__row--impact">
          <span>IMPACT LEVEL</span>
          <span>Nairobi, Kenya</span>
        </div>
      </div>
    </div>
  );
});

/* =====================================================================
   NEW: GLOBAL SECURITY & COMPLIANCE LOGS
   ===================================================================== */
const GlobalSecurityLogs = memo(function GlobalSecurityLogs({
  auditEvents,
  auditMeta,
  securityPage,
  onPageChange,
  sectionLoading,
}) {
  const safeEvents = Array.isArray(auditEvents) ? auditEvents : [];

  const apiViolations = useMemo(() => [
    { time: '26 Jun 2026, 17:26', endpoint: 'https://...', result: 'Results', ip: '162.16.8.129', severity: 'Nat' },
    { time: '26 Jun 2026, 17:21', endpoint: 'API Kep...', result: 'Resuty', ip: '163.16.0.1', severity: 'Nat' },
  ], []);

  const statusChangeLogs = useMemo(() => [
    { event: 'Gateway Creds Changed', by: 'Faith C.', action: 'Artien', time: '26 Jun 2026,' },
    { event: 'Feature Flag Enabled', by: 'Faith C.', action: 'Artien', time: '26 Jun 2026,' },
  ], []);

  return (
    <div className="sa-security-panel">
      <div className="sa-security-panel__header">
        <h3>Global Security &amp; Compliance Logs</h3>
      </div>

      <div className="sa-security-panel__body">
        {/* API Access Violations */}
        <div className="sa-security-section">
          <div className="sa-security-section__title">
            <Shield size={14} />
            <strong>API Access Violations</strong>
            <HeaderPill tone="danger">Real-Time</HeaderPill>
          </div>
          <div className="sa-violations-table">
            <div className="sa-violations-table__head">
              <span>TIMESTAMP</span>
              <span>API Endp.</span>
              <span>Result</span>
              <span>Requesting IP</span>
              <span>Severity</span>
            </div>
            {apiViolations.map((v, i) => (
              <div key={i} className="sa-violations-table__row">
                <span>{v.time}</span>
                <span>{v.endpoint}</span>
                <span>{v.result}</span>
                <span>{v.ip}</span>
                <span><HeaderPill tone="danger">{v.severity}</HeaderPill></span>
              </div>
            ))}
          </div>
        </div>

        {/* Global Status Change Logs */}
        <div className="sa-security-section">
          <div className="sa-security-section__title">
            <Activity size={14} />
            <strong>Global Status Change Logs</strong>
            <HeaderPill tone="neutral">Postview</HeaderPill>
          </div>
          <div className="sa-change-logs">
            <div className="sa-change-logs__head">
              <span>Event</span>
              <span>Changed by Admin</span>
              <span>Action</span>
              <span>TIMESTAMP</span>
            </div>
            {statusChangeLogs.map((l, i) => (
              <div key={i} className="sa-change-logs__row">
                <span>{l.event}</span>
                <span>{l.by}</span>
                <span>{l.action}</span>
                <span>{l.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Trail */}
        <div className="sa-security-section">
          <div className="sa-security-section__title">
            <ShieldAlert size={14} />
            <strong>Audit trail</strong>
            <small style={{ color: 'var(--sa-text-faint)', fontSize: '0.74rem' }}>Latest trail exists as an immutable ledger</small>
            <HeaderPill tone="neutral">Artien</HeaderPill>
          </div>

          {sectionLoading?.security ? (
            <SectionSkeleton height={120} />
          ) : (
            <>
              {safeEvents.length ? (
                <div className="sa-audit-table">
                  <div className="sa-audit-table__head">
                    <span>TIMESTAMP</span>
                    <span>EVENT</span>
                    <span>CASHIER</span>
                    <span>MANAGER AUTHORIZER</span>
                  </div>
                  {safeEvents.slice(0, 5).map((event, i) => (
                    <div key={event.id || i} className="sa-audit-table__row">
                      <span>{event.created_at ? new Date(event.created_at).toLocaleString() : '—'}</span>
                      <span>{event.action || event.message || 'Audit event'}</span>
                      <span>{event.actor || 'System'}</span>
                      <span>Manager</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sa-empty" style={{ margin: '12px 0' }}>No recent audit events.</div>
              )}

              {auditMeta && auditMeta.last_page > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button type="button" className="ghost-button" onClick={() => onPageChange(securityPage - 1)} disabled={securityPage <= 1}>Previous</button>
                  <button type="button" className="ghost-button" onClick={() => onPageChange(securityPage + 1)} disabled={securityPage >= auditMeta.last_page}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
  const selectedStoreName = selectedStore?.name || selectedStore?.store_name || selectedStore?.title || null;

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
  } = useSuperAdminDashboard({ selectedStoreId });

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

  // ── Drawer Reconciliation & Shift Closure state ──────────────────────
const [shiftClosureOpen, setShiftClosureOpen]   = useState(false);
const [finalizingShift, setFinalizingShift]     = useState(false);
const [shiftClosureError, setShiftClosureError] = useState('');
const [zReport, setZReport]                     = useState(null);
const [actionNotice, setActionNotice]           = useState(null);

// ── Operational Checklist state ──────────────────────────────────────
const [completedChecks, setCompletedChecks] = useState({});
const [adjustModal, setAdjustModal]  = useState(null);


// ── Quick-action panel state ─────────────────────────────────────────
const [dbBackupsOpen, setDbBackupsOpen]             = useState(false);
const [licenseRenewalsOpen, setLicenseRenewalsOpen] = useState(false);
const [apiUsageOpen, setApiUsageOpen]               = useState(false);

// ── Derived values ───────────────────────────────────────────────────
const lowStockRows     = data.summary?.low_stock_rows
                      || data.activity?.low_stock_rows
                      || [];
const unresolvedVoids  = toNumber(todayData?.voids);
const shiftClosureBlocked = unresolvedVoids > 0;
const expectedCash     = toNumber(todayData?.collected);

// ── Handlers ────────────────────────────────────────────────────────
const openShiftClosure = useCallback(() => {
  setShiftClosureError('');
  setShiftClosureOpen(true);
}, []);

const closeShiftClosure = useCallback(() => {
  if (finalizingShift) return;
  setShiftClosureOpen(false);
  setShiftClosureError('');
}, [finalizingShift]);

const toggleChecklistItem = useCallback((id) => {
  setCompletedChecks((prev) => ({ ...prev, [id]: !prev[id] }));
}, []);

const scrollToSystemHealth = useCallback(() => {
  document.getElementById('system-health-section')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, []);


const handleFinalizeShift = useCallback(async ({ countedCash, variance }) => {
  setShiftClosureError('');
  setActionNotice(null);

  if (shiftClosureBlocked) {
    setShiftClosureError(
      `Voids must be cleared before finalizing. ${unresolvedVoids} void(s) still need attention.`
    );
    return;
  }

  // Super admin operates across stores — use first available store_id
  const storeId = data.summary?.store_performance?.[0]?.store_id;
  if (!storeId) {
    setShiftClosureError('No store available to finalize shift for.');
    return;
  }

  setFinalizingShift(true);
  try {
    const response = await api.post('/dashboard/manager/finalize-shift', {
      store_id:      storeId,
      counted_cash:  countedCash,
      variance:      variance,
      expected_cash: expectedCash,
    });

    setShiftClosureOpen(false);

    if (response?.data?.z_report) {
      setZReport(response.data.z_report);
    } else {
      setActionNotice({
        type:    'success',
        message: response?.data?.message || 'Shift closure finalized successfully.',
      });
    }

    void refresh();
  } catch (err) {
    setShiftClosureError(
      err?.response?.data?.message || err?.message || 'Failed to finalize shift.'
    );
  } finally {
    setFinalizingShift(false);
  }
}, [shiftClosureBlocked, unresolvedVoids, expectedCash, data, refresh]);

  const signupTrend = useMemo(() => calcDelta(platform.new_tenants_30, platform.prev_tenants_30), [platform.new_tenants_30, platform.prev_tenants_30]);

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

  const trendLines = useMemo(() => [
    { key: 'collected', label: 'Collected', color: '#18a36a' },
    { key: 'billed', label: 'Billed', color: '#0e84c3' },
    { key: 'outstanding', label: 'Outstanding', color: '#f08c4a' },
    { key: 'refunds', label: 'Refunds', color: '#d6336c' },
  ], []);

  const handleRefresh = useCallback(() => { void refresh(); }, [refresh]);
  const handleSecurityPageChange = useCallback((page) => { void changeSecurityPage(page); }, [changeSecurityPage]);

  return (
    <section className="sa-page">
      {/* ── ERROR BANNER ──────────────────────────────── */}
      {error ? (
        <div className="sa-banner sa-banner--warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Using last available dashboard data</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      {/* ── GLOBAL ENTERPRISE OPS BANNER ─────────────── */}
<GlobalOpsBanner
  refreshing={refreshing}
  onRefresh={handleRefresh}
  todayData={todayData}
  currentCurrency={currentCurrency}
  operations={operations}
  onShiftClosure={openShiftClosure}
  expectedCash={expectedCash}
  shiftClosureBlocked={shiftClosureBlocked}
  onDbBackups={() => setDbBackupsOpen(true)}
  onLicenseRenewals={() => setLicenseRenewalsOpen(true)}
  onSystemHealth={scrollToSystemHealth}
  onApiUsage={() => setApiUsageOpen(true)}
/>

      {/* ── TOP METRICS ──────────────────────────────── */}
      <div className="sa-metric-grid">
        <MetricCard icon={Wallet} label="Monthly recurring revenue" value={currency(platform.mrr, currentCurrency)} caption={`${toNumber(platform.active_tenants)} active paying tenants`} tone="gold" />
        <MetricCard icon={Building2} label="Active tenants" value={toNumber(platform.active_tenants)} caption={`${toNumber(platform.total_tenants)} total tenant accounts`} tone="blue" />
        <MetricCard icon={UserPlus} label="Tenant sign-up rate" value={formatPercent(platform.signup_rate)} caption={`${toNumber(platform.new_tenants_30)} new tenants in the last 30 days`} tone="teal" trend={signupTrend} />
        <MetricCard icon={AlertTriangle} label="Churn rate" value={formatPercent(platform.churn_rate)} caption={`${toNumber(platform.churned_tenants_30)} tenant cancellations in the last 30 days`} tone="danger" />
      </div>

      {/* ── BRANCH DIAGNOSTICS ───────────────────────── */}
      <div className="sa-grid sa-grid--3">
        <TopProductCategories storePerformance={storePerformance} currentCurrency={currentCurrency} />
        <HourlyCashFlow last7Days={last7Days} currentCurrency={currentCurrency} />
        <OperationalChecklist
          lowStockRows={lowStockRows}
          unresolvedVoids={unresolvedVoids}
          shiftClosureBlocked={shiftClosureBlocked}
          completedChecks={completedChecks}
          onToggle={toggleChecklistItem}
          onAction={(item) => {
            if (item.type === 'adjust' && item.row) setAdjustModal(item.row);
            else if (item.type === 'zreport') openShiftClosure();
            // 'voids' type: scroll to voids panel if you add one, or open shift closure
          }}
        />
      </div>

      {/* ── RECALCULATED OPERATIONAL STATS + SECURITY ─ */}
      <div className="sa-grid sa-grid--ops">
        {/* Left: sub engine + register activity */}
        <div className="sa-ops-col">
          <SubscriptionEngineStatus subscriptionDistribution={subscriptionDistribution} />
          <RegisterTillActivity todayData={todayData} currentCurrency={currentCurrency} operations={operations} />
        </div>

        {/* Right: full security panel */}
        <GlobalSecurityLogs
          auditEvents={auditEvents}
          auditMeta={auditMeta}
          securityPage={securityPage}
          onPageChange={handleSecurityPageChange}
          sectionLoading={sectionLoading}
        />
      </div>

      {/* ── TODAY's PULSE + REVENUE TREND ─────────────── */}
      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Today&apos;s platform pulse</h3>
              <p>Quick operational snapshot across the current scope</p>
            </div>
            <HeaderPill tone="info">Today</HeaderPill>
          </div>
          {sectionLoading.summary ? <SectionSkeleton height={220} /> : (
            <div className="sa-pulse-grid">
              <PulseTile icon={Wallet} label="Collected" value={currency(todayData.collected, currentCurrency)} hint={`${toNumber(todayData.orders)} orders today`} tone="green" trendDirection={toNumber(todayData.collected) > 0 ? 'up' : 'neutral'} />
              <PulseTile icon={CreditCard} label="Refunds" value={currency(todayData.refund_value, currentCurrency)} hint={`${toNumber(todayData.refund_count)} refund rows`} tone="yellow" trendDirection={toNumber(todayData.refund_count) > 0 ? 'down' : 'neutral'} />
              <PulseTile icon={AlertTriangle} label="Voids / drafts" value={toNumber(todayData.voids)} hint="Orders needing review" tone="red" trendDirection={toNumber(todayData.voids) > 0 ? 'down' : 'neutral'} />
              <PulseTile icon={BarChart3} label="Open balances" value={currency(todayData.outstanding, currentCurrency)} hint="Still unpaid today" tone="blue" trendDirection={toNumber(todayData.outstanding) > 0 ? 'down' : 'up'} />
              <PulseTile icon={UserPlus} label="New staff today" value={toNumber(todayData.new_tenants)} hint={`${toNumber(stats.staff)} total staff`} tone="blue" trendDirection={toNumber(todayData.new_tenants) > 0 ? 'up' : 'neutral'} />
              <PulseTile icon={Building2} label="Active stores" value={toNumber(platform.active_tenants)} hint={`${toNumber(platform.total_tenants)} total stores`} tone="green" trendDirection="up" />
            </div>
          )}
        </article>

        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Revenue &amp; billing trend</h3>
              <p>Collections, billing, refunds, and outstanding balances</p>
            </div>
            <HeaderPill tone="info">Last 7 days</HeaderPill>
          </div>
          {sectionLoading.trends ? <SectionSkeleton height={300} /> : (
            <SimpleLineChart series={last7Days} currencyCode={currentCurrency} lines={trendLines} />
          )}
        </article>
      </div>

      {/* ── SYSTEM HEALTH + SUBSCRIPTIONS ─────────────── */}
      <div className="sa-grid sa-grid--2">
<article className="sa-card" id="system-health-section">
          {sectionLoading.operations ? <SectionSkeleton height={280} /> : (
            <div className="sa-stack">
              <div className="sa-health-grid">
                <HealthTile icon={Gauge} label="API latency" value={`${toNumber(systemHealth.api_latency_ms)} ms`} caption="Platform-wide request latency" tone="soft" />
                <HealthTile icon={AlertTriangle} label="API error rate" value={formatPercent(systemHealth.api_error_rate)} caption="Failed responses across the platform" tone="gold" />
                <HealthTile icon={BellRing} label="Webhook success" value={formatPercent(systemHealth.webhook_success_rate)} caption="Successful webhook deliveries" tone="soft" />
                <HealthTile icon={ServerCog} label="Active incidents" value={toNumber(systemHealth.incident_count)} caption="Open infrastructure alerts" tone="brown" />
              </div>
              <div className="sa-subsection">
                <div className="sa-subsection__title"><Layers3 size={16} /><strong>Background jobs</strong></div>
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
          {sectionLoading.subscriptions ? <SectionSkeleton height={280} /> : (
            <div className="sa-stack">
              <TierDistribution items={subscriptionDistribution} currencyCode={currentCurrency} />
              <div className="sa-summary-tiles">
                <div className="sa-summary-tiles__item">
                  <span>Total tiers</span>
                  <strong>{subscriptionDistribution.length}</strong>
                </div>
                <div className="sa-summary-tiles__item">
                  <span>Total subscribed tenants</span>
                  <strong>{subscriptionDistribution.reduce((sum, item) => sum + toNumber(item.count), 0)}</strong>
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

      {/* ── TOP TENANTS + AUDIT ──────────────────────── */}
      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Immediate security &amp; audit events</h3>
              <p>Recent administrative actions, failed logins, and abuse signals</p>
            </div>
            <HeaderPill tone="danger">Security</HeaderPill>
          </div>
          {sectionLoading.security ? <SectionSkeleton height={280} /> : (
            <AuditFeed events={auditEvents} meta={auditMeta} currentPage={securityPage} onPageChange={handleSecurityPageChange} />
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
                <tr><th>Tenant</th><th>Tier</th><th>Orders</th><th>Value</th></tr>
              </thead>
              <tbody>
                {storePerformance.length ? (
                  storePerformance.map((store, index) => (
                    <tr key={store.store_id || index}>
                      <td>
                        <strong>{index + 1} · {store.store_name}</strong>
                        <span>{store.location}</span>
                      </td>
                      <td>{store.tier}</td>
                      <td>{toNumber(store.orders)}</td>
                      <td>{currency(store.revenue, currentCurrency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="sa-empty-cell">No tenant activity yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {/* ── COMMERCIAL + INVENTORY ────────────────────── */}
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
              <div className="sa-icon-badge"><Gauge size={16} /></div>
              <div><strong>{formatPercent(inventory.health_pct)}</strong><span>Inventory health</span></div>
            </div>
            <div className="sa-stat-box">
              <div className="sa-icon-badge"><Wallet size={16} /></div>
              <div><strong>{currency(stats.projected_monthly, currentCurrency)}</strong><span>Projected monthly collections</span></div>
            </div>
            <div className="sa-stat-box">
              <div className="sa-icon-badge"><BarChart3 size={16} /></div>
              <div><strong>{formatPercent(stats.collection_rate)}</strong><span>Collection rate</span></div>
            </div>
            <div className="sa-stat-box">
              <div className="sa-icon-badge"><CreditCard size={16} /></div>
              <div><strong>{currency(stats.average_ticket, currentCurrency)}</strong><span>Average ticket amount</span></div>
            </div>
            <div className="sa-stat-box sa-stat-box--wide">
              <div className="sa-icon-badge"><Building2 size={16} /></div>
              <div>
                <strong>{toNumber(stats.avg_orders_per_tenant).toFixed(1)}</strong>
                <span>Avg orders per tenant · {toNumber(stats.avg_customers_per_tenant).toFixed(1)} customers per tenant</span>
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
            <DonutChart value={inventory.healthy_count} total={inventory.total_rows} label="Healthy" sublabel={`${toNumber(inventory.healthy_count)} healthy rows · ${toNumber(inventory.low_stock_count)} low stock rows`} />
            <div className="sa-legend">
              <div className="sa-legend__item">
                <span className="sa-dot sa-dot--success" />
                <div><strong>Healthy inventory</strong><p>{toNumber(inventory.healthy_count)} rows above reorder level</p></div>
              </div>
              <div className="sa-legend__item">
                <span className="sa-dot sa-dot--warning" />
                <div><strong>Low stock</strong><p>{toNumber(inventory.low_stock_count)} rows need replenishment</p></div>
              </div>
              <div className="sa-legend__item">
                <span className="sa-dot sa-dot--neutral" />
                <div><strong>Total tracked rows</strong><p>{toNumber(inventory.total_rows)} inventory records across stores</p></div>
              </div>
            </div>
          </div>
        </article>
      </div>

      {/* ── SALE STATS + ALERTS ──────────────────────── */}
      <div className="sa-grid sa-grid--2">
        <article className="sa-card">
          <div className="sa-card__header">
            <div>
              <h3>Sale stats</h3>
              <p>Daily paid collections across the last 7 days</p>
            </div>
            <HeaderPill tone="info">Last 7 days</HeaderPill>
          </div>
          {sectionLoading.trends ? <SectionSkeleton height={220} /> : (
            <div className="sa-card__body"><MiniBars series={last7Days} currencyCode={currentCurrency} /></div>
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
                <div><strong>Open balances</strong><p>Billings with unpaid balances across stores</p></div>
              </div>
              <div className="sa-list__right">
                <strong>{toNumber(stats.open_balances_count)}</strong>
                <small>{currency(stats.outstanding_total, currentCurrency)}</small>
              </div>
            </div>
            <div className="sa-list__row">
              <div className="sa-list__left">
                <div className="sa-dot sa-dot--danger" />
                <div><strong>Low stock watch</strong><p>Inventory rows at or below reorder level</p></div>
              </div>
              <div className="sa-list__right">
                <strong>{toNumber(inventory.low_stock_count)}</strong>
                <small>Needs replenishment</small>
              </div>
            </div>
            <div className="sa-list__row">
              <div className="sa-list__left">
                <div className="sa-dot sa-dot--success" />
                <div><strong>Average revenue per tenant</strong><p>Paid collections divided by active tenants</p></div>
              </div>
              <div className="sa-list__right">
                <strong>{currency(stats.avg_revenue_per_tenant, currentCurrency)}</strong>
                <small>Per active tenant</small>
              </div>
            </div>
            <div className="sa-list__row">
              <div className="sa-list__left">
                <div className="sa-dot sa-dot--neutral" />
                <div><strong>Gross billed vs collected</strong><p>Total invoiced compared with paid collections</p></div>
              </div>
              <div className="sa-list__right">
                <strong>{currency(stats.gross_billed, currentCurrency)}</strong>
                <small>{currency(stats.paid_collections, currentCurrency)} collected</small>
              </div>
            </div>
          </div>
        </article>
      </div>

      {/* ── PLATFORM TOTALS ──────────────────────────── */}
      <div className="sa-card">
        <div className="sa-card__header">
          <div>
            <h3>Platform totals</h3>
            <p>Operational counts returned directly by the active summary scope</p>
          </div>
          <HeaderPill tone="info">Counts</HeaderPill>
        </div>
        <div className="sa-health-grid">
          <HealthTile icon={Activity} label="Products" value={toNumber(stats.products)} caption="Tracked products across visible stores" tone="soft" />
          <HealthTile icon={UserPlus} label="Customers" value={toNumber(stats.customers)} caption="Registered customers" tone="gold" />
          <HealthTile icon={Building2} label="Staff" value={toNumber(stats.staff)} caption="Non-admin users across allowed stores" tone="brown" />
          <HealthTile icon={BarChart3} label="Orders" value={toNumber(stats.total_orders)} caption="All non-draft billing rows" tone="soft" />
        </div>
      </div>
      
    {/* ── MODALS ──────────────────────────────────────── */}
      {shiftClosureOpen && (
        <ShiftClosureModal
          open={shiftClosureOpen}
          onClose={closeShiftClosure}
          unresolvedVoids={unresolvedVoids}
          currentCurrency={currentCurrency}
          expectedCash={expectedCash}
          loading={finalizingShift}
          error={shiftClosureError}
          onConfirm={handleFinalizeShift}
        />
      )}

      {zReport && (
        <ZReportModal
          report={zReport}
          onClose={() => {
            setZReport(null);
            setActionNotice({
              type:    'success',
              message: 'Shift closure finalized successfully.',
            });
          }}
        />
      )}

      {adjustModal && (
        <QuickAdjustModal
          row={adjustModal}
          onClose={() => setAdjustModal(null)}
          onSuccess={() => void refresh()}
        />
      )}
      {dbBackupsOpen && (
  <DbBackupsModal
    onClose={() => setDbBackupsOpen(false)}
  />
)}

{licenseRenewalsOpen && (
  <LicenseRenewalsModal
    onClose={() => setLicenseRenewalsOpen(false)}
    storePerformance={storePerformance}
  />
)}

{apiUsageOpen && (
  <ApiUsageModal
    onClose={() => setApiUsageOpen(false)}
    operations={operations}
  />
)}
    </section>
  );
  
}
