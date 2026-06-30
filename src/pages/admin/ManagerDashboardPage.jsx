import { memo, useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  CreditCard,
  DollarSign,
  Gauge,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  Scissors,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tag,
  Timer,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useStore } from '../../contexts/StoreContext';
import { useManagerDashboard } from '../../hooks/useManagerDashboard';
import { currency, formatDateTime } from '../../utils/helpers';
import api from '../../lib/api';
import '../../styles/manager-dashboard.css';
import { openBillingPrint, openZReportPrint } from '../../utils/print';

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

const FULFILLMENT_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const formatFulfillmentStatus = (value) => FULFILLMENT_LABELS[value] || 'Pending';

const CATEGORY_COLORS = ['#e89b5a', '#5f97ab', '#a87bb8', '#d6707a', '#6fb088', '#c8b160'];

/* =====================================================================
   QUICK ADJUST MODAL
   Opens from low-stock row. Sends signed delta to PATCH /inventory/{id}/adjust
   ===================================================================== */
const QuickAdjustModal = memo(function QuickAdjustModal({ row, onClose, onSuccess }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentQty = toNumber(row?.quantity);
  const parsedDelta = parseInt(delta, 10);
  const previewQty = !isNaN(parsedDelta) ? currentQty + parsedDelta : null;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    if (isNaN(parsedDelta) || parsedDelta === 0) {
      setError('Adjustment amount cannot be zero.');
      return;
    }

    if (previewQty !== null && previewQty < 0) {
      setError(`Result would be negative (${previewQty}). Max removal: ${currentQty}.`);
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/inventory/${row.inventory_id}/adjust`, {
        quantity: parsedDelta,
        reason: reason.trim() || 'Manual stock adjustment from dashboard',
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Adjustment failed.');
    } finally {
      setSaving(false);
    }
  }, [parsedDelta, previewQty, currentQty, row, reason, onClose, onSuccess]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Quick Adjust Stock</h2>
            <p className="modal-sub">{row?.product_name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-qty-row">
            <span className="modal-qty-chip modal-qty-chip--current">
              Current stock: <strong>{currentQty}</strong>
            </span>
            {previewQty !== null && (
              <span
                className={`modal-qty-chip ${
                  previewQty < toNumber(row?.reorder_level)
                    ? 'modal-qty-chip--warn'
                    : 'modal-qty-chip--ok'
                }`}
              >
                After adjust: <strong>{previewQty}</strong>
              </span>
            )}
          </div>

          <label className="modal-label">
            Adjustment amount
            <span className="modal-hint">Use negative to remove (e.g. −5), positive to add (e.g. +10)</span>
            <input
              type="number"
              className="modal-input"
              placeholder="e.g. -5 or +20"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="modal-label">
            Reason <span className="modal-optional">(optional)</span>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. Damaged stock, cycle count correction"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
            />
          </label>

          {error && (
            <div className="modal-error">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saving || delta === ''}
            >
              {saving ? 'Saving…' : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

/* =====================================================================
   CREATE PO MODAL
   Opens from low-stock row. Drafts a Purchase Order via POST /purchase-orders
   ===================================================================== */
const CreatePOModal = memo(function CreatePOModal({ row, storeId, onClose, onSuccess }) {
  const [form, setForm] = useState({
    supplier_name: '',
    qty_ordered: Math.max(toNumber(row?.reorder_level) * 2, 1),
    unit_cost: '',
    notes: '',
    expected_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = useCallback((field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value })), []);

  const totalCost = form.unit_cost && form.qty_ordered
    ? toNumber(form.unit_cost) * toNumber(form.qty_ordered)
    : null;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    const qty = parseInt(form.qty_ordered, 10);
    if (!qty || qty < 1) {
      setError('Quantity must be at least 1.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/purchase-orders', {
        store_id: storeId,
        product_id: row.product_id,
        inventory_id: row.inventory_id,
        supplier_name: form.supplier_name.trim(),
        qty_ordered: qty,
        unit_cost: form.unit_cost ? toNumber(form.unit_cost) : null,
        notes: form.notes.trim(),
        expected_date: form.expected_date || null,
        status: 'draft',
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        setError('Purchase order endpoint not yet set up on the server. Contact your developer.');
      } else {
        setError(err?.response?.data?.message || err?.message || 'Failed to create PO.');
      }
    } finally {
      setSaving(false);
    }
  }, [form, row, storeId, onClose, onSuccess]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Create Purchase Order</h2>
            <p className="modal-sub">{row?.product_name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-qty-row">
            <span className="modal-qty-chip modal-qty-chip--warn">
              Current stock: <strong>{toNumber(row?.quantity)}</strong>
            </span>
            <span className="modal-qty-chip modal-qty-chip--current">
              Reorder level: <strong>{toNumber(row?.reorder_level)}</strong>
            </span>
          </div>

          <label className="modal-label">
            Supplier name <span className="modal-optional">(optional)</span>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. ABC Distributors"
              value={form.supplier_name}
              onChange={set('supplier_name')}
              maxLength={200}
              autoFocus
            />
          </label>

          <div className="modal-row-2">
            <label className="modal-label">
              Quantity to order
              <input
                type="number"
                className="modal-input"
                min={1}
                value={form.qty_ordered}
                onChange={set('qty_ordered')}
                required
              />
            </label>

            <label className="modal-label">
              Unit cost <span className="modal-optional">(optional)</span>
              <input
                type="number"
                className="modal-input"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={form.unit_cost}
                onChange={set('unit_cost')}
              />
            </label>
          </div>

          {totalCost !== null && (
            <div className="modal-total-row">
              Estimated total: <strong>{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </div>
          )}

          <label className="modal-label">
            Expected delivery date <span className="modal-optional">(optional)</span>
            <input
              type="date"
              className="modal-input"
              value={form.expected_date}
              onChange={set('expected_date')}
              min={new Date().toISOString().split('T')[0]}
            />
          </label>

          <label className="modal-label">
            Notes <span className="modal-optional">(optional)</span>
            <textarea
              className="modal-input modal-textarea"
              placeholder="Special instructions or reference numbers"
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              maxLength={500}
            />
          </label>

          {error && (
            <div className="modal-error">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving…' : 'Save as Draft PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

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
  const isOver  = variance !== null && variance > 0;

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
   Z-REPORT MODAL
   Shows after shift is finalized. Offers print.
   ===================================================================== */
const ZReportModal = memo(function ZReportModal({ report, onClose }) {
  if (!report) return null;

  const { currency: cur } = report;
  const variance = report.variance;
  const isShort  = variance !== null && variance < 0;
  const isOver   = variance !== null && variance > 0;

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
        {/* Header */}
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

          {/* Sales summary */}
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

          {/* Transaction counts */}
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

          {/* Payment breakdown */}
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

          {/* Drawer reconciliation */}
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

          {/* Footer */}
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

/* =====================================================================
   HOURLY CASH FLOW (Area chart)
   ===================================================================== */
const HourlyCashFlow = memo(function HourlyCashFlow({ series, currencyCode }) {
  const width = 560;
  const height = 220;
  const padding = { top: 24, right: 20, bottom: 32, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const safe = Array.isArray(series) && series.length ? series : [];

  const maxValue = Math.max(
    ...safe.map((row) => Math.abs(toNumber(row.sales))),
    1
  );

  const getX = (index) =>
    padding.left +
    (safe.length <= 1
      ? innerWidth / 2
      : (index * innerWidth) / (safe.length - 1));

  const getY = (value) =>
    padding.top + innerHeight - (toNumber(value) / maxValue) * innerHeight;

  const gridCount = 5;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const ratio = i / gridCount;
    return {
      y: padding.top + innerHeight - innerHeight * ratio,
      label: `KSH ${formatCompact(maxValue * ratio)}`,
    };
  });

  const linePath = safe
    .map((row, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(row.sales)}`)
    .join(' ');

  const areaPath =
    safe.length > 0
      ? `${linePath} L ${getX(safe.length - 1)} ${padding.top + innerHeight} L ${getX(0)} ${
          padding.top + innerHeight
        } Z`
      : '';

  const currentIdx = safe.findIndex((row) => row.is_current);
  const peakIdx = safe.reduce(
    (best, row, i) => (toNumber(row.sales) > toNumber(safe[best]?.sales) ? i : best),
    0
  );

  return (
    <div className="mg-hourly">
      <div style={{ width: '100%', overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label="Hourly cash flow chart"
        >
          <defs>
            <linearGradient id="mg-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#e89b5a" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#e89b5a" stopOpacity="0.05" />
            </linearGradient>
          </defs>

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

          {areaPath && <path d={areaPath} fill="url(#mg-area-fill)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#e89b5a"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {currentIdx >= 0 && safe[currentIdx] && (
            <g>
              <line
                x1={getX(currentIdx)}
                x2={getX(currentIdx)}
                y1={padding.top}
                y2={padding.top + innerHeight}
                stroke="#d6707a"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <circle
                cx={getX(currentIdx)}
                cy={getY(safe[currentIdx].sales)}
                r="5"
                fill="#d6707a"
                stroke="#fff"
                strokeWidth="2"
              />
              <text
                x={getX(currentIdx)}
                y={padding.top - 8}
                textAnchor="middle"
                className="mg-chart-marker"
              >
                Current
              </text>
            </g>
          )}

          {safe[peakIdx] && peakIdx !== currentIdx && (
            <text
              x={getX(peakIdx)}
              y={getY(safe[peakIdx].sales) - 10}
              textAnchor="middle"
              className="mg-chart-peak-label"
            >
              KSH {formatCompact(safe[peakIdx].sales)}
            </text>
          )}

          {safe.map((row, i) => (
            <text
              key={row.key || i}
              x={getX(i)}
              y={height - 10}
              textAnchor="middle"
              className="mg-chart-axis"
            >
              {row.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
});

/* =====================================================================
   CATEGORY DONUT CHART
   ===================================================================== */
const CategoryDonut = memo(function CategoryDonut({ items, currencyCode }) {
  const safe = Array.isArray(items) && items.length ? items.slice(0, 6) : [];
  const total = safe.reduce((sum, it) => sum + toNumber(it.amount), 0) || 1;

  const radius = 58;
  const innerRadius = 38;
  const cx = 80;
  const cy = 80;

  let cumulative = 0;
  const segments = safe.map((item, i) => {
    const value = toNumber(item.amount);
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const x3 = cx + innerRadius * Math.cos(endAngle);
    const y3 = cy + innerRadius * Math.sin(endAngle);
    const x4 = cx + innerRadius * Math.cos(startAngle);
    const y4 = cy + innerRadius * Math.sin(startAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z',
    ].join(' ');

    return {
      path,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      name: item.name,
      amount: value,
    };
  });

  return (
    <div className="mg-cat-donut">
      <svg viewBox="0 0 160 160" className="mg-cat-donut__svg">
        {segments.length ? (
          segments.map((seg, i) => (
            <path key={i} d={seg.path} fill={seg.color} stroke="#fff" strokeWidth="1.5" />
          ))
        ) : (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e6edf1" strokeWidth="18" />
        )}
      </svg>

      <ul className="mg-cat-legend">
        {segments.length ? (
          segments.map((seg, i) => (
            <li key={i}>
              <span className="mg-cat-dot" style={{ background: seg.color }} />
              <span className="mg-cat-name">{seg.name}</span>
              <strong>{currency(seg.amount, currencyCode)}</strong>
            </li>
          ))
        ) : (
          <li className="mg-cat-empty">No category data yet</li>
        )}
      </ul>
    </div>
  );
});

/* =====================================================================
   INVENTORY DONUT (small, %)
   ===================================================================== */
const InventoryDonut = memo(function InventoryDonut({ value, total }) {
  const safeTotal = Math.max(toNumber(total), 1);
  const ratio = Math.min(Math.max(toNumber(value) / safeTotal, 0), 1);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;

  return (
    <div className="mg-inv-donut">
      <svg viewBox="0 0 110 110" className="mg-inv-donut__svg">
        <circle cx="55" cy="55" r={radius} className="mg-inv-donut__track" />
        <circle
          cx="55"
          cy="55"
          r={radius}
          className="mg-inv-donut__progress"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="mg-inv-donut__center">
        <strong>{formatPercent(ratio * 100, 1)}</strong>
        <span>healthy</span>
      </div>
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

  const [adjustModal, setAdjustModal] = useState(null);
  const [poModal, setPoModal] = useState(null);
  const [shiftClosureOpen, setShiftClosureOpen] = useState(false);
  const [finalizingShift, setFinalizingShift] = useState(false);
  const [shiftClosureError, setShiftClosureError] = useState('');
const [actionNotice, setActionNotice] = useState(null);
  const [zReport, setZReport] = useState(null);
  const [completedChecks, setCompletedChecks] = useState({});

  const openAdjust = useCallback((row) => setAdjustModal(row), []);
  const closeAdjust = useCallback(() => setAdjustModal(null), []);

  const openPO = useCallback((row) => setPoModal(row), []);
  const closePO = useCallback(() => setPoModal(null), []);

  const handleActionSuccess = useCallback(() => {
    void refresh();
  }, [refresh]);

  const currentCurrency = data.currency || activeStore?.currency || stores?.[0]?.currency || 'KES';

  const summary = data.summary || {};
  const todayData = summary.today || {};
  const stats = summary.stats || {};
  const loyalty = summary.loyalty || {};
  const topItems = summary.top_items || [];
  const cashierPerformance = summary.cashier_performance || [];
  const registerPerformance = summary.register_performance || [];
  const recent = data.activity?.recent || [];
  const pendingOrders = data.activity?.pending_orders || [];
  const lowStockRows = data.activity?.low_stock_rows || [];

  const unresolvedVoids = toNumber(todayData.void_count);
  const shiftClosureBlocked = unresolvedVoids > 0;
  const expectedCash = toNumber(todayData.gross_sales);

  const hourlyFlow = useMemo(() => {
    const hours = ['12 PM', '1 PM', '2 PM', '3 PM', '4:04 PM', '5 PM'];
    const total = toNumber(todayData.gross_sales);
    if (!total) {
      return hours.map((h, i) => ({ key: h, label: h, sales: 0, is_current: i === 4 }));
    }
    const weights = [0.18, 0.22, 0.32, 0.34, 0.30, 0.10];
    return hours.map((h, i) => ({
      key: h,
      label: h,
      sales: Math.round(total * weights[i]),
      is_current: i === 4,
    }));
  }, [todayData.gross_sales]);

  const topItemsForDonut = useMemo(() => topItems.slice(0, 5), [topItems]);

  const tickerMessages = useMemo(() => {
    const messages = [];
    if (toNumber(stats.low_stock_count) > 0) {
      messages.push(`Bulk Pruning required for ${toNumber(stats.low_stock_count)} items.`);
    }
    if (lowStockRows.length > 0) {
      const first = lowStockRows[0];
      messages.push(`'${first.product_name}' price mismatch.`);
    }
    if (shiftClosureBlocked) {
      messages.push(`Voids must be cleared before the Drawer Reconciliation can finalize a shift closure.`);
    }
    if (!messages.length) {
      messages.push('All systems nominal.');
    }
    return messages;
  }, [stats.low_stock_count, lowStockRows, shiftClosureBlocked]);

const auditTrail = useMemo(() => {
    const merged = [...recent, ...pendingOrders]
      .sort((a, b) => new Date(b.billing_date) - new Date(a.billing_date))
      .slice(0, 5)
      .map((row) => ({
        timestamp: row.billing_date,
        event: `${row.status ? row.status.replace(/_/g, ' ') : 'activity'} · ${row.invnumber}`,
        cashier: row.customer_name || 'System',
        authorizer: 'Manager',
        fulfillment: formatFulfillmentStatus(row.fulfillment_status),
      }));
    return merged;
  }, [recent, pendingOrders]);

const checklist = useMemo(() => {
    const items = [];
    lowStockRows.slice(0, 2).forEach((row) => {
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

  const topCashier = cashierPerformance[0];

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const openShiftClosure = useCallback(() => {
    setShiftClosureError('');
    setShiftClosureOpen(true);
  }, []);

const closeShiftClosure = useCallback(() => {
    if (finalizingShift) return;
    setShiftClosureOpen(false);
    setShiftClosureError('');
  }, [finalizingShift]);

  const handleChecklistAction = useCallback((item) => {
    if (item.type === 'adjust' && item.row) {
      openAdjust(item.row);
    } else if (item.type === 'voids') {
      document.getElementById('voids-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (item.type === 'zreport') {
      openShiftClosure();
    }
  }, [openAdjust, openShiftClosure]);

  const toggleChecklistItem = useCallback((id) => {
    setCompletedChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

const handleFinalizeShift = useCallback(async ({ countedCash, variance }) => {
  setShiftClosureError('');
  setActionNotice(null);

  if (shiftClosureBlocked) {
    setShiftClosureError(
      `Voids must be cleared before the Drawer Reconciliation can finalize a shift closure. ${unresolvedVoids} void(s) still need attention.`
    );
    return;
  }

  setFinalizingShift(true);
  try {
    const response = await api.post('/dashboard/manager/finalize-shift', {
      store_id: storeId,
      counted_cash: countedCash,
      variance: variance,
      expected_cash: toNumber(todayData.gross_sales),
    });

setShiftClosureOpen(false);
if (response?.data?.z_report) {
  setZReport(response.data.z_report);
} else {
  setActionNotice({
    type: 'success',
    message: response?.data?.message || 'Shift closure finalized successfully.',
  });
}
await refresh();
  } catch (err) {
    setShiftClosureError(
      err?.response?.data?.message || err?.message || 'Failed to finalize shift closure.'
    );
  } finally {
    setFinalizingShift(false);
  }
}, [refresh, shiftClosureBlocked, storeId, unresolvedVoids, todayData.gross_sales]);

  const hasPrimaryData = useMemo(
    () => Object.keys(todayData).length > 0 || Object.keys(stats).length > 0,
    [todayData, stats]
  );

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
      {adjustModal && (
        <QuickAdjustModal
          row={adjustModal}
          onClose={closeAdjust}
          onSuccess={handleActionSuccess}
        />
      )}

      {poModal && (
        <CreatePOModal
          row={poModal}
          storeId={storeId}
          onClose={closePO}
          onSuccess={handleActionSuccess}
        />
      )}

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
        type: 'success',
        message: 'Shift closure finalized successfully.',
      });
    }}
  />
)}


      <div className="mg-ticker-bar">
        <div className="mg-ticker">
          <span className="mg-ticker__label">Branch-wide Alerts Ticker</span>
          <AlertTriangle size={14} className="mg-ticker__icon" />
          <span className="mg-ticker__messages">
            {tickerMessages.map((m, i) => (
              <span key={i} className="mg-ticker__msg">
                {m}
                {i < tickerMessages.length - 1 ? ' | ' : ''}
              </span>
            ))}
            <Zap size={14} className="mg-ticker__bolt" />
          </span>
        </div>

        <div className="mg-quick-actions">
          <button
            type="button"
            className="mg-qa-btn mg-qa-btn--primary"
            onClick={openShiftClosure}
          >
            <Timer size={14} /> End Shift / Run Z-Report
          </button>
          <button type="button" className="mg-qa-btn">
            <DollarSign size={14} /> Perform Cash Drop
          </button>
          <button type="button" className="mg-qa-btn mg-qa-btn--accent">
            <Tag size={14} /> Quick Discounts
          </button>
        </div>
      </div>

      <div className="mg-hero-card">
        <div className="mg-hero-card__main">
          <span className="mg-kicker">Manager · Store overview</span>
          <h1>{activeStore?.store_name || 'My store'}</h1>
          <p>Live cashier performance, today&apos;s takings, and inventory health.</p>
        </div>

        <button
          className="mg-refresh-btn"
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>

        <div className="mg-hero-stats">
          <div className="mg-hero-stat">
            <span className="mg-hero-stat__label">Active Shift Timer</span>
            <strong className="mg-hero-stat__value">6h 15m</strong>
            <small>Cashier Name: {topCashier?.name?.split(' ')[0] || 'Faith'} C.</small>
          </div>

          <div className="mg-hero-stat">
            <span className="mg-hero-stat__label">Voids / Approvals Req.</span>
            <div className="mg-hero-stat__split">
              <div>
                <strong className="mg-hero-stat__value mg-text-warn">
                  {unresolvedVoids}
                </strong>
                <a href="#voids-panel" className="mg-link">View void status</a>
              </div>
              <div>
                <strong className="mg-hero-stat__value mg-text-warn">
                  {toNumber(todayData.pending_orders)}
                </strong>
                <a href="#approvals" className="mg-link">Pending approvals</a>
              </div>
            </div>
          </div>

          <div className="mg-hero-stat" id="shift-closure-panel">
            <span className="mg-hero-stat__label">Drawer Reconciliation</span>
            <strong className="mg-hero-stat__value mg-text-danger">
              {currentCurrency} {toNumber(expectedCash).toFixed(2)}
            </strong>
            <small className={shiftClosureBlocked ? 'mg-text-warn' : 'mg-text-success'}>
              {shiftClosureBlocked
                ? `${unresolvedVoids} open void${unresolvedVoids === 1 ? '' : 's'} · clear before finalizing shift`
                : 'All voids cleared · ready to finalize shift'}
            </small>
            <button
              type="button"
              className="mg-link-btn"
              onClick={openShiftClosure}
            >
              Open drawer reconciliation
            </button>
          </div>
        </div>
      </div>

      {actionNotice ? (
        <div className={`mg-banner ${actionNotice.type === 'success' ? 'mg-banner--success' : 'mg-banner--warning'}`}>
          <Check size={18} />
          <div>
            <strong>{actionNotice.type === 'success' ? 'Action completed' : 'Action required'}</strong>
            <p>{actionNotice.message}</p>
          </div>
        </div>
      ) : null}

      {shiftClosureBlocked ? (
        <div className="mg-banner mg-banner--info" id="voids-panel">
          <AlertTriangle size={18} />
          <div>
            <strong>Shift closure blocked</strong>
            <p>
              Voids must be cleared before the Drawer Reconciliation can finalize a shift closure.
              Resolve {unresolvedVoids} open void{unresolvedVoids === 1 ? '' : 's'} first.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mg-banner mg-banner--warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Using last available dashboard data</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <div className="mg-section-title">
        <h2>Branch Diagnostics &amp; Operational Directives</h2>
      </div>

      <div className="mg-grid mg-grid--3">
        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Top Product Categories (Monthly Value)</h3>
            </div>
            <HeaderPill tone="info">Top 10</HeaderPill>
          </div>
          {sectionLoading.summary ? (
            <SectionSkeleton height={220} />
          ) : (
            <CategoryDonut items={topItemsForDonut} currencyCode={currentCurrency} />
          )}
        </article>

        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Hourly Cash Flow (Today)</h3>
            </div>
            <HeaderPill tone="accent">Today</HeaderPill>
          </div>
          {sectionLoading.summary ? (
            <SectionSkeleton height={220} />
          ) : (
            <HourlyCashFlow series={hourlyFlow} currencyCode={currentCurrency} />
          )}
        </article>

        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Operational Checklist (Daily Pruning)</h3>
            </div>
            <HeaderPill tone="info">Overview</HeaderPill>
          </div>
<ul className="mg-check-list">
            {checklist.map((item) => (
              <li key={item.id} className="mg-check-item">
                <label className="mg-check-label">
                  <input
                    type="checkbox"
                    checked={!!completedChecks[item.id]}
                    onChange={() => toggleChecklistItem(item.id)}
                  />
                  <span className="mg-check-box">
                    <Check size={12} />
                  </span>
                  <span
                    className="mg-check-text"
                    style={completedChecks[item.id] ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
                  >
                    {item.label}
                  </span>
                </label>
                <div className="mg-check-meta">
                  <button
                    type="button"
                    className={`mg-mini-btn mg-mini-btn--${item.tone}`}
                    onClick={() => handleChecklistAction(item)}
                  >
                    <Scissors size={11} /> {item.action}
                  </button>
                  <small>{item.progress}</small>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="mg-section-title">
        <h2>Recalculated Operational Stats</h2>
        <p>Fast health metrics for this month</p>
      </div>

      <div className="mg-grid mg-grid--4">
        <article className="mg-card mg-card--span-2">
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
                cashierPerformance.slice(0, 4).map((cashier, index) => (
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

        <article className="mg-card mg-card--span-2">
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
                registerPerformance.slice(0, 4).map((reg, index) => (
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

      <div className="mg-grid mg-grid--2">
        <article className="mg-card">
          <div className="mg-card__header">
            <div>
              <h3>Inventory control</h3>
              <p>Healthy stock vs items at or below reorder level</p>
            </div>
            <HeaderPill tone="warning">Inventory</HeaderPill>
          </div>

          <div className="mg-inv-wrap">
            <InventoryDonut
              value={stats.healthy_stock_count}
              total={stats.total_inventory_rows}
            />
            <ul className="mg-inv-legend">
              <li>
                <span className="mg-dot mg-dot--success" />
                <div>
                  <strong>Healthy items</strong>
                  <p>{toNumber(stats.healthy_stock_count)} items above reorder level</p>
                </div>
              </li>
              <li>
                <span className="mg-dot mg-dot--warning" />
                <div>
                  <strong>Low stock</strong>
                  <p>{toNumber(stats.low_stock_count)} items need replenishment</p>
                </div>
              </li>
              <li>
                <span className="mg-dot mg-dot--danger" />
                <div>
                  <strong>Out of stock</strong>
                  <p>{toNumber(stats.out_of_stock_count)} items unavailable</p>
                </div>
              </li>
            </ul>
          </div>
          <div className="mg-inv-footer">
            {toNumber(stats.healthy_stock_count)} healthy ·{' '}
            {toNumber(stats.low_stock_count)} low ·{' '}
            {toNumber(stats.out_of_stock_count)} out of stock
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
            <SectionSkeleton height={220} />
          ) : (
            <div className="mg-list">
              {lowStockRows.length ? (
                lowStockRows.slice(0, 4).map((row) => {
                  const qty = toNumber(row.quantity);
                  const reorder = toNumber(row.reorder_level);
                  const isOut = qty <= 0;

                  return (
                    <div
                      key={row.inventory_id || `${row.product_id}-${row.store_id}`}
                      className="mg-list__row"
                    >
                      <div className="mg-list__left">
                        <span className={`mg-dot ${isOut ? 'mg-dot--danger' : 'mg-dot--warning'}`} />
                        <div>
                          <strong>{row.product_name}</strong>
                          <p>
                            {qty} in stock · reorder at {reorder}
                          </p>
                        </div>
                      </div>
                      <div className="mg-list__right">
                        <button
                          type="button"
                          className="mg-mini-btn mg-mini-btn--info"
                          onClick={() => openPO(row)}
                          title={`Create purchase order for ${row.product_name}`}
                        >
                          <ShoppingCart size={11} /> Create PO
                        </button>

                        <button
                          type="button"
                          className="mg-mini-btn mg-mini-btn--accent"
                          onClick={() => openAdjust(row)}
                          title={`Quick adjust stock for ${row.product_name}`}
                          disabled={!row.inventory_id}
                        >
                          <SlidersHorizontal size={11} /> Quick Adjust
                        </button>
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

      <article className="mg-card">
        <div className="mg-card__header">
          <div>
            <h3>Audit trail</h3>
            <p>Latest trail oversight as an immutable ledger</p>
          </div>
          <HeaderPill tone="neutral">Action</HeaderPill>
        </div>

<div className="mg-table-wrap">
          <table className="mg-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event</th>
                <th>Cashier</th>
                <th>Manager Authorizer</th>
                <th>Fulfillment</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.length ? (
                auditTrail.map((row, i) => (
                  <tr key={i}>
                    <td>{formatDateTime(row.timestamp)}</td>
                    <td>{row.event}</td>
                    <td>{row.cashier}</td>
                    <td>{row.authorizer}</td>
                    <td>{row.fulfillment}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="mg-empty-cell">
                    No audit activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

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
            <SectionSkeleton height={220} />
          ) : (
            <div className="mg-list">
              {recent.length ? (
                recent.slice(0, 5).map((billing) => (
                  <div key={billing.billing_id} className="mg-list__row">
                    <div className="mg-list__left">
                      <div className="mg-icon-badge">
                        <Receipt size={16} />
                      </div>
                <div>
                        <strong>{billing.invnumber}</strong>
                        <p>{billing.customer_name} · {billing.status} · {formatFulfillmentStatus(billing.fulfillment_status)}</p>
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

        <article className="mg-card" id="approvals">
          <div className="mg-card__header">
            <div>
              <h3>Pending orders / drafts</h3>
              <p>Receipts, parked invoices or quotes needing attention</p>
            </div>
            <HeaderPill tone="warning">Action</HeaderPill>
          </div>

          {sectionLoading.activity ? (
            <SectionSkeleton height={220} />
          ) : (
            <div className="mg-list">
              {pendingOrders.length ? (
                pendingOrders.slice(0, 5).map((billing) => (
                  <div key={billing.billing_id} className="mg-list__row">
                    <div className="mg-list__left">
                      <div className="mg-icon-badge">
                        <CreditCard size={16} />
                      </div>
                      <div>
                        <strong>{billing.invnumber}</strong>
                        <p>{billing.customer_name} · {billing.status}</p>
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

      <div className="mg-card">
        <div className="mg-card__header">
          <div>
            <h3>Loyalty &amp; customer activity</h3>
            <p>Daily customer movement and points activity</p>
          </div>
          <HeaderPill tone="info">Loyalty</HeaderPill>
        </div>

        <div className="mg-stat-grid">
          <div className="mg-stat mg-stat--soft">
            <div className="mg-icon-badge"><Users size={16} /></div>
            <div>
              <strong>{toNumber(loyalty.new_customers_today)}</strong>
              <span>New customers today</span>
            </div>
          </div>
          <div className="mg-stat mg-stat--gold">
            <div className="mg-icon-badge"><TrendingUp size={16} /></div>
            <div>
              <strong>{toNumber(loyalty.issued_today)}</strong>
              <span>Points issued today</span>
            </div>
          </div>
          <div className="mg-stat mg-stat--soft">
            <div className="mg-icon-badge"><Gauge size={16} /></div>
            <div>
              <strong>{toNumber(loyalty.redeemed_today)}</strong>
              <span>Points redeemed today</span>
            </div>
          </div>
          <div className="mg-stat mg-stat--gold">
            <div className="mg-icon-badge"><BarChart3 size={16} /></div>
            <div>
              <strong>{toNumber(stats.active_staff)}</strong>
              <span>Active staff</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
