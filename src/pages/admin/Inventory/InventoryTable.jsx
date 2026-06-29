import { memo, useCallback } from 'react';
import { Edit, Trash2, RefreshCw, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { getInventoryStatus } from './inventoryHelpers';
import PaginationControls from './PaginationControls';
import Spinner from './Spinner';

// ─── Status pill config ────────────────────────────────────────────────────────
function getStatusPill(row) {
  const quantity = Number(row?.quantity || 0);
  const reorder = Number(row?.reorder_level || 0);

  if (quantity <= 0) {
    return { label: 'Out of Stock', tone: 'out', css: 'inv-pill-out' };
  }
  if (reorder > 0 && quantity <= reorder) {
    return { label: 'Critical Low', tone: 'critical', css: 'inv-pill-critical' };
  }
  if (quantity <= 12) {
    return { label: 'Low Stock', tone: 'low', css: 'inv-pill-low' };
  }
  return { label: 'Healthy', tone: 'normal', css: 'inv-pill-healthy' };
}

function shouldShowWarning(row) {
  const quantity = Number(row?.quantity || 0);
  const reorder = Number(row?.reorder_level || 0);
  return quantity <= 0 || (reorder > 0 && quantity <= reorder) || quantity <= 12;
}

// ─── InventoryRow ──────────────────────────────────────────────────────────────
const InventoryRow = memo(function InventoryRow({ row, selected, onToggle,canManage, deletePending, onEdit, onDelete }) {
  const status = getStatusPill(row);
  const showWarning = shouldShowWarning(row);

  // ── UPDATED: each button gets its own handler with the correct mode ──
  const handleEdit    = useCallback(() => onEdit(row, 'edit'),    [onEdit, row]);
  const handleRestock = useCallback(() => onEdit(row, 'restock'), [onEdit, row]);
  const handleAdjust  = useCallback(() => onEdit(row, 'adjust'),  [onEdit, row]);
  const handleDelete  = useCallback(() => onDelete(row.inventory_id), [onDelete, row.inventory_id]);

  const productName  = row.product?.product_name || 'Unknown product';
  const productSku   = row.product?.sku || 'No SKU';
  const categoryName = row.product?.category?.category_name || 'Category';
  const supplierName = row.supplier_name || row.product?.supplier_name || 'Unity Chepkirui';
  const imageUrl     = row.product?.image_url;

  return (
 <tr className={selected ? 'inv-row--selected' : ''}>
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(row.inventory_id)}
        />
      </td>
      {/* Product — thumbnail + name + SKU */}
      <td>
        <div className="inv-product-cell">
          <div className="inv-product-thumb">
            {imageUrl ? (
              <img src={imageUrl} alt={productName} className="inv-product-img" />
            ) : (
              <div className="inv-product-img-placeholder">
                <span>{productName.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
          <div className="catalog-item-copy">
            <strong>{productName}</strong>
            <span>{productSku}</span>
          </div>
        </div>
      </td>

      {/* Category */}
      <td>{categoryName}</td>

      {/* Batch No */}
      <td>{row.batch_no || '—'}</td>

      {/* Current Qty — with optional warning icon */}
      <td>
        <div className="inv-qty-cell">
          <span>{row.quantity}</span>
          {showWarning && (
            <AlertTriangle size={14} className="inv-qty-warning" />
          )}
        </div>
      </td>

      {/* Reorder Level */}
      <td>{row.reorder_level || 0}</td>

      {/* Supplier Name */}
      <td>{supplierName}</td>

      {/* Status */}
      <td>
        <span className={`inv-status-pill ${status.css}`}>{status.label}</span>
      </td>

      {/* Actions */}
      <td>
        <div className="catalog-action-group">
          {/* Edit — opens modal in 'edit' mode: change reorder level / batch ref */}
          <button
            type="button"
            className="catalog-icon-btn"
            onClick={handleEdit}
            title="Edit"
            disabled={!canManage}
          >
            <Edit size={15} />
          </button>

          {/* Restock — opens modal in 'restock' mode: add qty to this FIFO layer */}
          <button
            type="button"
            className="catalog-icon-btn"
            onClick={handleRestock}
            title="Restock"
            disabled={!canManage}
          >
            <RefreshCw size={15} />
          </button>

          {/* Adjust — opens modal in 'adjust' mode: signed delta correction */}
          <button
            type="button"
            className="catalog-icon-btn"
            onClick={handleAdjust}
            title="Adjust"
            disabled={!canManage}
          >
            <SlidersHorizontal size={15} />
          </button>

          {/* Delete */}
          <button
            type="button"
            className="catalog-icon-btn danger"
            onClick={handleDelete}
            title="Delete"
            disabled={!canManage || deletePending}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
});

// ─── InventoryTable ────────────────────────────────────────────────────────────
export default function InventoryTable({
  storeId,
  isLoading,
  isFetching,
  rows,
  pagination,
  canManage,
  deletePending,
  onEdit,
  onDelete,
  onPreviousPage,
  onNextPage,
  // ← ADD THESE THREE:
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.inventory_id));

  return (
    <article className="catalog-table-card">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {/* ← SELECT-ALL CHECKBOX HERE */}
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => allSelected ? onClearSelection() : onSelectAll(rows)}
                />
              </th>
              <th>Product</th>
              <th>Category</th>
              <th>Batch No</th>
              <th>Current Qty</th>
              <th>Reorder Level</th>
              <th>Supplier Name</th>
              <th>Status</th>
              <th className="align-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {!storeId ? (
              <tr>
                <td colSpan="9" className="catalog-empty-cell">
                  Select a store first.
                </td>
              </tr>
            ) : isLoading && !rows.length ? (
              <tr>
                <td colSpan="9" className="catalog-empty-cell" style={{ padding: '32px 0' }}>
                  <Spinner
                    size={20}
                    style={{ margin: '0 auto', display: 'block', color: 'var(--color-text-secondary)' }}
                  />
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <InventoryRow
                  key={row.inventory_id}
                  row={row}
                  canManage={canManage}
                  deletePending={deletePending}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  // ← ADD THESE TWO:
                  selected={selectedIds.has(row.inventory_id)}
                  onToggle={onToggleSelect}
                />
              ))
            ) : (
              <tr>
                <td colSpan="9" className="catalog-empty-cell">
                  No inventory rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {storeId ? (
        <PaginationControls
          pagination={pagination}
          isFetching={isFetching}
          onPrevious={onPreviousPage}
          onNext={onNextPage}
        />
      ) : null}
    </article>
  );
}