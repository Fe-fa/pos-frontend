import api from '../lib/api';

export const categoryService = {
  async list(params = {}) {
    const response = await api.get('/categories', { params });
    return response.data;
  },

  async create(payload) {
    const response = await api.post('/categories', payload);
    return response.data;
  },

  async update(categoryId, payload) {
    const response = await api.put(`/categories/${categoryId}`, payload);
    return response.data;
  },

  async remove(categoryId) {
    const response = await api.delete(`/categories/${categoryId}`);
    return response.data;
  },
};