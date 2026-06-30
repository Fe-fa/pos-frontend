import {
  X,
  RefreshCw,
  SlidersHorizontal,
  Edit,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  FileText,
} from 'lucide-react';
import Spinner from './Spinner';

// ── Mode config ────────────────────────────────────────────────────────────────
const MODE_CONFIG = {
  edit: {
    icon: Edit,
    title: 'Edit inventory line',
    subtitle: 'Update the reorder threshold or batch reference for this FIFO layer.',
    qtyLabel: null,
    qtyHelp: null,
    submitLabel: 'Save changes',
    batchDisabled: false,
    accentColor: '#0E84C3',
    accentBg: '#eef8fe',
    accentBorder: '#cfe7fb',
    noteLabel: 'Edit description',
    noteHelp: 'Optional but recommended. Explain why this inventory line was updated.',
    notePlaceholder: 'Example: corrected reorder level after supplier review',
  },
  restock: {
    icon: RefreshCw,
    title: 'Restock — add stock',
    subtitle: 'Enter how many units are being added to this FIFO layer.',
    qtyLabel: 'Quantity to add',
    qtyHelp: 'This amount will be added on top of the current quantity.',
    submitLabel: 'Add stock',
    batchDisabled: true,
    accentColor: '#218353',
    accentBg: '#e2f5ec',
    accentBorder: '#c3edd7',
    noteLabel: 'Restock description',
    noteHelp: 'Optional note for delivery, GRN, supplier note, or receiving context.',
    notePlaceholder: 'Example: restocked from supplier delivery INV-2048',
  },
  adjust: {
    icon: SlidersHorizontal,
    title: 'Quick adjust',
    subtitle: 'Correct the quantity on this layer. Enter the amount you want to add or remove.',
    qtyLabel: 'Adjustment amount',
    qtyHelp: 'Use a positive number to add stock, negative to remove (e.g. −5 for a shrinkage correction).',
    submitLabel: 'Apply adjustment',
    batchDisabled: true,
    accentColor: '#b56d00',
    accentBg: '#fff5e7',
    accentBorder: '#f2ddb2',
    noteLabel: 'Adjustment description',
    noteHelp: 'Explain the reason for this correction so it stays clear in audit history.',
    notePlaceholder: 'Example: damaged items removed after stock count',
  },
};

// ── History tone helpers ───────────────────────────────────────────────────────
function getHistoryIcon(qty) {
  const n = Number(qty || 0);
  if (n > 0) return { Icon: TrendingUp, color: '#218353', bg: '#e2f5ec', border: '#c3edd7' };
  if (n < 0) return { Icon: TrendingDown, color: '#b02525', bg: '#fde8e8', border: '#f5c2c2' };
  return { Icon: Minus, color: '#6b7280', bg: '#f1f3f5', border: '#e2e5e8' };
}

function getEventLabel(changeType) {
  const map = {
    sale: 'Sale',
    stock_out: 'Sale',
    fifo_out: 'Sale',
    consume: 'Sale',
    stock_in: 'Restock',
    restock: 'Restock',
    opening_stock: 'Opening Stock',
    return: 'Return',
    adjustment: 'Adjustment',
    edit: 'Edit',
  };

  if (!changeType) return '—';

  return (
    map[changeType.toLowerCase()] ||
    changeType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Mini history row ───────────────────────────────────────────────────────────
function HistoryMiniRow({ entry }) {
  const qty = Number(entry.quantity_changed || 0);
  const { Icon, color, bg, border } = getHistoryIcon(qty);
  const label = getEventLabel(entry.change_type);
  const userName = entry.user?.first_name
    ? `${entry.user.first_name} ${entry.user.last_name || ''}`.trim()
    : entry.user?.email || 'System';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'var(--panel)',
        border: '1px solid var(--line)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          flexShrink: 0,
          background: bg,
          border: `1px solid ${border}`,
          display: 'grid',
          placeItems: 'center',
          color,
        }}
      >
        <Icon size={13} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
            {label}
          </span>

          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              color,
              padding: '2px 7px',
              borderRadius: 999,
              background: bg,
              border: `1px solid ${border}`,
            }}
          >
            {qty > 0 ? `+${qty}` : qty}
          </span>
        </div>

        <div
          style={{
            fontSize: '0.74rem',
            color: 'var(--muted)',
            marginTop: 2,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>{formatDate(entry.created_at)}</span>
          {entry.reference && <span>· {entry.reference}</span>}
          <span>· {userName}</span>
        </div>

        {entry.reason ? (
          <div
            style={{
              marginTop: 5,
              fontSize: '0.76rem',
              color: 'var(--text)',
              lineHeight: 1.4,
            }}
          >
            {entry.reason}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function InventoryFormModal({
  editingId,
  mode,
  currentQty,
  form,
  setForm,
  products,
  productsLoading,
  modalError,
  saving,
  canManage,
  onSubmit,
  onClose,
  editingRow,
  recentHistory,
  historyLoading,
  historySearch,
  onHistorySearchChange,
  description,
  onDescriptionChange,
}) {
  const isCreate = !editingId;

  const cfg = isCreate
    ? {
        icon: null,
        title: 'Receive stock',
        subtitle: 'Each stock receipt creates a new FIFO inventory layer.',
        qtyLabel: 'Incoming quantity',
        qtyHelp: null,
        submitLabel: 'Receive stock',
        batchDisabled: false,
        accentColor: '#0E84C3',
        accentBg: '#eef8fe',
        accentBorder: '#cfe7fb',
        noteLabel: 'Receiving description',
        noteHelp: 'Optional note for the stock receipt.',
        notePlaceholder: 'Example: opening stock or first supplier delivery',
      }
    : (MODE_CONFIG[mode] ?? MODE_CONFIG.edit);

  const Icon = cfg.icon;

  const qtyMin = mode === 'adjust' ? undefined : 1;
  const qtyStep = 1;

  const product = editingRow?.product;
  const productName = product?.product_name || '';
  const productSku = product?.sku || '';
  const productCategory = product?.category?.category_name || '';
  const productImage = product?.image_url;

  const hasProductInfo = !isCreate && productName;
  const hasHistory = Array.isArray(recentHistory) && recentHistory.length > 0;
  const showHistory = !isCreate && (mode === 'edit' || mode === 'restock' || mode === 'adjust');

  return (
    <div className="modal-backdrop" onClick={() => onClose(saving)}>
      <div
        className="modal-card form-modal-card"
        style={{ maxWidth: 600 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Accent stripe ── */}
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, ${cfg.accentColor}, ${cfg.accentBg})`,
            borderRadius: '18px 18px 0 0',
          }}
        />

        {/* ── Header ── */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {Icon && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  flexShrink: 0,
                  marginTop: 2,
                  background: cfg.accentBg,
                  border: `1px solid ${cfg.accentBorder}`,
                  color: cfg.accentColor,
                }}
              >
                <Icon size={16} />
              </span>
            )}

            <div>
              <h3 style={{ margin: 0 }}>{cfg.title}</h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                {cfg.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={() => onClose(saving)}
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-content" style={{ display: 'grid', gap: 18 }}>
          {/* ── Product info banner ── */}
          {hasProductInfo && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                background: cfg.accentBg,
                border: `1px solid ${cfg.accentBorder}`,
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 10,
                  flexShrink: 0,
                  overflow: 'hidden',
                  border: '1px solid var(--line)',
                  background: 'var(--white)',
                }}
              >
                {productImage ? (
                  <img
                    src={productImage}
                    alt={productName}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'grid',
                      placeItems: 'center',
                      background: `linear-gradient(135deg, ${cfg.accentColor}22, ${cfg.accentBg})`,
                      color: cfg.accentColor,
                      fontWeight: 800,
                      fontSize: '1.1rem',
                    }}
                  >
                    {productName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Product meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong
                  style={{
                    fontSize: '0.95rem',
                    color: 'var(--text)',
                    display: 'block',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {productName}
                </strong>

                <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                  {productSku && (
                    <span style={{ fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 600 }}>
                      SKU: {productSku}
                    </span>
                  )}

                  {productCategory && (
                    <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                      · {productCategory}
                    </span>
                  )}
                </div>
              </div>

              {/* Current qty chip */}
              {typeof currentQty !== 'undefined' && (
                <div
                  style={{
                    textAlign: 'center',
                    flexShrink: 0,
                    padding: '6px 14px',
                    borderRadius: 10,
                    background: 'var(--white)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--muted)',
                    }}
                  >
                    On hand
                  </div>

                  <div
                    style={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: cfg.accentColor,
                      lineHeight: 1.1,
                    }}
                  >
                    {currentQty}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Form ── */}
          <form className="catalog-form-grid" onSubmit={onSubmit}>
            {/* Product selector — only on create */}
            {isCreate && (
              <label className="span-2">
                Product
                <select
                  className="select-input"
                  value={form.product_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, product_id: e.target.value }))}
                  required
                  disabled={productsLoading}
                >
                  <option value="">
                    {productsLoading ? 'Loading products…' : 'Select product'}
                  </option>
                  {products.map((product) => (
                    <option key={product.product_id} value={product.product_id}>
                      {product.product_name} ({product.sku})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Batch No */}
            <label>
              Batch no
              <input
                className="text-input"
                type="text"
                placeholder="e.g. BATCH-2026-001"
                value={form.batch_no}
                onChange={(e) => setForm((prev) => ({ ...prev, batch_no: e.target.value }))}
                disabled={cfg.batchDisabled}
              />
            </label>

            {/* Quantity */}
            {cfg.qtyLabel ? (
              <label>
                {cfg.qtyLabel}
                <input
                  className="text-input"
                  type="number"
                  min={qtyMin}
                  step={qtyStep}
                  placeholder={mode === 'adjust' ? 'e.g. −5 or +10' : ''}
                  value={form.quantity}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  required
                  autoFocus
                />
                {cfg.qtyHelp && (
                  <span
                    className="muted"
                    style={{ fontSize: '0.76rem', marginTop: 4, display: 'block' }}
                  >
                    {cfg.qtyHelp}
                  </span>
                )}
              </label>
            ) : (
              <div />
            )}

            {/* Reorder Level */}
            <label className="span-2">
              Reorder level
              <input
                className="text-input"
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reorder_level: e.target.value }))
                }
              />
            </label>

            {/* Description / Reason */}
            <label className="span-2">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} />
                {cfg.noteLabel}
              </span>

              <textarea
                className="text-input"
                rows={3}
                placeholder={cfg.notePlaceholder}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                maxLength={255}
                style={{ resize: 'vertical', minHeight: 92 }}
              />

              {cfg.noteHelp ? (
                <span
                  className="muted"
                  style={{ fontSize: '0.76rem', marginTop: 4, display: 'block' }}
                >
                  {cfg.noteHelp}
                </span>
              ) : null}
            </label>

            {modalError ? <p className="form-error span-2">{modalError}</p> : null}

            {/* Footer actions */}
            <div className="catalog-modal-actions span-2">
              <button
                type="button"
                className="ghost-button"
                onClick={() => onClose(saving)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="catalog-primary-btn"
                type="submit"
                disabled={saving || !canManage}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: cfg.accentColor,
                  boxShadow: `0 8px 18px ${cfg.accentColor}30`,
                }}
              >
                {saving ? (
                  <>
                    <Spinner size={14} />
                    Saving…
                  </>
                ) : (
                  cfg.submitLabel
                )}
              </button>
            </div>
          </form>

          {/* ── Recent history ── */}
          {showHistory && (
            <div
              style={{
                borderTop: '1px solid var(--line)',
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  gap: 10,
                }}
              >
<div>
  <strong style={{ fontSize: '0.86rem', color: 'var(--text)' }}>
    Product activity
  </strong>
  <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.76rem' }}>
    All movements for this product across inventory layers
  </p>
</div>
                {historyLoading && <Spinner size={14} />}
              </div>

              <label
                className="catalog-search"
                style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}
              >
                <span className="catalog-search-icon">
                  <Search size={15} />
                </span>
                <input
                  className="text-input"
                  type="text"
                  placeholder="Search history by date (2026, 2026-06, 2026-06-29), ref, batch"
                  value={historySearch}
                  onChange={onHistorySearchChange}
                />
              </label>

              {historyLoading && !hasHistory ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <Spinner size={18} style={{ margin: '0 auto' }} />
                </div>
              ) : hasHistory ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {recentHistory.map((entry, i) => (
                    <HistoryMiniRow key={entry.inventory_history_id ?? i} entry={entry} />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '14px 0',
                    color: 'var(--muted)',
                    fontSize: '0.82rem',
                    border: '1px dashed var(--line)',
                    borderRadius: 10,
                  }}
                >
                  No history recorded yet for this product.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
