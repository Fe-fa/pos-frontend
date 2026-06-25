import {
  LockKeyhole,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  FileKey,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { accessControlService } from '../../services/accessControlService';
import { useAuth } from '../../contexts/AuthContext';

// ── Constants ────────────────────────────────────────────────────────────────

const editableRoles    = ['manager', 'cashier'];
const assignableRoles  = ['admin', 'manager', 'cashier'];

// Only page.* permissions are shown in the per-user page access tab.
const PAGE_PREFIX = 'page.';

// ── Pure helpers ─────────────────────────────────────────────────────────────

function formatTitle(value = '') {
  return value.replaceAll('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupPermissions(permissions) {
  return permissions.reduce((acc, permission) => {
    const group = permission.name.includes('.')
      ? permission.name.split('.')[0]
      : 'general';
    if (!acc[group]) acc[group] = [];
    acc[group].push(permission);
    return acc;
  }, {});
}

function getRoleBadgeClass(role = '') {
  switch (role) {
    case 'admin':   return 'role-badge role-admin';
    case 'manager': return 'role-badge role-manager';
    case 'cashier': return 'role-badge role-cashier';
    default:        return 'role-badge';
  }
}

function getRoleDescription(roleName = '') {
  switch (roleName) {
    case 'manager': return 'Balanced operational control for supervisors and store leads.';
    case 'cashier': return 'Focused front-desk permissions for fast and secure checkout flow.';
    default:        return 'Permission template';
  }
}

// ── Sub-component: Per-user page permissions panel ───────────────────────────

function UserPagePermissionsPanel({ users, allPermissions, onFeedback }) {
  // Which user row is expanded
  const [expandedUserId, setExpandedUserId] = useState(null);
  // Loaded state: { [userId]: { role_permissions, direct_permissions, all_permissions } }
  const [userPerms, setUserPerms] = useState({});
  const [loadingId, setLoadingId]   = useState(null);
  const [savingId, setSavingId]     = useState(null);
  // Local edits before save: { [userId]: Set<string> }
  const [draftPerms, setDraftPerms] = useState({});

  const pagePermissions = useMemo(
    () => allPermissions.filter((p) => p.name.startsWith(PAGE_PREFIX)),
    [allPermissions]
  );

  const toggleExpand = useCallback(async (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);

    // Already loaded — just open
    if (userPerms[userId]) return;

    setLoadingId(userId);
    try {
      const data = await accessControlService.getUserPermissions(userId);
      const perms = data?.data ?? data;
      setUserPerms((prev) => ({ ...prev, [userId]: perms }));
      // Seed draft with current all_permissions (role + direct)
      setDraftPerms((prev) => ({
        ...prev,
        [userId]: new Set(perms.all_permissions ?? []),
      }));
    } catch (err) {
      onFeedback({ type: 'error', msg: err?.response?.data?.message || 'Could not load user permissions.' });
      setExpandedUserId(null);
    } finally {
      setLoadingId(null);
    }
  }, [expandedUserId, userPerms, onFeedback]);

  const togglePerm = useCallback((userId, permName) => {
    setDraftPerms((prev) => {
      const next = new Set(prev[userId] ?? []);
      if (next.has(permName)) next.delete(permName);
      else next.add(permName);
      return { ...prev, [userId]: next };
    });
  }, []);

  const saveUserPerms = useCallback(async (userId) => {
    setSavingId(userId);
    onFeedback(null);
    try {
      const permissions = Array.from(draftPerms[userId] ?? []);
      const data = await accessControlService.updateUserPermissions(userId, { permissions });
      const perms = data?.data ?? data;
      setUserPerms((prev) => ({ ...prev, [userId]: perms }));
      setDraftPerms((prev) => ({
        ...prev,
        [userId]: new Set(perms.all_permissions ?? permissions),
      }));
      onFeedback({ type: 'success', msg: 'User page permissions updated.' });
    } catch (err) {
      onFeedback({ type: 'error', msg: err?.response?.data?.message || 'Could not save permissions.' });
    } finally {
      setSavingId(null);
    }
  }, [draftPerms, onFeedback]);

  if (!pagePermissions.length) {
    return <p className="muted">No page permissions found in the system.</p>;
  }

  return (
    <div className="uperm-shell">
      <p className="uperm-hint">
        Expand a user to grant or revoke individual page access. Direct permissions
        are layered <em>on top of</em> their role template — the effective set shown
        here reflects both.
      </p>

      <div className="uperm-list">
        {users.map((member) => {
          const isOpen    = expandedUserId === member.user_id;
          const isLoading = loadingId === member.user_id;
          const isSaving  = savingId  === member.user_id;
          const loaded    = userPerms[member.user_id];
          const draft     = draftPerms[member.user_id];

          return (
            <div key={member.user_id} className={`uperm-row ${isOpen ? 'is-open' : ''}`}>
              {/* Header row */}
              <button
                type="button"
                className="uperm-row-head"
                onClick={() => toggleExpand(member.user_id)}
              >
                <div className="uperm-row-identity">
                  <strong>{member.full_name || 'Unnamed user'}</strong>
                  <span className="muted">{member.email}</span>
                </div>
                <div className="uperm-row-meta">
                  <span className={getRoleBadgeClass(member.role)}>
                    {member.role || 'No role'}
                  </span>
                  {isLoading
                    ? <Loader2 size={15} className="spin-soft" />
                    : isOpen
                      ? <ChevronUp size={15} />
                      : <ChevronDown size={15} />
                  }
                </div>
              </button>

              {/* Expanded permission grid */}
              {isOpen && !isLoading && (
                <div className="uperm-body">
                  {loaded && (
                    <div className="uperm-legend">
                      <span className="uperm-legend-item uperm-via-role">via role</span>
                      <span className="uperm-legend-item uperm-direct">direct</span>
                    </div>
                  )}

                  <div className="uperm-grid">
                    {pagePermissions.map((perm) => {
                      const isChecked   = draft?.has(perm.name) ?? false;
                      const viaRole     = loaded
                        ? (loaded.role_permissions ?? []).includes(perm.name)
                        : false;
                      const isDirect    = loaded
                        ? (loaded.direct_permissions ?? []).includes(perm.name)
                        : false;

                      return (
                        <label
                          key={perm.name}
                          className={`uperm-item ${isChecked ? 'is-checked' : ''} ${viaRole ? 'is-via-role' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePerm(member.user_id, perm.name)}
                            disabled={isSaving}
                          />
                          <div className="uperm-item-text">
                            <strong>{perm.label || formatTitle(perm.name)}</strong>
                            <span>{perm.name}</span>
                          </div>
                          {viaRole && (
                            <span className="uperm-source-badge uperm-via-role" title="Granted by role">R</span>
                          )}
                          {isDirect && !viaRole && (
                            <span className="uperm-source-badge uperm-direct" title="Direct permission">D</span>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <div className="uperm-footer">
                    <span className="muted uperm-count">
                      {draft?.size ?? 0} of {pagePermissions.length} pages enabled
                    </span>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => saveUserPerms(member.user_id)}
                      disabled={isSaving}
                    >
                      <Save size={14} />
                      {isSaving ? 'Saving...' : 'Save page access'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'roles',   label: 'Role templates',     icon: ShieldCheck },
  { id: 'users',   label: 'User role assign',   icon: Users },
  { id: 'pages',   label: 'User page access',   icon: FileKey },
];

export default function AdminAccessControlPage() {
  const { refreshProfile, user } = useAuth();

  const [tab, setTab]             = useState('roles');
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles]         = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [savingRole, setSavingRole] = useState('');
  const [savingUser, setSavingUser] = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await accessControlService.index();
      setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
      setRoles(Array.isArray(data.roles) ? data.roles : []);
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load access control data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const roleMap = useMemo(() =>
    roles.reduce((acc, role) => {
      acc[role.name] = new Set(role.permissions || []);
      return acc;
    }, {}),
  [roles]);

  const permissionGroups = useMemo(() => groupPermissions(permissions), [permissions]);

  const summary = useMemo(() => {
    const managerPermissions = roles.find((r) => r.name === 'manager')?.permissions?.length || 0;
    const cashierPermissions = roles.find((r) => r.name === 'cashier')?.permissions?.length || 0;
    const admins             = users.filter((m) => m.role === 'admin').length;
    return {
      totalPermissions: permissions.length,
      totalGroups: Object.keys(permissionGroups).length,
      managerPermissions,
      cashierPermissions,
      totalUsers: users.length,
      admins,
    };
  }, [roles, users, permissions, permissionGroups]);

  const toggleRolePermission = (roleName, permissionName) => {
    setRoles((prev) =>
      prev.map((role) => {
        if (role.name !== roleName) return role;
        const current = new Set(role.permissions || []);
        current.has(permissionName) ? current.delete(permissionName) : current.add(permissionName);
        return { ...role, permissions: Array.from(current).sort() };
      })
    );
  };

  const saveRolePermissions = async (roleName) => {
    const role = roles.find((item) => item.name === roleName);
    if (!role) return;
    setSavingRole(roleName);
    setError(''); setSuccess('');
    try {
      const data = await accessControlService.updateRolePermissions(roleName, {
        permissions: role.permissions || [],
      });
      setRoles((prev) =>
        prev.map((item) =>
          item.name === roleName
            ? { ...item, permissions: data?.data?.permissions || role.permissions || [] }
            : item
        )
      );
      if (user?.role === roleName) await refreshProfile();
      setSuccess(`${formatTitle(roleName)} permissions updated successfully.`);
    } catch (err) {
      setError(err?.response?.data?.message || `Unable to update ${roleName} permissions.`);
    } finally {
      setSavingRole('');
    }
  };

  const handleUserRoleChange = async (userId, roleName) => {
    if (!roleName) return;
    const existing = users.find((m) => m.user_id === userId);
    if (existing?.role === roleName) return;
    setSavingUser(String(userId));
    setError(''); setSuccess('');
    try {
      await accessControlService.assignUserRole(userId, { role: roleName });
      setUsers((prev) =>
        prev.map((m) => m.user_id === userId ? { ...m, role: roleName } : m)
      );
      if (user?.user_id === userId) await refreshProfile();
      setSuccess('User role updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to assign role.');
    } finally {
      setSavingUser('');
    }
  };

const handleUserPermFeedback = useCallback((feedback) => {
  if (!feedback?.type) { setError(''); setSuccess(''); return; }
  if (feedback.type === 'error')   setError(feedback.msg);
  if (feedback.type === 'success') setSuccess(feedback.msg);
}, []);

  return (
    <>
      <style>{`
        /* ── Tab bar ── */
        .ac-tab-bar { display:flex; gap:4px; border-bottom:1px solid var(--color-border,#e5e7eb); margin-bottom:24px; }
        .ac-tab { display:flex; align-items:center; gap:6px; padding:10px 16px; border:none; background:none;
          cursor:pointer; font-size:.875rem; color:var(--color-text-secondary,#6b7280); border-bottom:2px solid transparent;
          margin-bottom:-1px; transition:color .15s, border-color .15s; border-radius:6px 6px 0 0; }
        .ac-tab:hover { color:var(--color-text,#111); background:var(--color-surface-hover,#f3f4f6); }
        .ac-tab.is-active { color:var(--color-primary,#4f46e5); border-bottom-color:var(--color-primary,#4f46e5); font-weight:600; }

        /* ── User page permission panel ── */
        .uperm-shell { display:flex; flex-direction:column; gap:12px; }
        .uperm-hint { font-size:.8125rem; color:var(--color-text-secondary,#6b7280); margin:0 0 8px; line-height:1.5; }
        .uperm-list { display:flex; flex-direction:column; gap:8px; }

        .uperm-row { border:1px solid var(--color-border,#e5e7eb); border-radius:10px; overflow:hidden;
          transition:box-shadow .15s; }
        .uperm-row.is-open { box-shadow:0 2px 12px rgba(0,0,0,.07); }

        .uperm-row-head { width:100%; display:flex; align-items:center; justify-content:space-between;
          padding:12px 16px; background:none; border:none; cursor:pointer; text-align:left;
          gap:12px; }
        .uperm-row-head:hover { background:var(--color-surface-hover,#f9fafb); }
        .uperm-row-identity { display:flex; flex-direction:column; gap:2px; }
        .uperm-row-identity strong { font-size:.9rem; }
        .uperm-row-meta { display:flex; align-items:center; gap:10px; flex-shrink:0; }

        .uperm-body { padding:16px; border-top:1px solid var(--color-border,#e5e7eb);
          background:var(--color-surface,#fff); display:flex; flex-direction:column; gap:14px; }

        .uperm-legend { display:flex; gap:12px; align-items:center; font-size:.75rem; }
        .uperm-legend-item { display:flex; align-items:center; gap:4px; }
        .uperm-via-role { color:var(--color-primary,#4f46e5); }
        .uperm-direct   { color:var(--color-success,#16a34a); }

        .uperm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:8px; }
        .uperm-item { display:flex; align-items:center; gap:10px; padding:10px 12px;
          border:1px solid var(--color-border,#e5e7eb); border-radius:8px; cursor:pointer;
          transition:background .12s, border-color .12s; position:relative; }
        .uperm-item:hover { background:var(--color-surface-hover,#f9fafb); }
        .uperm-item.is-checked { background:var(--color-primary-light,#eff0ff);
          border-color:var(--color-primary,#4f46e5); }
        .uperm-item.is-via-role { border-style:dashed; }
        .uperm-item input[type=checkbox] { flex-shrink:0; accent-color:var(--color-primary,#4f46e5); }
        .uperm-item-text { display:flex; flex-direction:column; gap:1px; min-width:0; }
        .uperm-item-text strong { font-size:.8125rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .uperm-item-text span { font-size:.7rem; color:var(--color-text-secondary,#6b7280); white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis; }
        .uperm-source-badge { position:absolute; top:6px; right:6px; font-size:.6rem; font-weight:700;
          padding:1px 5px; border-radius:99px; }
        .uperm-source-badge.uperm-via-role { background:var(--color-primary-light,#eff0ff);
          color:var(--color-primary,#4f46e5); }
        .uperm-source-badge.uperm-direct   { background:#dcfce7; color:#16a34a; }

        .uperm-footer { display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding-top:12px; border-top:1px solid var(--color-border,#e5e7eb); }
        .uperm-count { font-size:.8125rem; }
      `}</style>

      <section className="stack-lg access-admin-page">
        {/* ── Hero ── */}
        <div className="access-hero-panel">
          <div className="access-hero-copy">
            <span className="access-hero-kicker">
              <Sparkles size={14} />
              Permission workspace
            </span>
            <h2 className="access-hero-title">Roles & Permissions</h2>
            <p className="access-hero-subtitle">
              Configure role templates, assign user roles, and fine-tune
              page-level access per user in one place.
            </p>
          </div>
          <div className="access-hero-actions">
            <button
              type="button"
              className="ghost-button access-refresh-btn"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'spin-soft' : ''} />
              {loading ? 'Refreshing...' : 'Refresh data'}
            </button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="access-summary-grid">
          <article className="access-summary-card">
            <div className="access-summary-top">
              <div>
                <p className="access-summary-label">System permissions</p>
                <strong className="access-summary-value">{summary.totalPermissions}</strong>
              </div>
              <span className="access-summary-icon tone-blue"><LockKeyhole size={18} /></span>
            </div>
            <p className="access-summary-note">Grouped into {summary.totalGroups} sections</p>
          </article>

          <article className="access-summary-card">
            <div className="access-summary-top">
              <div>
                <p className="access-summary-label">Manager template</p>
                <strong className="access-summary-value">{summary.managerPermissions}</strong>
              </div>
              <span className="access-summary-icon tone-indigo"><ShieldCheck size={18} /></span>
            </div>
            <p className="access-summary-note">Permissions for managers</p>
          </article>

          <article className="access-summary-card">
            <div className="access-summary-top">
              <div>
                <p className="access-summary-label">Cashier template</p>
                <strong className="access-summary-value">{summary.cashierPermissions}</strong>
              </div>
              <span className="access-summary-icon tone-orange"><UserCog size={18} /></span>
            </div>
            <p className="access-summary-note">Focused access for cashiers</p>
          </article>

          <article className="access-summary-card">
            <div className="access-summary-top">
              <div>
                <p className="access-summary-label">User assignments</p>
                <strong className="access-summary-value">{summary.totalUsers}</strong>
              </div>
              <span className="access-summary-icon tone-teal"><Users size={18} /></span>
            </div>
            <p className="access-summary-note">{summary.admins} admins assigned</p>
          </article>
        </div>

        {/* ── Feedback ── */}
        {error   ? <p className="form-error">{error}</p>   : null}
        {success ? <p className="form-success">{success}</p> : null}

        {/* ── Tab bar ── */}
        <div className="ac-tab-bar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`ac-tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => { setTab(id); setError(''); setSuccess(''); }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TAB 1 — Role templates
        ══════════════════════════════════════════════════════════════ */}
        {tab === 'roles' && (
          <article className="card access-panel">
            <div className="access-panel-header">
              <div>
                <span className="access-panel-badge"><ShieldCheck size={14} /> Role templates</span>
                <h3>Permission template editor</h3>
                <p>Only manager and cashier permissions are editable here.</p>
              </div>
            </div>

            {loading ? (
              <div className="access-loading-block">
                <div className="spinner" />
                <p className="muted">Loading role permissions…</p>
              </div>
            ) : (
              <div className="access-panel-body">
                {editableRoles.map((roleName) => {
                  const role          = roles.find((item) => item.name === roleName);
                  const selectedCount = (role?.permissions || []).length;
                  const availableCount= permissions.length;
                  const coverage      = availableCount
                    ? Math.round((selectedCount / availableCount) * 100)
                    : 0;

                  return (
                    <div key={roleName} className="access-role-shell">
                      <div className="access-role-heading">
                        <div className="access-role-title-row">
                          <span className="access-role-eyebrow">{formatTitle(roleName)} template</span>
                          <h3 className="access-role-title">{formatTitle(roleName)}</h3>
                          <p>{getRoleDescription(roleName)}</p>
                        </div>
                        <button
                          type="button"
                          className="primary-button access-save-btn"
                          onClick={() => saveRolePermissions(roleName)}
                          disabled={savingRole === roleName}
                        >
                          <Save size={16} />
                          {savingRole === roleName ? 'Saving…' : 'Save changes'}
                        </button>
                      </div>

                      <div className="access-role-progress">
                        <span style={{ width: `${coverage}%` }} />
                      </div>

                      <div className="access-inline-stats">
                        <span className="access-mini-pill">{selectedCount} selected</span>
                        <span className="access-mini-pill">{availableCount} available</span>
                        <span className="access-mini-pill">
                          {Object.keys(permissionGroups).length} groups
                        </span>
                      </div>

                      {!permissions.length ? (
                        <p className="muted">No permissions available.</p>
                      ) : (
                        <div className="access-group-grid">
                          {Object.entries(permissionGroups).map(([groupName, groupItems]) => (
                            <div
                              key={`${roleName}-${groupName}`}
                              className="permission-group-card access-group-card"
                            >
                              <div className="access-group-head">
                                <div>
                                  <strong className="access-group-title">{formatTitle(groupName)}</strong>
                                  <span className="access-group-subtitle">
                                    {groupItems.length} available
                                  </span>
                                </div>
                              </div>

                              <div className="selection-grid access-permission-grid">
                                {groupItems.map((permission) => {
                                  const checked = roleMap[roleName]?.has(permission.name) || false;
                                  return (
                                    <label
                                      key={`${roleName}-${permission.name}`}
                                      className={`selection-card access-permission-item ${checked ? 'is-selected' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleRolePermission(roleName, permission.name)}
                                      />
                                      <div className="permission-meta">
                                        <strong>{permission.label || permission.name}</strong>
                                        <span>{permission.name}</span>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 2 — User role assignment
        ══════════════════════════════════════════════════════════════ */}
        {tab === 'users' && (
          <article className="card access-panel access-user-table">
            <div className="access-panel-header">
              <div>
                <span className="access-panel-badge"><Users size={14} /> User access</span>
                <h3>User role assignment</h3>
                <p>Assign admin, manager, or cashier roles to users.</p>
              </div>
            </div>

            {loading ? (
              <div className="access-loading-block">
                <div className="spinner" />
                <p className="muted">Loading users…</p>
              </div>
            ) : (
              <>
                <div className="access-users-caption">
                  <span>{users.length} users loaded</span>
                  <span>{assignableRoles.length} assignable roles</span>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Stores</th>
                        <th>Current role</th>
                        <th>Assign role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length ? (
                        users.map((member) => (
                          <tr key={member.user_id}>
                            <td>
                              <div className="catalog-item-copy">
                                <strong>{member.full_name || 'Unnamed user'}</strong>
                                <span>ID #{member.user_id}</span>
                              </div>
                            </td>
                            <td>{member.email || '-'}</td>
                            <td>
                              {member.stores?.length
                                ? member.stores.map((s) => s.store_name).join(', ')
                                : 'No stores'}
                            </td>
                            <td>
                              <span className={getRoleBadgeClass(member.role)}>
                                {member.role || 'No role'}
                              </span>
                            </td>
                            <td>
                              <select
                                className="select-input slim role-select"
                                value={member.role || ''}
                                onChange={(e) => handleUserRoleChange(member.user_id, e.target.value)}
                                disabled={savingUser === String(member.user_id)}
                              >
                                <option value="" disabled>Select role</option>
                                {assignableRoles.map((r) => (
                                  <option key={`${member.user_id}-${r}`} value={r}>
                                    {formatTitle(r)}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="catalog-empty-cell">No users found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </article>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 3 — Per-user page permissions
        ══════════════════════════════════════════════════════════════ */}
        {tab === 'pages' && (
          <article className="card access-panel">
            <div className="access-panel-header">
              <div>
                <span className="access-panel-badge"><FileKey size={14} /> Page access</span>
                <h3>Per-user page permissions</h3>
                <p>
                  Override which pages each user can visit, independent of their role template.
                  <strong> R</strong> = granted by role, <strong> D</strong> = direct override.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="access-loading-block">
                <div className="spinner" />
                <p className="muted">Loading users…</p>
              </div>
            ) : (
              <div className="access-panel-body">
                {users.length ? (
                  <UserPagePermissionsPanel
                    users={users}
                    allPermissions={permissions}
                    onFeedback={handleUserPermFeedback}
                  />
                ) : (
                  <p className="muted">No users found.</p>
                )}
              </div>
            )}
          </article>
        )}
      </section>
    </>
  );
}