import api from '../lib/api';

const isFormData = (payload) =>
  typeof FormData !== 'undefined' && payload instanceof FormData;

export const productService = {
  list(params = {}) {
    return api.get('/products', { params }).then((res) => res.data);
  },

  show(productId) {
    return api.get(`/products/${productId}`).then((res) => res.data);
  },

  create(payload) {
    if (isFormData(payload)) {
      return api.post('/products', payload, {
        headers: {
          Accept: 'application/json',
        },
      }).then((res) => res.data);
    }

    return api.post('/products', payload).then((res) => res.data);
  },

  update(productId, payload) {
    if (isFormData(payload)) {
      payload.append('_method', 'PUT');

      return api.post(`/products/${productId}`, payload, {
        headers: {
          Accept: 'application/json',
        },
      }).then((res) => res.data);
    }

    return api.put(`/products/${productId}`, payload).then((res) => res.data);
  },

  remove(productId) {
    return api.delete(`/products/${productId}`).then((res) => res.data);
  },
};
