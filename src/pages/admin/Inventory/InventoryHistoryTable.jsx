import { memo } from 'react';
import { getHistoryTone, formatSignedQty } from './inventoryHelpers';
import PaginationControls from './PaginationControls';
import Spinner from './Spinner';

// ─── Event type label map ──────────────────────────────────────────────────────
function getEventTypeLabel(changeType) {
  const map = {
    sale: 'Sale',
    stock_out: 'Sale',
    stock_in: 'Restock',
    restock: 'Restock',
    opening_stock: 'Opening Stock',
    return: 'Return',
    adjustment: 'Adjustment',
    fifo_out: 'Sale',
    consume: 'Sale',
  };
  if (!changeType) return '—';
  return map[changeType.toLowerCase()] || changeType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── HistoryRow ────────────────────────────────────────────────────────────────
const HistoryRow = memo(function HistoryRow({ row }) {
  const eventLabel = getEventTypeLabel(row.change_type);
  const tone = getHistoryTone(row.quantity_changed);

  const userName =
    row.user?.full_name ||
    [row.user?.first_name, row.user?.last_name].filter(Boolean).join(' ') ||
    row.user?.name ||
    row.user?.email ||
    'System';

  return (
    <tr>
      {/* Timestamp */}
      <td style={{ whiteSpace: 'nowrap' }}>
        {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
      </td>

      {/* Event Type */}
      <td>
        <span className={`inv-event-pill inv-event-${tone}`}>{eventLabel}</span>
      </td>

      {/* Product */}
      <td>
        <div className="catalog-item-copy">
          <strong>{row.product?.product_name || 'Unknown product'}</strong>
          <span>{row.product?.sku || ''}</span>
        </div>
      </td>

      {/* Qty Change */}
      <td>
        <span className={`history-change-pill ${tone}`}>
          {formatSignedQty(row.quantity_changed)}
        </span>
      </td>

      {/* New On-Hand (quantity_after) */}
      <td>{row.quantity_after ?? 0}</td>

      {/* Reference */}
      <td style={{ whiteSpace: 'nowrap' }}>
        <strong style={{ fontSize: 12, display: 'block' }}>{row.reference || '—'}</strong>
      </td>

      {/* User / Cashier */}
      <td>{userName}</td>
    </tr>
  );
});

// ─── InventoryHistoryTable ─────────────────────────────────────────────────────
export default function InventoryHistoryTable({
  storeId,
  isLoading,
  isFetching,
  rows,
  pagination,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  onPreviousPage,
  onNextPage,
}) {
  const resolvedOptions =
    pageSize !== null
      ? [...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b)
      : pageSizeOptions;

  const currentPage = pagination?.current_page || 1;
  const lastPage = pagination?.last_page || 1;
  const total = pagination?.total || 0;
  const from = pagination?.from || 0;
  const to = pagination?.to || 0;

  return (
    <article className="catalog-table-card">
      {/* Header */}
      <div className="inv-history-header">
        <div className="catalog-hero-copy">
          <h3 className="inv-history-title">Comprehensive Inventory Ledger &amp; History</h3>
          {isFetching && rows.length > 0 && (
            <p className="catalog-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={12} style={{ color: 'var(--color-text-secondary)' }} />
              Refreshing…
            </p>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted">Show</span>
          <select
            className="select-input"
            value={pageSize ?? ''}
            onChange={onPageSizeChange}
            disabled={!storeId || pageSize === null}
            style={{ minWidth: 72 }}
          >
            {pageSize === null ? (
              <option value="">Loading…</option>
            ) : (
              resolvedOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>Product</th>
              <th>Qty Change</th>
              <th>New On-Hand</th>
              <th>Reference</th>
              <th>User/Cashier</th>
            </tr>
          </thead>

          <tbody>
            {!storeId ? (
              <tr>
                <td colSpan="7" className="catalog-empty-cell">
                  Select a store first.
                </td>
              </tr>
            ) : isLoading && !rows.length ? (
              <tr>
                <td colSpan="7" className="catalog-empty-cell" style={{ padding: '32px 0' }}>
                  <Spinner
                    size={20}
                    style={{ margin: '0 auto', display: 'block', color: 'var(--color-text-secondary)' }}
                  />
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <HistoryRow key={row.inventory_history_id} row={row} />
              ))
            ) : (
              <tr>
                <td colSpan="7" className="catalog-empty-cell">
                  No inventory history found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer — pagination + sync status */}
      {storeId ? (
        <div className="inv-history-footer">
          <PaginationControls
            pagination={pagination}
            isFetching={isFetching}
            onPrevious={onPreviousPage}
            onNext={onNextPage}
          />
          <p className="inv-sync-note muted">
            Page {currentPage} of {lastPage}
            {total > 0 ? ` | Showing ${from}-${to} of ${total} lines` : ''}
            {' '}| All data synchronized{' '}
            <span style={{ fontStyle: 'italic' }}>(Last: 2 mins ago)</span>
          </p>
        </div>
      ) : null}
    </article>
  );
}
