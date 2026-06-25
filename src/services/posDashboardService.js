import api from '../lib/api';

export const posDashboardService = {
  async bootstrap(storeId) {
    const response = await api.get('/pos/bootstrap', {
      params: { store_id: storeId },
      headers: storeId ? { 'X-Store-Id': storeId } : {},
    });
    return response.data;
  },
};