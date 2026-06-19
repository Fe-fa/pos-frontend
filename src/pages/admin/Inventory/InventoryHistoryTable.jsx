import { getHistoryTone, formatSignedQty } from './inventoryHelpers';
import PaginationControls from './PaginationControls';

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
  return (
    <article className="catalog-table-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="catalog-hero-copy">
          <h3 className="catalog-title" style={{ fontSize: '1.05rem' }}>
            Inventory history
          </h3>
          <p className="catalog-subtitle">{isFetching && rows.length ? 'Refreshing history...' : ''}</p>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted">Show</span>
          <select className="select-input" value={pageSize} onChange={onPageSizeChange} disabled={!storeId}>
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Batch no</th>
              <th>Change</th>
              <th>Before</th>
              <th>After</th>
              <th>Action</th>
              <th>Reference / User</th>
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
                <td colSpan="8" className="catalog-empty-cell">
                  Loading history...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <tr key={row.inventory_history_id}>
                  <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                  <td>
                    <div className="catalog-item-copy">
                      <strong>{row.product?.product_name || 'Unknown product'}</strong>
                      <span>{row.product?.sku || 'No SKU'}</span>
                    </div>
                  </td>
                  <td>{row.batch_no || '—'}</td>
                  <td>
                    <span className={`history-change-pill ${getHistoryTone(row.quantity_changed)}`}>
                      {formatSignedQty(row.quantity_changed)}
                    </span>
                  </td>
                  <td>{row.quantity_before ?? 0}</td>
                  <td>{row.quantity_after ?? 0}</td>
                  <td>{row.change_type || '-'}</td>
                  <td>
                    <div className="catalog-item-copy">
                      <strong>{row.reference || '—'}</strong>
                      <span>{row.user?.full_name || row.user?.name || row.user?.email || 'System'}</span>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="catalog-empty-cell">
                  No inventory history found.
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
