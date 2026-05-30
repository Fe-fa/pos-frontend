import { useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, Phone, Store as StoreIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { storeService } from '../../services/storeService';

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
      <span>{caption}</span>
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
    const currencies = new Set(stores.map((store) => store.currency).filter(Boolean)).size;

    return { active, inactive, currencies };
  }, [stores]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
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
          <h2>Stores</h2>
        </div>
      </div>

      <div className="metrics-grid">
        <SummaryCard icon={StoreIcon} label="Stores" value={stores.length} caption="This page" />
        <SummaryCard icon={Building2} label="Active" value={summary.active} caption="This page" />
        <SummaryCard icon={MapPin} label="Inactive" value={summary.inactive} caption="This page" />
        <SummaryCard icon={Phone} label="Currencies" value={summary.currencies} caption="This page" />
      </div>

      <div className="dashboard-grid two-wide">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>{editingId ? 'Edit store' : 'Create store'}</h3>
              <p>System admin access only</p>
            </div>
          </div>

          <form className="form-grid two-columns" onSubmit={handleSubmit}>
            <label>
              Store name
              <input
                className="text-input"
                value={form.store_name}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                required
              />
            </label>

            <label>
              Location
              <input
                className="text-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                required
              />
            </label>

            <label>
              Currency
              <input
                className="text-input"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                required
              />
            </label>

            <label>
              Telephone
              <input
                className="text-input"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              />
            </label>

            <label>
              PIN / registration
              <input
                className="text-input"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
              />
            </label>

            <label>
              Email address
              <input
                className="text-input"
                type="email"
                value={form.email_address}
                onChange={(e) => setForm({ ...form, email_address: e.target.value })}
              />
            </label>

            <label className="span-2">
              Physical address
              <textarea
                className="text-input"
                rows="3"
                value={form.physical_address}
                onChange={(e) => setForm({ ...form, physical_address: e.target.value })}
              />
            </label>

            <label className="span-2">
              Logo URL
              <input
                className="text-input"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </label>

            <label className="checkbox-row span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span>Store is active</span>
            </label>

            {error ? <p className="form-error span-2">{error}</p> : null}
            {message ? <p className="form-success span-2">{message}</p> : null}

            <div className="row-actions span-2">
              <button className="primary-button" type="submit">
                {editingId ? 'Update store' : 'Create store'}
              </button>
              <button type="button" className="ghost-button" onClick={resetForm}>
                Clear
              </button>
            </div>
          </form>
        </article>

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
                          <button className="ghost-button" onClick={() => handleEdit(store)}>
                            Edit
                          </button>
                          <button
                            className="ghost-button danger"
                            onClick={() => handleDelete(store.store_id)}
                          >
                            Deactivate
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
    </section>
  );
}
