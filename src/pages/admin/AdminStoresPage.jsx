import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  Coins,
  Store as StoreIcon,
  Edit,
  Ban,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { storeService } from '../../services/storeService';
import StoreModal from '../../components/modals/StoreModal';

const initialForm = {
  store_name:       '',
  location:         '',
  currency:         'KES',
  telephone:        '',
  pin:              '',
  physical_address: '',
  email_address:    '',
  logo_url:         '',
  is_active:        true,
};

const EMPTY_PAGINATION = {
  current_page:  1,
  last_page:     1,
  per_page:      null, // null = not yet resolved from backend
  total:         0,
  from:          null,
  to:            null,
  has_prev_page: false,
  has_next_page: false,
};

/** Normalise whatever shape the API returns into a flat pagination object */
function extractPagination(response) {
  const payload = response?.data ?? response ?? {};

  // Paginated envelope: { data: [...], meta: { current_page, last_page, ... } }
  if (Array.isArray(payload?.data) && payload?.meta) {
    const m = payload.meta;
    return {
      data:          payload.data,
      current_page:  m.current_page  ?? 1,
      last_page:     m.last_page     ?? 1,
      per_page:      m.per_page      ?? null,
      total:         m.total         ?? payload.data.length,
      from:          m.from          ?? null,
      to:            m.to            ?? null,
      has_prev_page: (m.current_page ?? 1) > 1,
      has_next_page: (m.current_page ?? 1) < (m.last_page ?? 1),
    };
  }

  // Legacy paginated envelope: { data: [...], current_page, prev_page_url, next_page_url, ... }
  if (Array.isArray(payload?.data)) {
    return {
      data:          payload.data,
      current_page:  payload.current_page  ?? 1,
      last_page:     payload.last_page      ?? 1,
      per_page:      payload.per_page       ?? null,
      total:         payload.total          ?? payload.data.length,
      from:          payload.from           ?? null,
      to:            payload.to             ?? null,
      has_prev_page: !!payload.prev_page_url,
      has_next_page: !!payload.next_page_url,
    };
  }

  // Bare array (no pagination)
  if (Array.isArray(payload)) {
    return {
      ...EMPTY_PAGINATION,
      data:          payload,
      per_page:      payload.length,
      total:         payload.length,
      from:          payload.length ? 1 : null,
      to:            payload.length || null,
    };
  }

  return { ...EMPTY_PAGINATION, data: [] };
}
function SummaryCard({ icon: Icon, label, value, tone }) {
  return (
    <article className={`metric-card metric-tone-${tone}`}>
      <div className="metric-card-top">
        <p>{label}</p>
        <div className="metric-icon-badge"><Icon size={18} /></div>
      </div>
      <h3>{value}</h3>
    </article>
  );
}

export default function AdminStoresPage() {
  const { user, can } = useAuth();
  const canManageStores = user?.role === 'admin';

  const [stores, setStores]       = useState([]);
  const [pagination, setPagination] = useState({ ...EMPTY_PAGINATION });
  const [page, setPage]           = useState(1);
  // null = not yet resolved; locked to meta.per_page after first successful load
  const [perPage, setPerPage]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [message, setMessage]     = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [form, setForm]               = useState(initialForm);

  // Stable ref so load() always reads the latest values without being listed in deps
  const paramsRef = useRef({});
  paramsRef.current = { page, perPage };

  // Abort controller ref — cancels stale in-flight requests on rapid page changes / unmount
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const { page: pg, perPage: pp } = paramsRef.current;

    setLoading(true);
    setError('');

    try {
      const params = {
        page,
        // Omit per_page on first load so the backend returns its own default
        ...(pp !== null && { per_page: pp }),
      };

      const response = await storeService.list(params, { signal: abortRef.current.signal });
      const parsed   = extractPagination(response);

      setStores(parsed.data);
      setPagination(parsed);

      // Lock in the backend's per_page on the very first successful load
      if (pp === null && parsed.per_page !== null) {
        setPerPage(parsed.per_page);
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      setError(err?.response?.data?.message || 'Unable to load stores.');
      setStores([]);
      setPagination({ ...EMPTY_PAGINATION });
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads live values from paramsRef

  // Re-run only when page or perPage actually changes
  useEffect(() => {
    load();
  }, [load, page, perPage]);

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  const summary = useMemo(() => {
    const active     = stores.filter((s) => s.is_active).length;
    const inactive   = stores.length - active;
    const currencies = new Set(stores.map((s) => s.currency).filter(Boolean)).size;
    return { active, inactive, currencies };
  }, [stores]);

  // ── Modal helpers ────────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
    setMessage('');
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    resetForm();
    setIsModalOpen(true);
  }, [resetForm]);

  const handleEdit = useCallback((store) => {
    setEditingId(store.store_id);
    setForm({
      store_name:       store.store_name       || '',
      location:         store.location         || '',
      currency:         store.currency         || 'KES',
      telephone:        store.telephone        || '',
      pin:              store.pin              || '',
      physical_address: store.physical_address || '',
      email_address:    store.email_address    || '',
      logo_url:         store.logo_url         || '',
      is_active:        Boolean(store.is_active),
    });
    setMessage('');
    setError('');
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    if (submitting) return;
    setIsModalOpen(false);
    resetForm();
  }, [submitting, resetForm]);

  // ── Submit handlers ──────────────────────────────────────────────────────────

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      if (editingId) {
        await storeService.update(editingId, form);
        setMessage('Store updated successfully.');
      } else {
        await storeService.create(form);
        setMessage('Store created successfully.');
      }

      // Close modal + reset, then reload once
      setIsModalOpen(false);
      setEditingId(null);
      setForm(initialForm);
      setPage(1);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to save store.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (targetStoreId) => {
    if (!window.confirm('Deactivate this store?')) return;

    setSubmitting(true);
    try {
      await storeService.remove(targetStoreId);
      setMessage('Store deactivated successfully.');

      // If we just deleted the last item on a page beyond 1, step back
      const newPage = stores.length === 1 && page > 1 ? page - 1 : page;
      if (newPage !== page) {
        setPage(newPage); // useEffect will trigger load()
      } else {
        await load();     // same page — reload directly
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to remove store.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Access guard ─────────────────────────────────────────────────────────────

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
  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <section className="stack-lg" style={{ position: 'relative' }}>

   
      {/* <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>


      {loading && !submitting && (
        <div
          style={{
            position:       'absolute',
            inset:          0,
            zIndex:         10,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     'rgba(var(--color-bg-rgb, 255 255 255) / 0.6)',
            backdropFilter: 'blur(2px)',
            borderRadius:   'inherit',
            pointerEvents:  'none',
          }}
          aria-live="polite"
          aria-label="Loading stores"
        >
          <Loader2
            size={32}
            style={{ animation: 'spin 0.8s linear infinite', color: 'var(--color-primary, #6366f1)' }}
          />
        </div>
      )} */}

      {/* ── Page header ── */}
      <div className="section-header">
        <div><h3>Stores</h3></div>
        <button type="button" className="primary-button" onClick={handleOpenCreateModal} disabled={submitting}>
          Create store
        </button>
      </div>

      {/* Global feedback — suppressed while modal is open (modal shows its own) */}
      {message && !isModalOpen && <p className="form-success">{message}</p>}
      {error   && !isModalOpen && <p className="form-error">{error}</p>}

      {/* ── Summary cards ── */}
      <div className="metrics-grid">
       <SummaryCard icon={StoreIcon}   label="Stores"      value={stores.length}      tone="soft" />
        <SummaryCard icon={CheckCircle} label="Active"      value={summary.active}     tone="success" />
        <SummaryCard icon={Ban}         label="Inactive"    value={summary.inactive}   tone={summary.inactive > 0 ? 'danger' : 'brown'} />
       <SummaryCard icon={Coins}       label="Currencies"  value={summary.currencies} tone="gold" />
      </div>

      {/* ── Table card ── */}
      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>All stores</h3>
              <p>
                {pagination.from && pagination.to
                  ? `Showing ${pagination.from}–${pagination.to} of ${pagination.total}`
                  : `${stores.length} location${stores.length !== 1 ? 's' : ''}`}
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
                {!loading && !stores.length ? (
                  <tr><td colSpan="5">No stores found.</td></tr>
                ) : (
                  stores.map((store) => (
                    <tr key={store.store_id}>
                      <td>
                        <strong>{store.store_name}</strong>
                        <div className="muted">{store.currency}</div>
                      </td>
                      <td>{store.location || store.physical_address || '—'}</td>
                      <td>
                        <div>{store.email_address || '—'}</div>
                        <div className="muted">{store.telephone || '—'}</div>
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
                            disabled={submitting}
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => handleDelete(store.store_id)}
                            disabled={submitting}
                            title="Deactivate"
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination bar ── */}
          <div
            className="row-actions"
            style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}
          >
            <span className="muted">
              Page {pagination.current_page} of {pagination.last_page}
            </span>

            <div className="row-actions compact">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={!pagination.has_prev_page || loading || submitting}
              >
                Previous
              </button>

              <span className="muted" style={{ padding: '0 8px' }}>
                {/* {pagination.current_page}  {pagination.last_page} */}
              </span>

              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((p) => Math.min(p + 1, pagination.last_page))}
                disabled={!pagination.has_next_page || loading || submitting}
              >
                Next
              </button>
            </div>
          </div>
        </article>
      </div>
      <StoreModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        form={form}
        setForm={setForm}
        handleSubmit={handleSubmit}
        editingId={editingId}
        error={error}
        message={message}
        submitting={submitting}
        resetForm={resetForm}
      />
    </section>
  );
}
