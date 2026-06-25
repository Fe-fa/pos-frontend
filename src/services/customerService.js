import api from '../lib/api';

export const customerService = {
  async list(params = {}) {
    const response = await api.get('/customers', { params });
    return response.data;
  },

  async show(customerId) {
    const response = await api.get(`/customers/${customerId}`);
    return response.data;
  },

  async create(payload) {
    const response = await api.post('/customers', payload);
    return response.data;
  },

  async update(customerId, payload) {
    const response = await api.put(`/customers/${customerId}`, payload);
    return response.data;
  },

  async remove(customerId) {
    const response = await api.delete(`/customers/${customerId}`);
    return response.data;
  },
};