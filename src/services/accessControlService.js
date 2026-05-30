import api from '../lib/api';

export const accessControlService = {
  index() {
    return api.get('/access-control').then((res) => res.data);
  },

  updateRolePermissions(roleName, payload) {
    return api
      .put(`/access-control/roles/${roleName}/permissions`, payload)
      .then((res) => res.data);
  },

  assignUserRole(userId, payload) {
    return api
      .put(`/access-control/users/${userId}/role`, payload)
      .then((res) => res.data);
  },
};
