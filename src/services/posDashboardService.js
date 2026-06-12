import api from '../lib/api';

export const posDashboardService = {
  bootstrap: (storeId) =>
    api.get('/pos/bootstrap', {
      params: { store_id: storeId },
      headers: storeId ? { 'X-Store-Id': storeId } : {},
    }),
};