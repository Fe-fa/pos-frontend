import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Search, Download, ChevronDown, AlertTriangle, Package, DollarSign, TrendingDown, Building2 } from 'lucide-react';
import Spinner from './Spinner';

/**
 * Page-level toolbar for the inventory section.
 * Matches the screenshot layout:
 *  - Stats row: Total SKUs Tracked | Total Inventory Value | Low Stock Warnings | Dead Stock Lines | Branch Select
 *  - Toolbar row: Search + Search By dropdowns | Show | Store ID | Bulk Actions | Export
 */
const InventoryHeaderToolbar = memo(function InventoryHeaderToolbar({
  total,
  totalSkus,
  totalValue,
  lowStockCount,
  deadStockCount,
  isRefreshing,
  storeId,
  canManage,
  onAddClick,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  onExport,
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchBy, setSearchBy] = useState('product');
  const bulkRef = useRef(null);
  const exportRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target)) setBulkOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const resolvedOptions =
    pageSize !== null
      ? [...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b)
      : pageSizeOptions;

  const formatCurrency = (val) => {
    if (!val && val !== 0) return 'KSH 0';
    return `KSH ${Number(val).toLocaleString()}`;
  };

  const handleBulkAction = useCallback((action) => {
    setBulkOpen(false);
    window.alert(`Bulk action: ${action}`);
  }, []);

  return (
    <>
      {/* ── Title row ── */}
      <div className="inv-title-row">
        <div className="catalog-hero-copy">
          <h2 className="catalog-title">Inventory</h2>
          <p className="catalog-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Current Stock Lines: {total || 0}
            {isRefreshing && (
              <>
                {' '}·{' '}
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

      {/* ── Stats cards row ── */}
      <div className="inv-stats-row">
        {/* Total SKUs Tracked */}
        <div className="inv-stat-card">
          <p className="inv-stat-label">Total SKUs Tracked</p>
          <strong className="inv-stat-value">{totalSkus || 0}</strong>
        </div>

        {/* Total Inventory Value */}
        <div className="inv-stat-card">
          <p className="inv-stat-label">Total Inventory Value</p>
          <strong className="inv-stat-value">{formatCurrency(totalValue)}</strong>
        </div>

        {/* Low Stock Warnings */}
        <div className="inv-stat-card">
          <p className="inv-stat-label">Low Stock Warnings</p>
          <strong
            className="inv-stat-value"
            style={{ color: lowStockCount > 0 ? 'var(--danger)' : 'var(--text)' }}
          >
            {lowStockCount > 0 ? `${lowStockCount} (Critical)` : lowStockCount}
          </strong>
        </div>

        {/* Dead Stock Lines */}
        <div className="inv-stat-card">
          <p className="inv-stat-label">Dead Stock Lines</p>
          <strong
            className="inv-stat-value"
            style={{ color: deadStockCount > 0 ? 'var(--danger)' : 'var(--text)' }}
          >
            {deadStockCount > 0 ? `${deadStockCount} (Action Required)` : deadStockCount}
          </strong>
        </div>

        {/* Branch Select */}
        <div className="inv-stat-card inv-branch-card">
          <p className="inv-stat-label">Branch Select</p>
          <select className="select-input inv-branch-select" defaultValue="">
            <option value="">Branch Select</option>
          </select>
        </div>
      </div>

      {/* ── Search / filter toolbar ── */}
      <div className="inv-toolbar">
        {/* Search input */}
        <label className="catalog-search inv-search-field">
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

        {/* Search By filters */}
        <div className="inv-search-by">
          <span className="muted inv-search-by-label">Search By:</span>
          {['Product', 'SKU', 'Batch', 'Supplier'].map((label) => (
            <button
              key={label}
              type="button"
              className={`inv-search-by-chip${searchBy === label.toLowerCase() ? ' active' : ''}`}
              onClick={() => setSearchBy(label.toLowerCase())}
            >
              {label}
              <ChevronDown size={12} />
            </button>
          ))}
        </div>

        {/* Show per-page */}
        <label className="inv-show-wrap">
          <span className="muted">Show</span>
          <select
            className="select-input inv-show-select"
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

        {/* Store ID pill */}
        <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>

        {/* Bulk Actions dropdown */}
        <div className="inv-dropdown-wrap" ref={bulkRef}>
          <button
            type="button"
            className="inv-bulk-btn"
            onClick={() => setBulkOpen((v) => !v)}
            disabled={!storeId}
          >
            <span className="inv-bulk-icon">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="0" y="0" width="5" height="5" rx="1" fill="currentColor" opacity=".8" />
                <rect x="7" y="0" width="5" height="5" rx="1" fill="currentColor" opacity=".8" />
                <rect x="0" y="7" width="5" height="5" rx="1" fill="currentColor" opacity=".8" />
                <rect x="7" y="7" width="5" height="5" rx="1" fill="currentColor" opacity=".8" />
              </svg>
            </span>
            Bulk Actions
            <ChevronDown size={14} />
          </button>
          {bulkOpen && (
            <div className="inv-dropdown-menu">
              <button onClick={() => handleBulkAction('restock')}>Bulk Restock</button>
              <button onClick={() => handleBulkAction('adjust')}>Bulk Adjust</button>
              <button onClick={() => handleBulkAction('delete')} className="danger">Bulk Delete</button>
            </div>
          )}
        </div>

        {/* Export dropdown */}
        <div className="inv-dropdown-wrap" ref={exportRef}>
          <button
            type="button"
            className="ghost-button inv-export-btn"
            onClick={() => setExportOpen((v) => !v)}
            disabled={!storeId}
          >
            <Download size={15} />
            Export (CSV/PDF)
          </button>
          {exportOpen && (
            <div className="inv-dropdown-menu">
              <button onClick={() => { setExportOpen(false); onExport?.('csv'); }}>
                Export as CSV
              </button>
              <button onClick={() => { setExportOpen(false); onExport?.('pdf'); }}>
                Export as PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
});

export default InventoryHeaderToolbar;
