import api from '../lib/api';

export const dashboardService = {
  async getSuperAdminSummary() {
    const response = await api.get('/dashboard/super-admin');
    return response.data;
  },
};