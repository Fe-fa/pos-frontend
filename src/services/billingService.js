import api from '../lib/api';

export const billingService = {
  list(params = {}) {
    return api.get('/billings', { params }).then((res) => res.data);
  },

  createDraft(payload) {
    return api.post('/billings', payload).then((res) => res.data);
  },

  show(billingId) {
    return api.get(`/billings/${billingId}`).then((res) => res.data);
  },

  update(billingId, payload) {
    return api.put(`/billings/${billingId}`, payload).then((res) => res.data);
  },

  destroy(billingId) {
    return api.delete(`/billings/${billingId}`).then((res) => res.data);
  },

  remove(billingId) {
    return api.delete(`/billings/${billingId}`).then((res) => res.data);
  },

  restore(billingId) {
    return api.post(`/billings/${billingId}/restore`).then((res) => res.data);
  },

  items(billingId, params = {}) {
    return api.get(`/billings/${billingId}/items`, { params }).then((res) => res.data);
  },

  addItem(billingId, payload) {
    return api.post(`/billings/${billingId}/items`, payload).then((res) => res.data);
  },

  showItem(billingItemId) {
    return api.get(`/billing-items/${billingItemId}`).then((res) => res.data);
  },

  updateItem(billingItemId, payload) {
    return api.put(`/billing-items/${billingItemId}`, payload).then((res) => res.data);
  },

  removeItem(billingItemId) {
    return api.delete(`/billing-items/${billingItemId}`).then((res) => res.data);
  },

  restoreItem(billingItemId) {
    return api.post(`/billing-items/${billingItemId}/restore`).then((res) => res.data);
  },

  charge(billingId, payload) {
    return api.post(`/billings/${billingId}/charge`, payload).then((res) => res.data);
  },
};
