import api from '../lib/api';

export const rewardService = {
  async list(params = {}) {
    const response = await api.get('/reward-rules', { params });
    return response.data;
  },

  async create(data = {}) {
    const response = await api.post('/reward-rules', data);
    return response.data;
  },

  async update(rewardRuleId, data = {}) {
    const response = await api.put(`/reward-rules/${rewardRuleId}`, data);
    return response.data;
  },

  async destroy(rewardRuleId) {
    const response = await api.delete(`/reward-rules/${rewardRuleId}`);
    return response.data;
  },

  async customerLoyalty(params = {}) {
    const response = await api.get('/reward-rules/customer-loyalty', { params });
    return response.data?.data ?? null;
  },
};