import api from '../lib/api';

export const rewardService = {
  list(params = {}) {
    return api.get('/reward-rules', { params }).then(r => r.data);
  },

  create(data = {}) {
    return api.post('/reward-rules', data).then(r => r.data);
  },

  update(rewardRuleId, data = {}) {
    return api.put(`/reward-rules/${rewardRuleId}`, data).then(r => r.data);
  },

  destroy(rewardRuleId) {
    return api.delete(`/reward-rules/${rewardRuleId}`).then(r => r.data);
  },

  customerLoyalty(params = {}) {
    return api.get('/reward-rules/customer-loyalty', { params }).then(r => r.data);
  },
};