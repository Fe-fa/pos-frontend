import { memo, useCallback } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { getInventoryStatus } from './inventoryHelpers';
import PaginationControls from './PaginationControls';
import Spinner from './Spinner';

// ─── InventoryRow ─────────────────────────────────────────────────────────────
// Memoized so only the row whose data changed re-renders, not the whole table.

const InventoryRow = memo(function InventoryRow({ row, canManage, deletePending, onEdit, onDelete }) {
  const status = getInventoryStatus(row);

  const handleEdit = useCallback(() => onEdit(row), [onEdit, row]);
  const handleDelete = useCallback(() => onDelete(row.inventory_id), [onDelete, row.inventory_id]);

  return (
    <tr>
      <td>
        <div className="catalog-item-copy">
          <strong>{row.product?.product_name || 'Unknown product'}</strong>
          <span>{row.product?.sku || 'No SKU'}</span>
        </div>
      </td>
      <td>{row.batch_no || '—'}</td>
      <td>{row.quantity}</td>
      <td>{row.reorder_level || 0}</td>
      <td>
        <span className={`stock-pill ${status.tone}`}>{status.label}</span>
      </td>
      <td>
        <div className="catalog-action-group">
          <button
            type="button"
            className="catalog-icon-btn"
            onClick={handleEdit}
            title="Edit"
            disabled={!canManage}
          >
            <Edit size={16} />
          </button>
          <button
            type="button"
            className="catalog-icon-btn danger"
            onClick={handleDelete}
            title="Delete"
            disabled={!canManage || deletePending}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
});

// ─── InventoryTable ───────────────────────────────────────────────────────────

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
              <th>Batch no</th>
              <th>Quantity</th>
              <th>Reorder level</th>
              <th>Status</th>
              <th className="align-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {!storeId ? (
              <tr>
                <td colSpan="6" className="catalog-empty-cell">
                  Select a store first.
                </td>
              </tr>
            ) : isLoading && !rows.length ? (
              <tr>
                <td colSpan="6" className="catalog-empty-cell" style={{ padding: '32px 0' }}>
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
                <td colSpan="6" className="catalog-empty-cell">
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
