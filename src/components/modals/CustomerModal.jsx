import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { customerService } from '../../services/customerService';

const SEARCH_DEBOUNCE_MS = 300;

const extractList = (res) => {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
};

const extractMeta = (res) => res?.meta || res?.data?.meta || {};

const emptyPageInfo = () => ({
  currentPage: 1,
  lastPage: 1,
  perPage: 15,
  total: 0,
  from: 0,
  to: 0,
  hasPrevPage: false,
  hasNextPage: false,
});

const buildPageInfo = (meta, itemsLength, fallbackPage = 1) => {
  const currentPage = Number(meta?.current_page || fallbackPage);
  const lastPage = Number(meta?.last_page || 1);
  const perPage = Number(meta?.per_page || itemsLength || 15);
  const total = Number(meta?.total || itemsLength);
  const from = meta?.from ?? (itemsLength ? (currentPage - 1) * perPage + 1 : 0);
  const to = meta?.to ?? (itemsLength ? from + itemsLength - 1 : 0);

  return {
    currentPage,
    lastPage,
    perPage,
    total,
    from,
    to,
    hasPrevPage: currentPage > 1,
    hasNextPage: currentPage < lastPage,
  };
};

export default function CustomerModal({
  isOpen,
  onClose,
  selectedCustomerId,
  currentStore,
  currency,
  onSelectCustomer,
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [pageInfo, setPageInfo] = useState(emptyPageInfo());
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestIdRef = useRef(0);
  const storeId = currentStore?.store_id;

  /* debounce search */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /* reset to page 1 whenever the search keyword changes */
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  /* reset state when modal closes */
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setDebouncedSearch('');
      setCurrentPage(1);
      setError('');
    }
  }, [isOpen]);

  /* fetch customers (page + search are backend-driven) */
  const loadCustomers = useCallback(
    async (page = 1, keyword = '') => {
      if (!storeId || !isOpen) return;

      setLoading(true);
      setError('');
      const requestId = ++requestIdRef.current;

      try {
        const params = {
          store_id: Number(storeId),
          page,
        };
        if (keyword) params.search = keyword;

        const response = await customerService.list(params);

        if (requestId !== requestIdRef.current) return;

        const items = extractList(response);
        const meta = extractMeta(response);
        setCustomers(items);
        setPageInfo(buildPageInfo(meta, items.length, page));
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(
          err?.response?.data?.message || err?.message || 'Failed to load customers.'
        );
        setCustomers([]);
        setPageInfo(emptyPageInfo());
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [storeId, isOpen]
  );

  /* trigger load whenever page/search/open changes */
  useEffect(() => {
    if (!isOpen) return;
    void loadCustomers(currentPage, debouncedSearch);
  }, [isOpen, currentPage, debouncedSearch, loadCustomers]);

  const goToPrevPage = () => {
    if (loading) return;
    if (!pageInfo.hasPrevPage) return;
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const goToNextPage = () => {
    if (loading) return;
    if (!pageInfo.hasNextPage) return;
    setCurrentPage((p) => p + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card draft-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Select Customer</h3>
            <p className="muted">Search and attach a customer to the current billing</p>
          </div>

          <button type="button" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div
          className="toolbar-row pos-toolbar-wrap"
          style={{ marginBottom: 12, padding: '0 16px' }}
        >
          <div className="search-shell">
            <Search className="search-icon-pos" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers by name, phone or email"
            />
          </div>
        </div>

        {error ? (
          <div className="form-error" style={{ margin: '0 16px 12px' }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="page-loader" style={{ padding: '16px' }}>
            Loading customers...
          </div>
        ) : null}

        <div className="draft-modal-list">
          {/* Walk-in customer always at the top, only on page 1 with no search */}
          {currentPage === 1 && !debouncedSearch ? (
            <div className="draft-modal-row">
              <button
                type="button"
                className="draft-modal-row-main"
                onClick={() => onSelectCustomer('')}
              >
                <div className="draft-modal-main">
                  <strong>Walk-in Customer</strong>
                  <p>No customer account attached</p>
                </div>

                <div className="align-right draft-side-meta">
                  <strong>{selectedCustomerId ? 'Select' : 'Current'}</strong>
                </div>
              </button>
            </div>
          ) : null}

          {customers.length ? (
            customers.map((customer) => {
              const balance = Number(
                customer?.current_balance ??
                  customer?.balance ??
                  customer?.opening_balance ??
                  0
              );

              const cid = customer?.customer_id ?? customer?.id;

              return (
                <div
                  key={String(cid)}
                  className={`draft-modal-row ${
                    String(selectedCustomerId) === String(cid) ? 'active' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="draft-modal-row-main"
                    onClick={() => onSelectCustomer(String(cid))}
                  >
                    <div className="draft-modal-main">
                      <strong>{customer?.full_name || 'Unnamed Customer'}</strong>
                      {customer?.phone ? <p>{customer.phone}</p> : null}
                      {customer?.email ? <small>{customer.email}</small> : null}
                    </div>
<div className="align-right draft-side-meta">
                      <strong>{currency(balance, currentStore?.currency)}</strong>
                      <p>Balance</p>
                      {customer?.loyalty_points > 0 ? (
                        <>
                          <strong style={{ color: 'var(--color-text-success)' }}>
                            {customer.loyalty_points} pts
                          </strong>
                          <p>Loyalty points</p>
                        </>
                      ) : null}
                      {/* {customer?.punch_card_count > 0 ? (
                        <>
                          <strong style={{ color: 'var(--color-text-info)', marginTop: 4 }}>
                            🥊 {customer.punch_card_count} punches
                          </strong>
                          <p>Punch card</p>
                        </>
                      ) : null} */}
                    </div>
                  </button>
                </div>
              );
            })
          ) : !loading ? (
            <div className="empty-draft-state">
              <p>No customers matched your search.</p>
            </div>
          ) : null}
        </div>

        {pageInfo.total > 0 ? (
          <div
            className="pagination-bar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid var(--border-color, #e5e7eb)',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div className="pagination-summary" style={{ fontSize: 13 }}>
              Showing <strong>{pageInfo.from}</strong> -{' '}
              <strong>{pageInfo.to}</strong> of{' '}
              <strong>{pageInfo.total}</strong> customers
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                ({pageInfo.perPage} per page)
              </span>
            </div>

            <div
              className="pagination-controls"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <button
                type="button"
                className="ghost-button pagination-btn"
                onClick={goToPrevPage}
                disabled={!pageInfo.hasPrevPage || loading}
                aria-label="Previous page"
                title="Previous page"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  cursor:
                    !pageInfo.hasPrevPage || loading ? 'not-allowed' : 'pointer',
                  opacity: !pageInfo.hasPrevPage || loading ? 0.5 : 1,
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <span className="pagination-page-indicator" style={{ fontSize: 13 }}>
                Page <strong>{pageInfo.currentPage}</strong> of{' '}
                <strong>{pageInfo.lastPage}</strong>
              </span>

              <button
                type="button"
                className="ghost-button pagination-btn"
                onClick={goToNextPage}
                disabled={!pageInfo.hasNextPage || loading}
                aria-label="Next page"
                title="Next page"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  cursor:
                    !pageInfo.hasNextPage || loading ? 'not-allowed' : 'pointer',
                  opacity: !pageInfo.hasNextPage || loading ? 0.5 : 1,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}