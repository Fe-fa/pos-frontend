import { memo } from 'react';
import { Plus, Search } from 'lucide-react';
import Spinner from './Spinner';

/**
 * Page-level toolbar for the inventory section.
 *
 * pageSize starts as `null` on the first load (before the backend default
 * is known). The selector shows "Loading…" and is disabled in that state.
 * Once the first response arrives and pageSize is set from meta.per_page,
 * the selector becomes active and the options list is built dynamically —
 * always including the backend default so the selector is never desynced.
 */
const InventoryHeaderToolbar = memo(function InventoryHeaderToolbar({
  total,
  lowStockCount,
  isRefreshing,
  storeId,
  canManage,
  onAddClick,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
}) {
  // Merge the backend default into the preset list so it always appears,
  // deduped and sorted ascending.
  const resolvedOptions =
    pageSize !== null
      ? [...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b)
      : pageSizeOptions;

  return (
    <>
      <div
        className="catalog-hero"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div className="catalog-hero-copy" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="catalog-title">Inventory</h2>
          <p className="catalog-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {total || 0} stock lines
            {lowStockCount ? ` • ${lowStockCount} low stock on this page` : ''}
            {isRefreshing && (
              <>
                {' '}•{' '}
                <Spinner size={12} style={{ color: 'var(--color-text-secondary)' }} />
                {' '}refreshing…
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={onAddClick}
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          disabled={!storeId || !canManage}
        >
          <Plus size={16} />
          <span>Add stock line</span>
        </button>
      </div>

      <div className="catalog-toolbar">
        <label className="catalog-search">
          <span className="catalog-search-icon">
            <Search size={16} />
          </span>
          <input
            className="text-input"
            type="text"
            placeholder="Search product, SKU, batch"
            value={search}
            onChange={onSearchChange}
            disabled={!storeId}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted">Show</span>
          <select
            className="select-input"
            value={pageSize ?? ''}
            onChange={onPageSizeChange}
            disabled={!storeId || pageSize === null}
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

        <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
      </div>
    </>
  );
});

export default InventoryHeaderToolbar;
