import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  MapPin,
  Phone,
  Store as StoreIcon,
  Edit,
  Ban,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { storeService } from '../../services/storeService';
import StoreModal from '../../components/modals/StoreModal';

const initialForm = {
  store_name: '',
  location: '',
  currency: 'KES',
  telephone: '',
  pin: '',
  physical_address: '',
  email_address: '',
  logo_url: '',
  is_active: true,
};

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

function SummaryCard({ icon: Icon, label, value, caption }) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <p>{label}</p>
        <div className="metric-icon">
          <Icon size={16} />
        </div>
      </div>
      <h3>{value}</h3>
      {caption ? <span>{caption}</span> : null}
    </article>
  );
}

export default function AdminStoresPage() {
  const { user } = useAuth();
  const [stores, setStores] = useState([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canManageStores = user?.role === 'admin';

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await storeService.list({ page, per_page: 10 });
      const parsed = extractPagination(response);

      setStores(parsed.data || []);
      setPagination(parsed);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load stores.');
      setStores([]);
      setPagination(emptyPagination);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const summary = useMemo(() => {
    const active = stores.filter((store) => store.is_active).length;
    const inactive = stores.length - active;
    const currencies = new Set(
      stores.map((store) => store.currency).filter(Boolean)
    ).size;

    return { active, inactive, currencies };
  }, [stores]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
    setMessage('');
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      if (editingId) {
        await storeService.update(editingId, form);
        setMessage('Store updated successfully.');
      } else {
        await storeService.create(form);
        setMessage('Store created successfully.');
      }

      setForm(initialForm);
      setEditingId(null);
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to save store.');
    }
  };

  const handleEdit = (store) => {
    setEditingId(store.store_id);
    setForm({
      store_name: store.store_name || '',
      location: store.location || '',
      currency: store.currency || 'KES',
      telephone: store.telephone || '',
      pin: store.pin || '',
      physical_address: store.physical_address || '',
      email_address: store.email_address || '',
      logo_url: store.logo_url || '',
      is_active: Boolean(store.is_active),
    });
    setMessage('');
    setError('');
    setIsModalOpen(true);
  };

  const handleDelete = async (targetStoreId) => {
    if (!window.confirm('Deactivate this store?')) return;

    try {
      await storeService.remove(targetStoreId);
      setMessage('Store deactivated successfully.');

      if (stores.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await load();
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to remove store.');
    }
  };

  if (!canManageStores) {
    return (
      <section className="stack-lg">
        <div className="section-header">
          <div>
            <h2>Manager store access</h2>
            <p>
              Store management is restricted to system administrators. Please contact your
              administrator for assistance.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="stack-lg">
      <div className="section-header">
        <div>
          <h3>Stores</h3>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={handleOpenCreateModal}
        >
          Create store
        </button>
      </div>

      {message && !isModalOpen ? <p className="form-success">{message}</p> : null}
      {error && !isModalOpen ? <p className="form-error">{error}</p> : null}

      <div className="metrics-grid">
        <SummaryCard icon={StoreIcon} label="Stores" value={stores.length} />
        <SummaryCard icon={Building2} label="Active" value={summary.active} />
        <SummaryCard icon={MapPin} label="Inactive" value={summary.inactive} />
        <SummaryCard icon={Phone} label="Currencies" value={summary.currencies} />
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>All stores</h3>
              <p>
                {pagination.from && pagination.to
                  ? `Showing ${pagination.from}-${pagination.to}`
                  : `${stores.length} locations`}
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5">Loading...</td>
                  </tr>
                ) : stores.length ? (
                  stores.map((store) => (
                    <tr key={store.store_id}>
                      <td>
                        <strong>{store.store_name}</strong>
                        <div className="muted">{store.currency}</div>
                      </td>
                      <td>{store.location || store.physical_address || '-'}</td>
                      <td>
                        <div>{store.email_address || '-'}</div>
                        <div className="muted">{store.telephone || '-'}</div>
                      </td>
                      <td>
                        <span className={`badge ${store.is_active ? 'success' : 'danger'}`}>
                          {store.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions compact">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleEdit(store)}
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>

                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => handleDelete(store.store_id)}
                            title="Deactivate"
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">No stores found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
        </article>
      </div>

      <StoreModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        form={form}
        setForm={setForm}
        handleSubmit={handleSubmit}
        editingId={editingId}
        error={error}
        message={message}
        resetForm={resetForm}
      />
    </section>
  );
}
