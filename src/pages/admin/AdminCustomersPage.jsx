import { X, Edit, Trash2, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { customerService } from '../../services/customerService';
import { currency } from '../../utils/helpers';
import { useStore } from '../../contexts/StoreContext'
import { useAuth } from '../../contexts/AuthContext';

const initialForm = { full_name: '', email: '', phone: '', current_balance: 0 };

const DEFAULT_PER_PAGE = 10;

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
  const meta   = payload?.meta ?? {};
  const data   = Array.isArray(payload?.data) ? payload.data
               : Array.isArray(payload)        ? payload
               : [];

  return {
    ...emptyPagination,
    data,
    current_page: Number(meta.current_page ?? 1),
    last_page:    Number(meta.last_page    ?? 1),
    per_page:     Number(meta.per_page     ?? DEFAULT_PER_PAGE),
    total:        Number(meta.total        ?? data.length),
    from:         meta.from ?? (data.length ? 1 : null),
    to:           meta.to   ?? (data.length || null),
  };
};

export default function AdminCustomersPage() {
    const { can } = useAuth();
    const canManage = can('customers.manage'); 
  const { stores, storeId } = useStore();
  const currentStore = stores.find((store) => String(store.store_id) === String(storeId));

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

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
    setShowModal(false);
    setEditingId(null);
    setForm(initialForm);
    setError('');
    setPage(1);

    if (!storeId) {
      setLoading(false);
    }
  }, [storeId]);

 useEffect(() => {
  loadCustomers();
}, [storeId, search, page, perPage]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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

      setShowModal(false);
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
    setShowModal(true);
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

  return (
    <>
      <section className="stack-lg">
        <div
          className="catalog-hero"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
        >
          <div className="catalog-hero-copy" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="catalog-title">Customers</h2>
            <p className="catalog-subtitle">
              {pagination.from && pagination.to
                ? `Showing ${pagination.from}-${pagination.to}`
                : `${customers.length} customer records`}
            </p>
          </div>

          <button
            type="button"
            className="ghost-button"
            onClick={openCreateModal}
            style={{ whiteSpace: 'nowrap' }}
            disabled={!storeId}
          >
            New customer
          </button>
        </div>

        <div className="catalog-toolbar">
          <label className="catalog-search">
            <input
              className="text-input"
              placeholder="Search customer"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              disabled={!storeId}
            />
          </label>
<div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
  <ChevronDown
    size={14}
    style={{
      position: 'absolute',
      right: 8,
      pointerEvents: 'none',
      color: 'var(--color-text-secondary)',
    }}
  />
  <select
    className="text-input"
    value={perPage}
    onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
    disabled={!storeId}
    style={{ width: 'auto', paddingRight: 28, appearance: 'none' }}
  >
    {[5, 10, 25, 50].map(n => (
      <option key={n} value={n}>{n}</option>
    ))}
  </select>
</div>
          <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
        </div>

        {error && !showModal ? <p className="form-error">{error}</p> : null}

        <article className="catalog-table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contacts</th>
                  <th>Balance</th>
                  <th>Loyalty Points</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!storeId ? (
                  <tr>
                    <td colSpan="4">Select a store first.</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan="4">Loading...</td>
                  </tr>
                ) : customers.length ? (
                  customers.map((customer) => (
                    <tr key={customer.customer_id}>
                      <td>{customer.full_name}</td>
                      <td>
                        <div>{customer.phone || '-'}</div>
                        <div className="muted">{customer.email || '-'}</div>
                      </td>
                      <td>{currency(customer.current_balance, currentStore?.currency)}</td>
                      <td>
  <div>{customer.loyalty_points ?? 0} pts</div>
  <div className="muted" style={{ fontSize: 12 }}>
    {currency(customer.loyalty_points ?? 0, currentStore?.currency)} value
  </div>
</td>
                      <td>
<div className="row-actions compact">
  {/* Edit Customer Button */}
  <button
    type="button"
    className="ghost-button"
    onClick={() => handleEdit(customer)}
    title="Edit"
  >
    <Edit size={16} />
  </button>

  {/* Delete Customer Button */}
  <button
    type="button"
    className="ghost-button danger"
    onClick={() => handleDelete(customer.customer_id)}
    title="Delete"
  >
    <Trash2 size={16} />
  </button>
</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4">No customers found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {storeId ? (
            <div
              className="row-actions"
              style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}
            >
              <span className="muted">Page {pagination.current_page || page}</span>

              <div className="row-actions compact">
<button
  type="button"
  className="ghost-button"
  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
  disabled={pagination.current_page <= 1 || loading}   
>
  Previous
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

      {showModal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingId ? 'Edit customer' : 'New customer'}</h3>
                <p className="muted">Create or update customer profile details.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeModal}
                disabled={submitting}
              >
                <X size={18} />
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
                    onClick={closeModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button className="catalog-primary-btn" type="submit" disabled={submitting}>
                    {editingId ? 'Update customer' : 'Create customer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
