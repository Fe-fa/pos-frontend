import { X } from 'lucide-react';
import Spinner from './Spinner';

export default function InventoryFormModal({
  editingId,
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
  return (
    <div className="modal-backdrop" onClick={() => onClose(saving)}>
      <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{editingId ? 'Update stock' : 'Receive stock'}</h3>
            <p className="muted">
              {editingId
                ? 'Update quantity, reorder threshold, and batch number.'
                : 'Each stock receipt creates a new FIFO inventory layer.'}
            </p>
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

        <div className="modal-content">
          <form className="catalog-form-grid" onSubmit={onSubmit}>
            <label className="span-2">
              Product
              <select
                className="select-input"
                value={form.product_id}
                onChange={(e) => setForm((prev) => ({ ...prev, product_id: e.target.value }))}
                required
                disabled={Boolean(editingId) || productsLoading}
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

            <label>
              Batch no
              <input
                className="text-input"
                type="text"
                placeholder="e.g. BATCH-2026-001"
                value={form.batch_no}
                onChange={(e) => setForm((prev) => ({ ...prev, batch_no: e.target.value }))}
                disabled={Boolean(editingId)}
              />
            </label>

            <label>
              {editingId ? 'Quantity to add' : 'Incoming quantity'}
              <input
                className="text-input"
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                required
              />
            </label>

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
                ) : editingId ? (
                  'Update inventory'
                ) : (
                  'Receive stock'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
