import api from '../lib/api';

export const userService = {
  async list(params = {}) {
    const response = await api.get('/users', { params });
    return response.data;
  },

  async show(userId) {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },

  async create(payload) {
    const response = await api.post('/users', payload);
    return response.data;
  },

  async update(userId, payload) {
    const response = await api.put(`/users/${userId}`, payload);
    return response.data;
  },

  async syncStores(userId, storeIds = []) {
    const response = await api.post(`/users/${userId}/stores`, { store_ids: storeIds });
    return response.data;
  },

  async remove(userId) {
    const response = await api.delete(`/users/${userId}`);
    return response.data;
  },
};