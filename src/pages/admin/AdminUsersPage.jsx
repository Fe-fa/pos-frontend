import { X, Plus, ChevronDown, CheckCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { userService } from '../../services/userService';
import { Edit, Store, UserX } from 'lucide-react';
import { extractPaginated, EMPTY_META } from '../../utils/pagination';

const initialForm = {
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  password_confirmation: '',
  role: 'cashier',
  is_active: true,
  store_ids: [],
  shift_name: '',
  shift_start: '',
  shift_end: '',
};

function normalizeUser(user) {
  return {
    ...user,
    stores: Array.isArray(user?.stores) ? user.stores : [],
    full_name:
      user?.full_name ||
      [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
      user?.username,
  };
}

function formatShift(user) {
  if (user?.shift?.label) return user.shift.label;
  if (user?.shift_label) return user.shift_label;
  if (user?.shift_name && user?.shift_start && user?.shift_end)
    return `${user.shift_name} (${user.shift_start} - ${user.shift_end})`;
  if (user?.shift_name) return user.shift_name;
  if (user?.shift_start && user?.shift_end) return `${user.shift_start} - ${user.shift_end}`;
  return 'Not assigned';
}

export default function AdminUsersPage() {
  const { user, can } = useAuth();
  const canManage = can('users.manage') || can('users.assign');
  const { stores, activeStore } = useStore();

  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [message, setMessage]         = useState('');
  const [meta, setMeta]               = useState({ ...EMPTY_META });
  const [page, setPage]               = useState(1);
  // null = "not yet resolved from backend"; once first response comes in we lock to meta.per_page
  const [perPage, setPerPage]         = useState(null);
  const [roleFilter, setRoleFilter]   = useState(user?.role === 'admin' ? 'all' : 'cashier');
  const [assignmentFilter, setAssignmentFilter] = useState('all');

  const [openForm, setOpenForm]           = useState(false);
  const [openAssign, setOpenAssign]       = useState(false);
  const [editingUser, setEditingUser]     = useState(null);
  const [assigningUser, setAssigningUser] = useState(null);
  const [form, setForm]                   = useState(initialForm);
  const [assignStoreIds, setAssignStoreIds] = useState([]);
  const [submitting, setSubmitting]       = useState(false);

  const isAdmin = user?.role === 'admin';

  // Stable ref so load() always reads latest values without being in its dep array
  const paramsRef = useRef({});
  paramsRef.current = { page, perPage, roleFilter, assignmentFilter, isAdmin, activeStore };

  const selectableStores = useMemo(() => {
    if (isAdmin) return stores;
    return activeStore ? [activeStore] : stores;
  }, [activeStore, isAdmin, stores]);

  const summary = useMemo(
    () => ({
      managers:   rows.filter((r) => r.role === 'manager').length,
      cashiers:   rows.filter((r) => r.role === 'cashier').length,
      admins:     rows.filter((r) => r.role === 'admin').length,
      unassigned: rows.filter((r) => r.role !== 'admin' && !(r.stores || []).length).length,
    }),
    [rows]
  );

  // Abort controller ref so we can cancel in-flight requests on unmount / rapid filter changes
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    // Cancel any previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const { page: pg, perPage: pp, roleFilter: rf, assignmentFilter: af, isAdmin: ia, activeStore: as } =
      paramsRef.current;

    setLoading(true);
    setError('');

    try {
      const params = {
        // If perPage is still null (first load), omit it so backend returns its default
        ...(pp !== null && { per_page: pp }),
        page: pg,
      };

      if (rf !== 'all') params.role = rf;
      if (af !== 'all') params.assigned = af;
      if (!ia && as?.store_id) params.store_id = as.store_id;

      const response = await userService.list(params, { signal: abortRef.current.signal });
      // Use backend's per_page as the resolved default on first load
      const resolvedPerPage = pp ?? response?.meta?.per_page ?? response?.data?.meta?.per_page ?? 10;
      const parsed = extractPaginated(response, resolvedPerPage);

      setRows(parsed.data.map(normalizeUser));
      setMeta(parsed.meta);

      // Lock in backend's per_page on the very first load
      if (pp === null) setPerPage(parsed.meta.per_page ?? resolvedPerPage);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return; // ignore cancelled
      setError(err?.response?.data?.message || 'Unable to load users.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads from paramsRef

  // Single unified effect; load() is stable so this only re-runs when the tracked values change
  useEffect(() => {
    load();
  }, [load, roleFilter, assignmentFilter, activeStore?.store_id, page, perPage]);

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Filter handlers always reset to page 1 to avoid landing on a missing page
  const handleRoleFilter       = useCallback((v) => { setRoleFilter(v);       setPage(1); }, []);
  const handleAssignmentFilter = useCallback((v) => { setAssignmentFilter(v); setPage(1); }, []);
  const handlePerPage          = useCallback((v) => { setPerPage(v);           setPage(1); }, []);

  // ── Modal helpers ────────────────────────────────────────────────────────────

  const closeFormModal = useCallback(() => {
    if (submitting) return;
    setOpenForm(false);
    setEditingUser(null);
    setForm(initialForm);
    setError('');
  }, [submitting]);

  const closeAssignModal = useCallback(() => {
    if (submitting) return;
    setOpenAssign(false);
    setAssigningUser(null);
    setAssignStoreIds([]);
    setError('');
  }, [submitting]);

  const openCreateModal = useCallback(() => {
    setEditingUser(null);
    setForm({
      ...initialForm,
      role:      isAdmin ? 'manager' : 'cashier',
      store_ids: !isAdmin && activeStore ? [String(activeStore.store_id)] : [],
    });
    setOpenForm(true);
    setMessage('');
    setError('');
  }, [isAdmin, activeStore]);

  const openEditModal = useCallback((row) => {
    setEditingUser(row);
    setForm({
      first_name:            row.first_name || '',
      last_name:             row.last_name  || '',
      username:              row.username   || '',
      email:                 row.email      || '',
      phone:                 row.phone      || '',
      password:              '',
      password_confirmation: '',
      role:                  row.role       || 'cashier',
      is_active:             !!row.is_active,
      store_ids:             (row.stores || []).map((s) => String(s.store_id)),
      shift_name:            row.shift_name  || '',
      shift_start:           row.shift_start || '',
      shift_end:             row.shift_end   || '',
    });
    setOpenForm(true);
    setMessage('');
    setError('');
  }, []);

  const openAssignModal = useCallback((row) => {
    setAssigningUser(row);
    setAssignStoreIds((row.stores || []).map((s) => String(s.store_id)));
    setOpenAssign(true);
    setMessage('');
    setError('');
  }, []);

  const handleStoreToggle = useCallback((id) => {
    setForm((cur) => ({
      ...cur,
      store_ids: cur.store_ids.includes(id)
        ? cur.store_ids.filter((v) => v !== id)
        : [...cur.store_ids, id],
    }));
  }, []);

  const handleAssignStoreToggle = useCallback((id) => {
    setAssignStoreIds((cur) =>
      cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]
    );
  }, []);

  // ── Submit handlers ──────────────────────────────────────────────────────────

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const payload = {
        ...form,
        store_ids:        form.role === 'admin' ? [] : form.store_ids.map(Number),
        default_store_id: form.role === 'admin' ? null : Number(form.store_ids[0] || '') || null,
        shift_name:       form.role === 'admin' ? null : form.shift_name.trim() || null,
        shift_start:      form.role === 'admin' ? null : form.shift_start || null,
        shift_end:        form.role === 'admin' ? null : form.shift_end   || null,
      };

      if (editingUser && !payload.password) {
        delete payload.password;
        delete payload.password_confirmation;
      }

      if (!isAdmin) {
        payload.role             = 'cashier';
        payload.store_ids        = activeStore ? [Number(activeStore.store_id)] : [];
        payload.default_store_id = activeStore ? Number(activeStore.store_id) : null;
      }

      // Sequential: create/update first, then sync stores
      let response;
      if (editingUser) {
        response = await userService.update(editingUser.user_id, payload);
      } else {
        response = await userService.create(payload);
      }

      const targetUserId =
        response?.data?.user_id      ||
        response?.data?.data?.user_id ||
        response?.user?.user_id       ||
        editingUser?.user_id;

      if (targetUserId && payload.role !== 'admin') {
        await userService.syncStores(targetUserId, payload.store_ids || []);
      }

      // Close modal, show message, reset page, reload — one reload only
      setOpenForm(false);
      setEditingUser(null);
      setForm(initialForm);
      setMessage(editingUser ? 'User updated successfully.' : 'User created successfully.');
      setPage(1);
      await load();
    } catch (err) {
      const errors     = err?.response?.data?.errors;
      const firstError = errors ? Object.values(errors)[0]?.[0] : null;
      setError(firstError || err?.response?.data?.message || 'Unable to save user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      await userService.syncStores(assigningUser.user_id, assignStoreIds.map(Number));
      setOpenAssign(false);
      setAssigningUser(null);
      setAssignStoreIds([]);
      setMessage('Store assignment updated successfully.');
      setPage(1);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update store assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (row) => {
    if (!window.confirm(`Deactivate ${row.full_name || row.username}?`)) return;
    try {
      await userService.remove(row.user_id);
      setMessage('User updated successfully.');
      setPage(1);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update user.');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <section className="stack-lg" style={{ position: 'relative' }}>

        {/* ── Section header + controls (horizontal toolbar) ── */}
        <div className="section-header split-header">
          <div>
            <h3>{isAdmin ? 'Users & access' : 'Cashier assignments'}</h3>
          </div>
        </div>

        <div className="metrics-grid">
          {isAdmin ? (
            <>
              <article className="metric-card metric-tone-soft">
                <div className="metric-card-top">
                  <p>Managers</p>
                  <div className="metric-icon-badge"><Store size={18} /></div>
                </div>
                <h3>{summary.managers}</h3>
              </article>

              <article className="metric-card metric-tone-teal">
                <div className="metric-card-top">
                  <p>Cashiers</p>
                  <div className="metric-icon-badge"><Edit size={18} /></div>
                </div>
                <h3>{summary.cashiers}</h3>
              </article>

              <article className="metric-card metric-tone-gold">
                <div className="metric-card-top">
                  <p>Admins</p>
                  <div className="metric-icon-badge"><Plus size={18} /></div>
                </div>
                <h3>{summary.admins}</h3>
              </article>

              <article className={`metric-card ${summary.unassigned > 0 ? 'metric-tone-danger' : 'metric-tone-success'}`}>
                <div className="metric-card-top">
                  <p>Unassigned</p>
                  <div className="metric-icon-badge"><UserX size={18} /></div>
                </div>
                <h3>{summary.unassigned}</h3>
              </article>
            </>
          ) : (
            <>
              <article className="metric-card metric-tone-teal">
                <div className="metric-card-top">
                  <p>Cashiers</p>
                  <div className="metric-icon-badge"><Edit size={18} /></div>
                </div>
                <h3>{summary.cashiers}</h3>
              </article>

              <article className={`metric-card ${summary.unassigned > 0 ? 'metric-tone-danger' : 'metric-tone-success'}`}>
                <div className="metric-card-top">
                  <p>Unassigned</p>
                  <div className="metric-icon-badge"><UserX size={18} /></div>
                </div>
                <h3>{summary.unassigned}</h3>
              </article>

              <article className="metric-card metric-tone-soft">
                <div className="metric-card-top">
                  <p>Store</p>
                  <div className="metric-icon-badge"><Store size={18} /></div>
                </div>
                <h3>{activeStore?.store_name || '—'}</h3>
              </article>
          <article className="metric-card metric-tone-brown">
                <div className="metric-card-top">
                  <p>Status</p>
                  <div className="metric-icon-badge"><CheckCircle size={18} /></div>
                </div>
                <h3>Managed</h3>
              </article>
            </>
          )}
        </div>

        <div className="users-toolbar-row">
          {/* Grouped filters + per-page, visually unified as one toolbar pill */}
          <div className="users-toolbar-controls">
            {/* Role filter */}
            <select
              className="select-input users-filter-select"
              value={roleFilter}
              onChange={(e) => handleRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              {isAdmin && <option value="manager">Managers</option>}
              <option value="cashier">Cashiers</option>
              {isAdmin && <option value="admin">Admins</option>}
            </select>

            {/* Assignment filter */}
            <select
              className="select-input users-filter-select"
              value={assignmentFilter}
              onChange={(e) => handleAssignmentFilter(e.target.value)}
              aria-label="Filter by assignment"
            >
              <option value="all">All assignments</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>

            <span className="users-toolbar-divider" aria-hidden="true" />

            {/* Per-page selector — disabled until backend resolves the default */}
            <div className="users-perpage-wrap">
              <select
                value={perPage ?? ''}
                onChange={(e) => handlePerPage(Number(e.target.value))}
                disabled={perPage === null}
                aria-label="Rows per page"
              >
                {perPage === null && <option value="">—</option>}
                {[10, 25, 50, 100].map((n) => (
                 <option  key={n} value={n}>{n} </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          </div>

          {/* Create button */}
          <button
            type="button"
            className="primary-button users-create-btn"
            onClick={openCreateModal}
            disabled={submitting}
            aria-label={isAdmin ? 'Create new user' : 'Create new cashier'}
            aria-busy={submitting}
            style={{
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            <Plus size={18} />
            {submitting ? 'Creating…' : isAdmin ? 'New user' : 'New cashier'}
          </button>
        </div>

        {/* Global feedback */}
        {error   && !openForm && !openAssign && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        {/* ── Table ── */}
        <article className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Stores</th>
                  <th>Shift</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

             <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6">Loading...</td>
                  </tr>
                ) : !rows.length ? (
                  <tr><td colSpan="6">No users found.</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.user_id}>
                      <td>
                        <strong>{row.full_name}</strong>
                        <div className="muted">{row.email || row.username}</div>
                      </td>
                      <td><span className="badge">{row.role}</span></td>
                      <td>
                        {(row.stores || []).length
                          ? row.stores.map((s) => s.store_name).join(', ')
                          : 'Pending assignment'}
                      </td>
                      <td>{formatShift(row)}</td>
                      <td>
                        <span className={`badge ${row.is_active ? 'success' : 'danger'}`}>
                          {row.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions compact">
                          <button type="button" className="ghost-button" onClick={() => openEditModal(row)} title="Edit">
                            <Edit size={16} />
                          </button>
                          {row.role !== 'admin' && (
                            <button type="button" className="ghost-button" onClick={() => openAssignModal(row)} title="Assign stores">
                              <Store size={16} />
                            </button>
                          )}
                          {row.role !== 'admin' && (
                            <button type="button" className="ghost-button danger" onClick={() => handleDeactivate(row)} title="Deactivate">
                              <UserX size={16} />
                            </button>
                          )}
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
              {meta.from && meta.to
                ? `Showing ${meta.from}–${meta.to} of ${meta.total}`
                : `${rows.length} user${rows.length !== 1 ? 's' : ''}`}
            </span>

            <div className="row-actions compact">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={!meta.has_prev_page}
              >
                Previous
              </button>

              <span className="muted" style={{ padding: '0 8px' }}>
                {/* {meta.current_page } {meta.last_page} */}
              </span>

              <button
                type="button"
                className="ghost-button"
                onClick={() => setPage((p) => Math.min(p + 1, meta.last_page))}
                disabled={!meta.has_next_page}
              >
                Next
              </button>
            </div>
          </div>
        </article>
      </section>

      {/* ── Create / Edit modal ── */}
      {openForm && (
        <div className="modal-backdrop" onClick={closeFormModal}>
          <div className="modal-card form-modal-card form-modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingUser ? 'Edit user' : isAdmin ? 'Create user' : 'Create cashier'}</h3>
                <p className="muted">Manage account details, role, password, store access, and shift.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeFormModal} disabled={submitting}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <form className="catalog-form-grid" onSubmit={handleSubmit}>
                <label>
                  First name
                  <input className="text-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
                </label>

                <label>
                  Last name
                  <input className="text-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
                </label>

                <label>
                  Username
                  <input className="text-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                </label>

                <label>
                  Email
                  <input className="text-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </label>

                <label>
                  Phone
                  <input className="text-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>

                <label>
                  Role
                  <select
                    className="select-input"
                    value={form.role}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        role:        e.target.value,
                        store_ids:   e.target.value === 'admin' ? [] : form.store_ids,
                        shift_name:  e.target.value === 'admin' ? '' : form.shift_name,
                        shift_start: e.target.value === 'admin' ? '' : form.shift_start,
                        shift_end:   e.target.value === 'admin' ? '' : form.shift_end,
                      })
                    }
                    disabled={!isAdmin}
                  >
                    {isAdmin && <option value="manager">Manager</option>}
                    <option value="cashier">Cashier</option>
                    {isAdmin && <option value="admin">Admin</option>}
                  </select>
                </label>

                <label>
                  Password
                  <input
                    className="text-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                    required={!editingUser}
                  />
                </label>

                <label>
                  Confirm password
                  <input
                    className="text-input"
                    type="password"
                    value={form.password_confirmation}
                    onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
                    required={!editingUser || !!form.password}
                  />
                </label>

                {form.role !== 'admin' && (
                  <>
                    <div className="span-2 stack-md">
                      <strong>Shift assignment</strong>
                      <div className="catalog-form-grid">
                        <label>
                          Shift name
                          <input className="text-input" value={form.shift_name} onChange={(e) => setForm({ ...form, shift_name: e.target.value })} placeholder="Example: Morning Shift" />
                        </label>
                        <label>
                          Shift start
                          <input className="text-input" type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} />
                        </label>
                        <label>
                          Shift end
                          <input className="text-input" type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} />
                        </label>
                        <div className="info-tile compact">
                          <span className="muted">Preview</span>
                          <strong>
                            {form.shift_name || form.shift_start || form.shift_end
                              ? [
                                  form.shift_name || null,
                                  form.shift_start && form.shift_end ? `(${form.shift_start} - ${form.shift_end})` : null,
                                ].filter(Boolean).join(' ')
                              : 'No shift assigned'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="span-2 stack-md">
                      <strong>Store assignment</strong>
                      <div className="selection-grid">
                        {selectableStores.map((store) => {
                          const id      = String(store.store_id);
                          const checked = form.store_ids.includes(id);
                          return (
                            <label key={id} className="selection-card">
                              <input type="checkbox" checked={checked} onChange={() => handleStoreToggle(id)} />
                              <div>
                                <strong>{store.store_name}</strong>
                                <span>{store.location || store.currency}</span>
                              </div>
                            </label>
                          );
                        })}
                        {!selectableStores.length && <p className="muted">No stores available for assignment yet.</p>}
                      </div>
                    </div>
                  </>
                )}

                <label className="checkbox-row span-2 catalog-check">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  <span>User is active</span>
                </label>

                {error && <p className="form-error span-2">{error}</p>}

                <div className="catalog-modal-actions span-2">
                  <button type="button" className="ghost-button" onClick={closeFormModal} disabled={submitting}>Cancel</button>
                  <button className="catalog-primary-btn" type="submit" disabled={submitting}>
                    {submitting ? (editingUser ? 'Saving…' : 'Creating…') : editingUser ? 'Save changes' : 'Create user'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign stores modal ── */}
      {openAssign && (
        <div className="modal-backdrop" onClick={closeAssignModal}>
          <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Assign stores</h3>
                <p className="muted">
                  {assigningUser ? assigningUser.full_name || assigningUser.username : ''} — select all stores this user can access.
                </p>
              </div>
              <button type="button" className="icon-button" onClick={closeAssignModal} disabled={submitting}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <form className="stack-md" onSubmit={handleAssignSubmit}>
                <div className="selection-grid">
                  {selectableStores.map((store) => {
                    const id      = String(store.store_id);
                    const checked = assignStoreIds.includes(id);
                    return (
                      <label key={id} className="selection-card">
                        <input type="checkbox" checked={checked} onChange={() => handleAssignStoreToggle(id)} />
                        <div>
                          <strong>{store.store_name}</strong>
                          <span>{store.location || store.currency}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {error && <p className="form-error">{error}</p>}

                <div className="catalog-modal-actions">
                  <button type="button" className="ghost-button" onClick={closeAssignModal} disabled={submitting}>Cancel</button>
            <button className="catalog-primary-btn" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save assignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
