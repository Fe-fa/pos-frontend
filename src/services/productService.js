import api from '../lib/api';

const isFormData = (payload) =>
  typeof FormData !== 'undefined' && payload instanceof FormData;

export const productService = {
  async list(params = {}) {
    const response = await api.get('/products', { params });
    return response.data;
  },

  async show(productId) {
    const response = await api.get(`/products/${productId}`);
    return response.data;
  },

  async create(payload) {
    if (isFormData(payload)) {
      const response = await api.post('/products', payload, {
        headers: { 'Content-Type': undefined },  // force axios to set multipart boundary
      });
      return response.data;
    }

    const response = await api.post('/products', payload);
    return response.data;
  },

  async update(productId, payload) {
    if (isFormData(payload)) {
      payload.append('_method', 'PUT');

      const response = await api.post(`/products/${productId}`, payload, {
        headers: { 'Content-Type': undefined },  // force axios to set multipart boundary
      });
      return response.data;
    }

    const response = await api.put(`/products/${productId}`, payload);
    return response.data;
  },

  async remove(productId) {
    const response = await api.delete(`/products/${productId}`);
    return response.data;
  },

  async patch(productId, payload) {
    const response = await api.patch(`/products/${productId}`, payload);
    return response.data;
  },
};