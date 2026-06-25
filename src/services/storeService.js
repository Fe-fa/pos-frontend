import api from '../lib/api';

export const storeService = {
  async list(params = {}) {
    const response = await api.get('/stores', { params });
    return response.data;
  },

  async show(storeId) {
    const response = await api.get(`/stores/${storeId}`);
    return response.data;
  },

  async create(payload) {
    const response = await api.post('/stores', payload);
    return response.data;
  },

  async update(storeId, payload) {
    const response = await api.put(`/stores/${storeId}`, payload);
    return response.data;
  },

  async remove(storeId) {
    const response = await api.delete(`/stores/${storeId}`);
    return response.data;
  },

  async getSettings(storeId) {
    const response = await api.get(`/stores/${storeId}/settings`);
    return response.data;
  },

  async updateSettings(storeId, payload) {
    const response = await api.put(`/stores/${storeId}/settings`, payload);
    return response.data;
  },
};