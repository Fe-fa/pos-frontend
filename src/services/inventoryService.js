import api from '../lib/api';

export const inventoryService = {
  list(params = {}) {
    return api.get('/inventory', { params }).then((res) => res.data);
  },

  history(params = {}) {
    return api.get('/inventory/history', { params }).then((res) => res.data);
  },

  show(inventoryId) {
    return api.get(`/inventory/${inventoryId}`).then((res) => res.data);
  },

  create(payload) {
    return api.post('/inventory', payload).then((res) => res.data);
  },

  update(inventoryId, payload) {
    return api.put(`/inventory/${inventoryId}`, payload).then((res) => res.data);
  },

  remove(inventoryId) {
    return api.delete(`/inventory/${inventoryId}`).then((res) => res.data);
  },
};
