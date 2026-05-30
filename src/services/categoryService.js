import api from '../lib/api';

export const categoryService = {
  list(params = {}) {
    return api.get('/categories', { params }).then((res) => res.data);
  },
  create(payload) {
    return api.post('/categories', payload).then((res) => res.data);
  },
  update(categoryId, payload) {
    return api.put(`/categories/${categoryId}`, payload).then((res) => res.data);
  },
  remove(categoryId) {
    return api.delete(`/categories/${categoryId}`).then((res) => res.data);
  },
};
