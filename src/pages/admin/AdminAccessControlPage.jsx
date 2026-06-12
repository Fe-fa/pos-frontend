import { Save, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { accessControlService } from '../../services/accessControlService';
import { useAuth } from '../../contexts/AuthContext';

const editableRoles = ['manager', 'cashier'];
const assignableRoles = ['admin', 'manager', 'cashier'];

function formatTitle(value = '') {
  return value
    .replaceAll('.', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

export default function AdminAccessControlPage() {
  const { refreshProfile, user } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState('');
  const [savingUser, setSavingUser] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
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
  };

  useEffect(() => {
    load();
  }, []);

  const roleMap = useMemo(() => {
    return roles.reduce((acc, role) => {
      acc[role.name] = new Set(role.permissions || []);
      return acc;
    }, {});
  }, [roles]);

  const permissionGroups = useMemo(() => groupPermissions(permissions), [permissions]);

  const toggleRolePermission = (roleName, permissionName) => {
    setRoles((prev) =>
      prev.map((role) => {
        if (role.name !== roleName) return role;

        const current = new Set(role.permissions || []);

        if (current.has(permissionName)) {
          current.delete(permissionName);
        } else {
          current.add(permissionName);
        }

        return {
          ...role,
          permissions: Array.from(current).sort(),
        };
      })
    );
  };

  const saveRolePermissions = async (roleName) => {
    const role = roles.find((item) => item.name === roleName);
    if (!role) return;

    setSavingRole(roleName);
    setError('');
    setSuccess('');

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
      // ← add here — if current user's role template was updated, refresh their permissions
if (user?.role === roleName) {
  await refreshProfile();
}

      setSuccess(`${formatTitle(roleName)} permissions updated successfully.`);
    } catch (err) {
      setError(err?.response?.data?.message || `Unable to update ${roleName} permissions.`);
    } finally {
      setSavingRole('');
    }
  };

  const handleUserRoleChange = async (userId, roleName) => {
    if (!roleName) return;

    const existingUser = users.find((user) => user.user_id === userId);
    if (existingUser?.role === roleName) return;

    setSavingUser(String(userId));
    setError('');
    setSuccess('');

    try {
      await accessControlService.assignUserRole(userId, { role: roleName });

      setUsers((prev) =>
        prev.map((user) =>
          user.user_id === userId ? { ...user, role: roleName } : user
        )
      );
      // ← add here — if current logged-in user's role was changed, refresh immediately
if (user?.user_id === userId) {
  await refreshProfile();
}

      setSuccess('User role updated successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to assign role.');
    } finally {
      setSavingUser('');
    }
  };

  return (
    <section className="stack-lg">
      <div className="catalog-hero">
        <div className="catalog-hero-copy">
          <h2 className="catalog-title">Roles & Permissions</h2>
          <p className="catalog-subtitle">
            System admin can configure manager and cashier permissions, then assign roles to users.
          </p>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="access-control-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>
                <ShieldCheck size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Role permission templates
              </h3>
              <p>Only manager and cashier permission sets are editable by the system admin.</p>
            </div>
          </div>

          {loading ? (
            <p className="muted">Loading role permissions...</p>
          ) : (
            <div className="stack-lg">
              {editableRoles.map((roleName) => {
                const role = roles.find((item) => item.name === roleName);

                return (
                  <div key={roleName} className="access-role-card">
                    <div className="access-role-topbar">
                      <div>
                        <h3 className="access-role-title">{formatTitle(roleName)}</h3>
                        <p className="muted">
                          {(role?.permissions || []).length} permissions selected
                        </p>
                      </div>

                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => saveRolePermissions(roleName)}
                        disabled={savingRole === roleName}
                      >
                        <Save size={16} />
                        {savingRole === roleName ? 'Saving...' : 'Save'}
                      </button>
                    </div>

                    {!permissions.length ? (
                      <p className="muted">No permissions available.</p>
                    ) : (
                      <div className="stack-md">
                        {Object.entries(permissionGroups).map(([groupName, groupItems]) => (
                          <div key={`${roleName}-${groupName}`} className="permission-group-card">
                            <div className="permission-group-header">
                              <strong>{formatTitle(groupName)}</strong>
                              <span>{groupItems.length} available</span>
                            </div>

                            <div className="selection-grid access-permission-grid">
                              {groupItems.map((permission) => {
                                const checked = roleMap[roleName]?.has(permission.name) || false;

                                return (
                                  <label
                                    key={`${roleName}-${permission.name}`}
                                    className="selection-card"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleRolePermission(roleName, permission.name)
                                      }
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

        <article className="card">
          <div className="card-header">
            <div>
              <h3>
                <Users size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                User role assignment
              </h3>
              <p>Assign admin, manager, or cashier role to users.</p>
            </div>
          </div>

          {loading ? (
            <p className="muted">Loading users...</p>
          ) : (
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
                    users.map((user) => (
                      <tr key={user.user_id}>
                        <td>
                          <div className="catalog-item-copy">
                            <strong>{user.full_name || 'Unnamed user'}</strong>
                            <span>ID #{user.user_id}</span>
                          </div>
                        </td>
                        <td>{user.email || '-'}</td>
                        <td>
                          {user.stores?.length
                            ? user.stores.map((store) => store.store_name).join(', ')
                            : 'No assigned stores'}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${
                              user.role === 'admin' ? 'paid' : 'draft'
                            }`}
                          >
                            {user.role || 'No role'}
                          </span>
                        </td>
                        <td>
                          <select
                            className="select-input slim"
                            value={user.role || ''}
                            onChange={(e) => handleUserRoleChange(user.user_id, e.target.value)}
                            disabled={savingUser === String(user.user_id)}
                          >
                            <option value="" disabled>
                              Select role
                            </option>
                            {assignableRoles.map((roleName) => (
                              <option key={`${user.user_id}-${roleName}`} value={roleName}>
                                {roleName}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="catalog-empty-cell">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
