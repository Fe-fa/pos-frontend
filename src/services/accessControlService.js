import api from '../lib/api';

export const accessControlService = {
  async index() {
    const response = await api.get('/access-control');
    return response.data;
  },

  async updateRolePermissions(roleName, payload) {
    const response = await api.put(`/access-control/roles/${roleName}/permissions`, payload);
    return response.data;
  },

  async assignUserRole(userId, payload) {
    const response = await api.put(`/access-control/users/${userId}/role`, payload);
    return response.data;
  },

  // ── Per-user page permissions ──────────────────────────────────────────────

  /**
   * GET /access-control/users/{user}/permissions
   * Returns role_permissions, direct_permissions, all_permissions
   */
  async getUserPermissions(userId) {
    const response = await api.get(`/access-control/users/${userId}/permissions`);
    return response.data;
  },

  /**
   * PUT /access-control/users/{user}/permissions
   * Syncs DIRECT page.* permissions for a single user.
   * Role-level permissions are untouched on the backend.
   * Payload: { permissions: ['page.dashboard', 'page.pos', ...] }
   */
  async updateUserPermissions(userId, payload) {
    const response = await api.put(`/access-control/users/${userId}/permissions`, payload);
    return response.data;
  },
};