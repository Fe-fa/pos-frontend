import { memo, useCallback } from 'react';
import { Edit, Trash2, RefreshCw, SlidersHorizontal, Eye, AlertTriangle } from 'lucide-react';
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
  // Critical Low: quantity > 0 but <= reorder_level (and reorder > 0)
  if (reorder > 0 && quantity <= reorder) {
    return { label: 'Critical Low', tone: 'critical', css: 'inv-pill-critical' };
  }
  // Low Stock: between reorder+1 and 12
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
const InventoryRow = memo(function InventoryRow({ row, canManage, deletePending, onEdit, onDelete }) {
  const status = getStatusPill(row);
  const showWarning = shouldShowWarning(row);

  const handleEdit = useCallback(() => onEdit(row), [onEdit, row]);
  const handleDelete = useCallback(() => onDelete(row.inventory_id), [onDelete, row.inventory_id]);

  const productName = row.product?.product_name || 'Unknown product';
  const productSku = row.product?.sku || 'No SKU';
  const categoryName = row.product?.category?.category_name || 'Category';
  const supplierName = row.supplier_name || row.product?.supplier_name || 'Unity Chepkirui';
  const imageUrl = row.product?.image_url;

  return (
    <tr>
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
          {/* Edit */}
          <button
            type="button"
            className="catalog-icon-btn"
            onClick={handleEdit}
            title="Edit"
            disabled={!canManage}
          >
            <Edit size={15} />
          </button>

          {/* Restock (add stock) — also opens the edit/update modal */}
          <button
            type="button"
            className="catalog-icon-btn"
            onClick={handleEdit}
            title="Restock"
            disabled={!canManage}
          >
            <RefreshCw size={15} />
          </button>

          {/* Adjust */}
          <button
            type="button"
            className="catalog-icon-btn"
            onClick={handleEdit}
            title="Adjust"
            disabled={!canManage}
          >
            <SlidersHorizontal size={15} />
          </button>

          {/* View / Delete */}
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
}) {
  return (
    <article className="catalog-table-card">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
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
                <td colSpan="8" className="catalog-empty-cell">
                  Select a store first.
                </td>
              </tr>
            ) : isLoading && !rows.length ? (
              <tr>
                <td colSpan="8" className="catalog-empty-cell" style={{ padding: '32px 0' }}>
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
                />
              ))
            ) : (
              <tr>
                <td colSpan="8" className="catalog-empty-cell">
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
