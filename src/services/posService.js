import api from '../lib/api';

export const posService = {
  async bootstrap(params) {
    const response = await api.get('/pos/bootstrap', { params });
    return response.data;
  },
};