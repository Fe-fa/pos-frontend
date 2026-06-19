import api from '../lib/api';

export const inventoryService = {
  list(params = {}, config = {}) {
    return api
      .get('/inventory', {
        params,
        signal: config.signal,
      })
      .then((res) => res.data);
  },

  history(params = {}, config = {}) {
    return api
      .get('/inventory/history', {
        params,
        signal: config.signal,
      })
      .then((res) => res.data);
  },

  show(inventoryId, config = {}) {
    return api
      .get(`/inventory/${inventoryId}`, {
        signal: config.signal,
      })
      .then((res) => res.data);
  },

  create(payload, config = {}) {
    return api
      .post('/inventory', payload, {
        signal: config.signal,
      })
      .then((res) => res.data);
  },

  update(inventoryId, payload, config = {}) {
    return api
      .put(`/inventory/${inventoryId}`, payload, {
        signal: config.signal,
      })
      .then((res) => res.data);
  },

  remove(inventoryId, config = {}) {
    return api
      .delete(`/inventory/${inventoryId}`, {
        signal: config.signal,
      })
      .then((res) => res.data);
  },
};
