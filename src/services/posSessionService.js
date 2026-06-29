import api from '../lib/api';

export const posSessionService = {
  async get(storeId) {
    const response = await api.get('/pos-session', {
      params: { store_id: storeId },
    });
    return response.data?.data ?? null;
  },

  async save(storeId, payload) {
    const billing = payload?.billing || null;

    await api.put('/pos-session', {
      store_id: Number(storeId),
      billing_id: billing?.billing_id ?? null,
      selected_customer_id: payload?.selectedCustomerId
        ? Number(payload.selectedCustomerId)
        : null,
      notes: payload?.notes || null,
      local_items: billing?.items || [],
    });
  },

  async clear(storeId) {
    await api.delete('/pos-session', {
      params: { store_id: Number(storeId) },
    });
  },
};
