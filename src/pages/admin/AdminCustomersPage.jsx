import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { customerService } from '../../services/customerService';
import { currency } from '../../utils/helpers';
import { useStore } from '../../contexts/StoreContext';

const initialForm = { full_name: '', email: '', phone: '', current_balance: 0 };

const emptyPagination = {
  data: [],
  current_page: 1,
  per_page: 10,
  prev_page_url: null,
  next_page_url: null,
  from: null,
  to: null,
};

const extractPagination = (response) => {
  const payload = response?.data ?? response ?? {};

  if (Array.isArray(payload?.data)) {
    return { ...emptyPagination, ...payload, data: payload.data };
  }

  if (Array.isArray(payload)) {
    return {
      ...emptyPagination,
      data: payload,
      per_page: payload.length,
      from: payload.length ? 1 : null,
      to: payload.length || null,
    };
  }

  return emptyPagination;
};

export default function AdminCustomersPage() {
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
        per_page: 10,
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
  }, [storeId, search, page]);

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
                        <div className="row-actions compact">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleEdit(customer)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => handleDelete(customer.customer_id)}
                          >
                            Delete
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
                  disabled={!pagination.prev_page_url || loading}
                >
                  Previous
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!pagination.next_page_url || loading}
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
