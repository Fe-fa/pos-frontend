import { Download, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { customerService } from '../../services/customerService';
import { rewardService } from '../../services/rewardService';
import { currency, formatDateTime } from '../../utils/helpers';

const TABS = [
  { key: 'stats', label: 'Stats' },
  { key: 'points', label: 'Point Details' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'items', label: 'Item History' },
  { key: 'ledger', label: 'Ledger History' },
];

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function CustomerHistoryModal({
  isOpen,
  onClose,
  customer,
  currentStore,
}) {
  const [activeTab, setActiveTab] = useState('stats');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [customerDetail, setCustomerDetail] = useState(null);
  const [loyaltyData, setLoyaltyData] = useState(null);

  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState(10);

  useEffect(() => {
    if (!isOpen || !customer?.customer_id || !currentStore?.store_id) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const [customerRes, loyaltyRes] = await Promise.all([
          customerService.show(customer.customer_id),
          rewardService.customerLoyalty({
            store_id: Number(currentStore.store_id),
            customer_id: Number(customer.customer_id),
          }),
        ]);

        if (cancelled) return;

        setCustomerDetail(customerRes?.data || customerRes || null);
        setLoyaltyData(loyaltyRes || null);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || 'Unable to load customer history.');
          setCustomerDetail(null);
          setLoyaltyData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, customer, currentStore]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('stats');
      setSearch('');
      setEntries(10);
      setError('');
      setCustomerDetail(null);
      setLoyaltyData(null);
    }
  }, [isOpen]);

  const transactions = useMemo(
    () => (Array.isArray(loyaltyData?.recent_transactions) ? loyaltyData.recent_transactions : []),
    [loyaltyData]
  );

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const base = keyword
      ? transactions.filter((tx) => {
          const haystack = [
            tx?.transaction_type,
            tx?.notes,
            tx?.points,
            tx?.amount_equivalent,
            tx?.billing_id,
            tx?.created_at,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(keyword);
        })
      : transactions;

    return base.slice(0, Number(entries || 10));
  }, [transactions, search, entries]);

  const itemHistoryRows = useMemo(() => {
    return filteredTransactions.filter((tx) => {
      const notes = String(tx?.notes || '').toLowerCase();
      return (
        notes.includes('chapa') ||
        notes.includes('free item') ||
        notes.includes('sku')
      );
    });
  }, [filteredTransactions]);

  const exportCurrentTab = () => {
    let rows = [];
    let filename = `customer-history-${customer?.customer_id || 'export'}.csv`;

    if (activeTab === 'transactions' || activeTab === 'ledger') {
      rows = filteredTransactions.map((tx) => ({
        id: tx.id,
        billing_id: tx.billing_id,
        type: tx.transaction_type,
        points: tx.points,
        amount_equivalent: tx.amount_equivalent,
        notes: tx.notes,
        created_at: tx.created_at,
      }));
    } else if (activeTab === 'items') {
      rows = itemHistoryRows.map((tx) => ({
        id: tx.id,
        billing_id: tx.billing_id,
        type: tx.transaction_type,
        notes: tx.notes,
        created_at: tx.created_at,
      }));
      filename = `customer-item-history-${customer?.customer_id || 'export'}.csv`;
    } else {
      rows = [
        {
          customer: customerDetail?.full_name || '',
          loyalty_points: loyaltyData?.loyalty_points ?? 0,
          total_earned_points: loyaltyData?.total_earned_points ?? 0,
          points_value: loyaltyData?.points_value ?? 0,
          total_free_items_earned: loyaltyData?.total_free_items_earned ?? 0,
          chapa_label: loyaltyData?.chapa5?.label ?? '',
          chapa_progress: loyaltyData?.chapa5?.display ?? '',
        },
      ];
      filename = `customer-stats-${customer?.customer_id || 'export'}.csv`;
    }

    if (!rows.length) {
      window.alert('No data available to export.');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const chapa = loyaltyData?.chapa5 ?? null;
  const activeRule = loyaltyData?.active_rule ?? null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card draft-modal-card customer-history-modal-like-image"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="customer-history-top-header">
          <div>
            <h3>Customer History</h3>
            <p className="muted" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {customerDetail?.full_name || customer?.full_name || 'Customer'}
            </p>
          </div>

          <button type="button" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="customer-history-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`customer-history-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="customer-history-toolbar">
          <label className="catalog-search" style={{ margin: 0 }}>
            <Search className="catalog-search-icon" size={16} />
            <input
              className="text-input"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="row-actions compact">
            <div className="customers-show-entries">
              <span className="muted">Show</span>
              <select
                className="text-input"
                value={entries}
                onChange={(e) => setEntries(Number(e.target.value))}
                style={{ width: 90 }}
              >
                {[5, 10, 25].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="muted">Entries</span>
            </div>

            <button
              type="button"
              className="ghost-button customers-export-btn"
              onClick={exportCurrentTab}
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="draft-modal-list" style={{ paddingTop: 0 }}>
          {loading ? <div className="page-loader">Loading customer history...</div> : null}
          {error ? <div className="form-error">{error}</div> : null}

          {!loading && !error ? (
            <>
              {activeTab === 'stats' ? (
                <div className="stack-md">
                  <div className="customers-reward-summary-grid">
                    <div className="info-tile compact">
                      <span>Loyalty points</span>
                      <strong>{loyaltyData?.loyalty_points ?? 0}</strong>
                    </div>

                    <div className="info-tile compact">
                      <span>Points value</span>
                      <strong>
                        {currency(loyaltyData?.points_value ?? 0, currentStore?.currency)}
                      </strong>
                    </div>

                    <div className="info-tile compact">
                      <span>Total earned points</span>
                      <strong>{loyaltyData?.total_earned_points ?? 0}</strong>
                    </div>

                    <div className="info-tile compact">
                      <span>Free items earned</span>
                      <strong>{loyaltyData?.total_free_items_earned ?? 0}</strong>
                    </div>
                  </div>

                  <div className="card">
                    <strong>Customer details</strong>
                    <div className="catalog-form-grid" style={{ marginTop: 12 }}>
                      <div className="info-tile compact">
                        <span>Name</span>
                        <strong>{customerDetail?.full_name || '-'}</strong>
                      </div>
                      <div className="info-tile compact">
                        <span>Phone</span>
                        <strong>{customerDetail?.phone || '-'}</strong>
                      </div>
                      <div className="info-tile compact">
                        <span>Email</span>
                        <strong>{customerDetail?.email || '-'}</strong>
                      </div>
                      <div className="info-tile compact">
                        <span>Balance</span>
                        <strong>
                          {currency(customerDetail?.current_balance ?? 0, currentStore?.currency)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {chapa?.enabled ? (
                    <div className="card">
                      <strong>{chapa.label}</strong>
                      <p className="muted" style={{ marginTop: 6 }}>
                        SKU: {chapa.product_sku || '-'}
                      </p>

                      <div style={{ marginTop: 12 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span className="muted">Progress</span>
                          <span className="muted">{chapa.display}</span>
                        </div>

                        <div
                          style={{
                            height: 8,
                            background: 'var(--line)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${(Number(chapa.progress || 0) / Number(chapa.buy_count || 1)) * 100}%`,
                              background: 'var(--brand-blue)',
                              borderRadius: 999,
                            }}
                          />
                        </div>

                        <p className="muted" style={{ marginTop: 8 }}>
                          {chapa.punches_needed} more qualifying purchase(s) needed.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeTab === 'points' ? (
                <div className="stack-md">
                  <div className="customers-reward-summary-grid">
                    <div className="info-tile compact">
                      <span>Point value</span>
                      <strong>{activeRule?.point_value ?? '-'}</strong>
                    </div>
                    <div className="info-tile compact">
                      <span>Points / shilling</span>
                      <strong>{activeRule?.points_per_shilling ?? '-'}</strong>
                    </div>
                    <div className="info-tile compact">
                      <span>Min spend required</span>
                      <strong>{activeRule?.min_spend_required ?? '-'}</strong>
                    </div>
                    <div className="info-tile compact">
                      <span>Min redemption points</span>
                      <strong>{activeRule?.min_redemption_points ?? '-'}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === 'transactions' ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Points</th>
                        <th>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.length ? (
                        filteredTransactions.map((tx) => (
                          <tr key={tx.id}>
                            <td>{tx.id}</td>
                            <td>{tx.transaction_type}</td>
                            <td>{tx.points}</td>
                            <td>{currency(tx.amount_equivalent ?? 0, currentStore?.currency)}</td>
                            <td>{tx.notes || '-'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No transactions found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {activeTab === 'items' ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Billing</th>
                        <th>Description</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemHistoryRows.length ? (
                        itemHistoryRows.map((tx) => (
                          <tr key={tx.id}>
                            <td>{tx.id}</td>
                            <td>{tx.billing_id || '-'}</td>
                            <td>{tx.notes || '-'}</td>
                            <td>{formatDateTime(tx.created_at)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No item history found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {activeTab === 'ledger' ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Points</th>
                        <th>Amount</th>
                        <th>Notes</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.length ? (
                        filteredTransactions.map((tx) => (
                          <tr key={tx.id}>
                            <td>{tx.id}</td>
                            <td>{tx.transaction_type}</td>
                            <td>{tx.points}</td>
                            <td>{currency(tx.amount_equivalent ?? 0, currentStore?.currency)}</td>
                            <td>{tx.notes || '-'}</td>
                            <td>{formatDateTime(tx.created_at)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6">No ledger history found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="customers-history-footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
