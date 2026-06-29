import api from '../lib/api';

export const inventoryService = {
  async list(params = {}, config = {}) {
    const response = await api.get('/inventory', {
      params,
      signal: config.signal,
    });
    return response.data;
  },

  async history(params = {}, config = {}) {
    const response = await api.get('/inventory/history', {
      params,
      signal: config.signal,
    });
    return response.data;
  },

  async show(inventoryId, config = {}) {
    const response = await api.get(`/inventory/${inventoryId}`, {
      signal: config.signal,
    });
    return response.data;
  },

  async create(payload, config = {}) {
    const response = await api.post('/inventory', payload, {
      signal: config.signal,
    });
    return response.data;
  },

  async update(inventoryId, payload, config = {}) {
    const response = await api.put(`/inventory/${inventoryId}`, payload, {
      signal: config.signal,
    });
    return response.data;
  },

  // ── NEW: signed delta adjustment — hits its own endpoint with its own validation ──
  async adjust(inventoryId, payload, config = {}) {
    const response = await api.patch(`/inventory/${inventoryId}/adjust`, payload, {
      signal: config.signal,
    });
    return response.data;
  },

  async remove(inventoryId, config = {}) {
    const response = await api.delete(`/inventory/${inventoryId}`, {
      signal: config.signal,
    });
    return response.data;
  },
};