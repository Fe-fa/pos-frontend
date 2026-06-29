import api from '../lib/api';

export const billingService = {
  async list(params = {}) {
    const response = await api.get('/billings', { params });
    return response.data;
  },

  async createDraft(payload) {
    const response = await api.post('/billings', payload);
    return response.data;
  },

  async show(billingId) {
    const response = await api.get(`/billings/${billingId}`);
    return response.data;
  },

  async update(billingId, payload) {
    const response = await api.put(`/billings/${billingId}`, payload);
    return response.data;
  },

  async destroy(billingId) {
    const response = await api.delete(`/billings/${billingId}`);
    return response.data;
  },

  async remove(billingId) {
    const response = await api.delete(`/billings/${billingId}`);
    return response.data;
  },

  async restore(billingId) {
    const response = await api.post(`/billings/${billingId}/restore`);
    return response.data;
  },

  async addItem(billingId, payload) {
    const response = await api.post(`/billings/${billingId}/items`, payload);
    return response.data;
  },

  async showItem(billingItemId) {
    const response = await api.get(`/billing-items/${billingItemId}`);
    return response.data;
  },

  async updateItem(billingItemId, payload) {
    const response = await api.put(`/billing-items/${billingItemId}`, payload);
    return response.data;
  },

  async removeItem(billingItemId) {
    const response = await api.delete(`/billing-items/${billingItemId}`);
    return response.data;
  },

  async restoreItem(billingItemId) {
    const response = await api.post(`/billing-items/${billingItemId}/restore`);
    return response.data;
  },

  // NEW: atomic cart checkout
  async charge(payload) {
    const response = await api.post('/billings/charge', payload);
    return response.data;
  },

  // LEGACY: charge an already-existing billing
  async chargeExisting(billingId, payload) {
    const response = await api.post(`/billings/${billingId}/charge`, payload);
    return response.data;
  },
};
