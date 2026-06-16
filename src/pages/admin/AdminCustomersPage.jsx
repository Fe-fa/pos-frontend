import {
  ChevronDown,
  Download,
  Edit,
  Gift,
  History,
  Mail,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { customerService } from '../../services/customerService';
import { currency } from '../../utils/helpers';
import RewardRuleModal from '../../components/modals/RewardRuleModal';
import CustomerHistoryModal from '../../components/modals/CustomerHistoryModal';

const DEFAULT_PER_PAGE = 10;

const initialForm = {
  full_name: '',
  email: '',
  phone: '',
  current_balance: 0,
};

const emptyPagination = {
  data: [],
  current_page: 1,
  last_page: 1,
  per_page: DEFAULT_PER_PAGE,
  from: null,
  to: null,
  total: 0,
};

const extractPagination = (response) => {
  const payload = response?.data ?? response ?? {};
  const meta = payload?.meta ?? {};
  const data = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];

  return {
    ...emptyPagination,
    data,
    current_page: Number(meta.current_page ?? 1),
    last_page: Number(meta.last_page ?? 1),
    per_page: Number(meta.per_page ?? DEFAULT_PER_PAGE),
    total: Number(meta.total ?? data.length),
    from: meta.from ?? (data.length ? 1 : null),
    to: meta.to ?? (data.length || null),
  };
};

const csvEscape = (value) => {
  const safe = String(value ?? '');
  return `"${safe.replace(/"/g, '""')}"`;
};

export default function AdminCustomersPage() {
  const { can } = useAuth();
  const canManageCustomers = can('customers.manage');
  const canManageRewards = can('stores.manage');

  const { stores, storeId } = useStore();
  const currentStore = stores.find((store) => String(store.store_id) === String(storeId));

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [minPointsFilter, setMinPointsFilter] = useState('');
  const [rewardFilter, setRewardFilter] = useState('all');

  const [error, setError] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showRewardsModal, setShowRewardsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState(null);

  const [selectedRows, setSelectedRows] = useState([]);

  const loadCustomers = async () => {
    if (!storeId) {
      setCustomers([]);
      setPagination(emptyPagination);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await customerService.list({
        page,
        store_id: storeId,
        search,
        per_page: perPage,
      });

      const parsed = extractPagination(response);
      setCustomers(parsed.data || []);
      setPagination(parsed);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load customers.');
      setCustomers([]);
      setPagination(emptyPagination);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCustomers([]);
    setPagination(emptyPagination);
    setSearch('');
    setError('');
    setPage(1);
    setPerPage(DEFAULT_PER_PAGE);
    setSelectedRows([]);
    setShowCustomerModal(false);
    setShowRewardsModal(false);
    setShowHistoryModal(false);
    setHistoryCustomer(null);
    setEditingId(null);
    setForm(initialForm);
    setMinPointsFilter('');
    setRewardFilter('all');
    setShowAdvancedSearch(false);

    if (!storeId) {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, search, page, perPage]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const loyaltyPoints = Number(customer?.loyalty_points ?? 0);
      const punchCount = Number(customer?.punch_card_count ?? 0);
      const freeItems = Number(customer?.total_free_items_earned ?? 0);

      if (minPointsFilter !== '' && loyaltyPoints < Number(minPointsFilter || 0)) {
        return false;
      }

      if (rewardFilter === 'points' && loyaltyPoints <= 0) return false;
      if (rewardFilter === 'punches' && punchCount <= 0) return false;
      if (rewardFilter === 'free-items' && freeItems <= 0) return false;
      if (rewardFilter === 'none' && (loyaltyPoints > 0 || punchCount > 0 || freeItems > 0)) return false;

      return true;
    });
  }, [customers, minPointsFilter, rewardFilter]);

  const selectedCount = selectedRows.length;

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowCustomerModal(true);
  };

  const closeCustomerModal = () => {
    if (submitting) return;
    setShowCustomerModal(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!storeId) return;

    setError('');
    setSubmitting(true);

    try {
      const payload = {
        store_id: Number(storeId),
        ...form,
      };

      if (editingId) {
        await customerService.update(editingId, payload);
      } else {
        await customerService.create(payload);
      }

      setShowCustomerModal(false);
      resetForm();
      await loadCustomers();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to save customer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingId(customer.customer_id);
    setForm({
      full_name: customer.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      current_balance: customer.current_balance || 0,
    });
    setError('');
    setShowCustomerModal(true);
  };

  const handleDelete = async (customerId) => {
    if (!window.confirm('Delete this customer?')) return;

    try {
      await customerService.remove(customerId);

      if (customers.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadCustomers();
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to delete customer.');
    }
  };

  const handleRefresh = async () => {
    await loadCustomers();
  };

  const handleOpenHistory = (customer) => {
    setHistoryCustomer(customer);
    setShowHistoryModal(true);
  };

  const handleToggleRow = (customerId) => {
    setSelectedRows((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleToggleAllVisible = () => {
    const visibleIds = filteredCustomers.map((customer) => customer.customer_id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedRows.includes(id));

    if (allSelected) {
      setSelectedRows((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedRows((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleExportCsv = () => {
    const exportRows = filteredCustomers.filter((customer) => {
      if (!selectedRows.length) return true;
      return selectedRows.includes(customer.customer_id);
    });

    if (!exportRows.length) {
      window.alert('No customer rows available for export.');
      return;
    }

    const headers = [
      'ID',
      'Name',
      'Email',
      'Mobile',
      'DOB',
      'Zipcode',
      'Balance',
      'Loyalty Points',
      'Punch Card Count',
      'Free Items Earned',
      'Promotions',
    ];

    const body = exportRows.map((customer) =>
      [
        customer.customer_id,
        customer.full_name,
        customer.email,
        customer.phone,
        customer.dob ?? '',
        customer.zipcode ?? '',
        customer.current_balance ?? 0,
        customer.loyalty_points ?? 0,
        customer.punch_card_count ?? 0,
        customer.total_free_items_earned ?? 0,
        customer.sms_email_promotions ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );

    const csv = [headers.map(csvEscape).join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-store-${storeId || 'all'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="stack-lg customers-admin-shell">
        <div className="customers-admin-topbar">
          <div>
            <div className="customers-breadcrumb">Home</div>
            <h2 className="catalog-title">Customers</h2>
          </div>

          <div className="customers-top-actions">
            <button
              type="button"
              className="ghost-button customers-refresh-btn"
              onClick={handleRefresh}
              disabled={!storeId || loading}
            >
              <RefreshCw size={15} />
              Refresh
            </button>

            <button
              type="button"
              className="ghost-button customers-export-btn"
              onClick={handleExportCsv}
              disabled={!storeId || !filteredCustomers.length}
            >
              <Download size={15} />
              Export CSV
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={openCreateModal}
              disabled={!storeId || !canManageCustomers}
            >
              <Plus size={15} />
              Add
            </button>

            <button
              type="button"
              className="ghost-button"
              disabled
              title="UI placeholder only"
            >
              <Mail size={15} />
              SMS/Email Promotions
            </button>

            <button
              type="button"
              className="ghost-button"
              disabled
              title="UI placeholder only"
            >
              <Tags size={15} />
              Manage Groups
            </button>

            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowRewardsModal(true)}
              disabled={!storeId || !canManageRewards}
            >
              <Gift size={15} />
              Manage Rewards
            </button>
          </div>
        </div>

        <div className="customers-blue-banner">Manage your customer base</div>

        <div className="catalog-toolbar customers-toolbar-like-image">
          <label className="catalog-search">
            <input
              className="text-input"
              placeholder="Search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                setSelectedRows([]);
              }}
              disabled={!storeId}
            />
          </label>

          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowAdvancedSearch((prev) => !prev)}
            disabled={!storeId}
          >
            Advance Search
          </button>

          <div className="customers-show-entries">
            <span className="muted">Show</span>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute',
                  right: 8,
                  pointerEvents: 'none',
                  color: 'var(--muted)',
                }}
              />
              <select
                className="text-input"
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                  setSelectedRows([]);
                }}
                disabled={!storeId}
                style={{ width: 90, paddingRight: 28, appearance: 'none' }}
              >
                {[5, 10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <span className="muted">Entries</span>
          </div>
        </div>

        {showAdvancedSearch ? (
          <div className="card">
            <div className="catalog-form-grid">
              <label>
                Minimum points
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  value={minPointsFilter}
                  onChange={(e) => setMinPointsFilter(e.target.value)}
                  placeholder="0"
                />
              </label>

              <label>
                Reward status
                <select
                  className="text-input"
                  value={rewardFilter}
                  onChange={(e) => setRewardFilter(e.target.value)}
                >
                  <option value="all">All customers</option>
                  <option value="points">Has loyalty points</option>
                  <option value="punches">Has punch progress</option>
                  <option value="free-items">Has free items earned</option>
                  <option value="none">No reward activity</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {error && !showCustomerModal ? <p className="form-error">{error}</p> : null}

        <article className="catalog-table-card customers-table-like-image">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={
                        filteredCustomers.length > 0 &&
                        filteredCustomers.every((customer) =>
                          selectedRows.includes(customer.customer_id)
                        )
                      }
                      onChange={handleToggleAllVisible}
                    />
                  </th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>DOB</th>
                  <th>Zipcode</th>
                  <th>Balance</th>
                  <th>Points</th>
                  <th># Free Items</th>
                  <th>SMS & Email Promotions</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {!storeId ? (
                  <tr>
                    <td colSpan="12">Select a store first.</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan="12">Loading...</td>
                  </tr>
                ) : filteredCustomers.length ? (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.customer_id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(customer.customer_id)}
                          onChange={() => handleToggleRow(customer.customer_id)}
                        />
                      </td>

                      <td>{customer.customer_id}</td>
                      <td>
                        <strong>{customer.full_name || '-'}</strong>
                      </td>
                      <td>{customer.email || '-'}</td>
                      <td>{customer.phone || '-'}</td>
                      <td>{customer.dob || '-'}</td>
                      <td>{customer.zipcode || '-'}</td>
                      <td>{currency(customer.current_balance ?? 0, currentStore?.currency)}</td>
                      <td>
                        <div>{customer.loyalty_points ?? 0}</div>
                        <div className="muted">
                          {currency(customer.loyalty_points ?? 0, currentStore?.currency)} value
                        </div>
                      </td>
                      <td>
                        <div>{customer.total_free_items_earned ?? 0}</div>
                        {/* {!!Number(customer.punch_card_count ?? 0) && (
                          <div className="muted">
                            Punches: {customer.punch_card_count}
                          </div>
                        )} */}
                      </td>
                      <td>
                        {customer.sms_email_promotions != null
                          ? String(customer.sms_email_promotions)
                          : 'Disable'}
                      </td>
                      <td>
                        <div className="row-actions compact customers-action-icons">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleEdit(customer)}
                            title="Edit"
                            disabled={!canManageCustomers}
                          >
                            <Edit size={16} />
                          </button>

                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleOpenHistory(customer)}
                            title="History"
                          >
                            <History size={16} />
                          </button>

                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => handleDelete(customer.customer_id)}
                            title="Delete"
                            disabled={!canManageCustomers}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="12">No customers found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {storeId ? (
            <div className="customers-table-footer">
              <span className="muted">
                {pagination.from && pagination.to
                  ? `Showing ${pagination.from} to ${pagination.to} of ${pagination.total} entries`
                  : `Showing 0 to 0 of 0 entries`}
                {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
              </span>

              <div className="row-actions compact">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={pagination.current_page <= 1 || loading}
                >
                  Previous
                </button>

                <button type="button" className="pagination-page-btn active">
                  {pagination.current_page || page}
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={pagination.current_page >= pagination.last_page || loading}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>

      {showCustomerModal ? (
        <div className="modal-backdrop" onClick={closeCustomerModal}>
          <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingId ? 'Edit customer' : 'Add customer'}</h3>
                <p className="muted">Create or update customer profile details.</p>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeCustomerModal}
                disabled={submitting}
              >
                ✕
              </button>
            </div>

            <div className="modal-content">
              <form className="catalog-form-grid" onSubmit={handleSubmit}>
                <label>
                  Full name
                  <input
                    className="text-input"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </label>

                <label>
                  Email
                  <input
                    className="text-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>

                <label>
                  Phone
                  <input
                    className="text-input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>

                <label>
                  Opening balance
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.current_balance}
                    onChange={(e) => setForm({ ...form, current_balance: e.target.value })}
                  />
                </label>

                {error ? <p className="form-error span-2">{error}</p> : null}

                <div className="catalog-modal-actions span-2">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={closeCustomerModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button className="primary-button" type="submit" disabled={submitting}>
                    {editingId ? 'Update customer' : 'Create customer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <RewardRuleModal
        isOpen={showRewardsModal}
        onClose={() => setShowRewardsModal(false)}
        storeId={storeId}
      />

      <CustomerHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        customer={historyCustomer}
        currentStore={currentStore}
      />
    </>
  );
}
