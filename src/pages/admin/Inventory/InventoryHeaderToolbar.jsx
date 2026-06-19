import { Plus, Search } from 'lucide-react';

export default function InventoryHeaderToolbar({
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
          <p className="catalog-subtitle">
            {total || 0} stock lines
            {lowStockCount ? ` • ${lowStockCount} low stock on this page` : ''}
            {isRefreshing ? ' • refreshing...' : ''}
          </p>
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={onAddClick}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
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
          <select className="select-input" value={pageSize} onChange={onPageSizeChange} disabled={!storeId}>
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
      </div>
    </>
  );
}
