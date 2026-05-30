import api from '../lib/api';

export const customerService = {
  list(params = {}) {
    return api.get('/customers', { params }).then((res) => res.data);
  },
  create(payload) {
    return api.post('/customers', payload).then((res) => res.data);
  },
  update(customerId, payload) {
    return api.put(`/customers/${customerId}`, payload).then((res) => res.data);
  },
  remove(customerId) {
    return api.delete(`/customers/${customerId}`).then((res) => res.data);
  },
};
