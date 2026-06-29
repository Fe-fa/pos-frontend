import { X, RefreshCw, SlidersHorizontal, Edit } from 'lucide-react';
import Spinner from './Spinner';

// ── Mode config ────────────────────────────────────────────────────────────────
const MODE_CONFIG = {
  edit: {
    icon: Edit,
    title: 'Edit inventory line',
    subtitle: 'Update the reorder threshold or batch reference for this FIFO layer.',
    qtyLabel: null,           // quantity field hidden in edit mode
    qtyHelp: null,
    submitLabel: 'Save changes',
    batchDisabled: false,
  },
  restock: {
    icon: RefreshCw,
    title: 'Restock — add stock',
    subtitle: 'Enter how many units are being added to this FIFO layer.',
    qtyLabel: 'Quantity to add',
    qtyHelp: 'This amount will be added on top of the current quantity.',
    submitLabel: 'Add stock',
    batchDisabled: true,
  },
  adjust: {
    icon: SlidersHorizontal,
    title: 'Quick adjust',
    subtitle: 'Correct the quantity on this layer. Enter the amount you want to add or remove.',
    qtyLabel: 'Adjustment amount',
    qtyHelp: 'Use a positive number to add stock, negative to remove (e.g. −5 for a shrinkage correction).',
    submitLabel: 'Apply adjustment',
    batchDisabled: true,
  },
};

export default function InventoryFormModal({
  editingId,
  mode,           // 'edit' | 'restock' | 'adjust' | null (null falls back to create)
  currentQty,     // pass the row's current quantity so we can show it
  form,
  setForm,
  products,
  productsLoading,
  modalError,
  saving,
  canManage,
  onSubmit,
  onClose,
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
      }
    : (MODE_CONFIG[mode] ?? MODE_CONFIG.edit);

  const Icon = cfg.icon;

  // Adjust mode allows negative numbers; restock/create require min=1
  const qtyMin = mode === 'adjust' ? undefined : 1;
  const qtyStep = mode === 'adjust' ? 1 : 1;

  return (
    <div className="modal-backdrop" onClick={() => onClose(saving)}>
      <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {Icon && (
              <span
                className="modal-mode-icon"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--color-surface-raised, #f3f4f6)',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <Icon size={16} />
              </span>
            )}
            <div>
              <h3 style={{ margin: 0 }}>{cfg.title}</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>{cfg.subtitle}</p>
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

        {/* ── Body ── */}
        <div className="modal-content">
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

            {/* Current qty read-only chip — shown when editing */}
            {!isCreate && typeof currentQty !== 'undefined' && (
              <div
                className="span-2"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--color-surface-raised, #f3f4f6)',
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span>Current quantity on this layer:</span>
                <strong style={{ color: 'var(--color-text)', fontSize: 15 }}>{currentQty}</strong>
              </div>
            )}

            {/* Batch No — disabled when restocking/adjusting */}
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

            {/* Quantity — hidden for pure edit mode, shown for everything else */}
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
                  <span className="muted" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                    {cfg.qtyHelp}
                  </span>
                )}
              </label>
            ) : (
              /* Spacer so the grid stays 2-col */
              <div />
            )}

            {/* Reorder Level — always shown */}
            <label className="span-2">
              Reorder level
              <input
                className="text-input"
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(e) => setForm((prev) => ({ ...prev, reorder_level: e.target.value }))}
              />
            </label>

            {modalError ? <p className="form-error span-2">{modalError}</p> : null}

            {/* ── Footer actions ── */}
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
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
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
        </div>
      </div>
    </div>
  );
}