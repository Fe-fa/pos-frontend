import api from '../lib/api';

export const paymentService = {
  async list(params = {}) {
    const response = await api.get('/payments', { params });
    return response.data;
  },

  async show(paymentId) {
    const response = await api.get(`/payments/${paymentId}`);
    return response.data;
  },
};