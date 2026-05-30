import api from '../lib/api';

export const userService = {
  list(params = {}) {
    return api.get('/users', { params }).then((res) => res.data);
  },
  show(userId) {
    return api.get(`/users/${userId}`).then((res) => res.data);
  },
  create(payload) {
    return api.post('/users', payload).then((res) => res.data);
  },
  update(userId, payload) {
    return api.put(`/users/${userId}`, payload).then((res) => res.data);
  },
  syncStores(userId, storeIds = []) {
    return api.post(`/users/${userId}/stores`, { store_ids: storeIds }).then((res) => res.data);
  },
  remove(userId) {
    return api.delete(`/users/${userId}`).then((res) => res.data);
  },
};
