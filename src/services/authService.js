
import api from '../lib/api';

export const authService = {
  async login(payload) {
    const response = await api.post('/auth/login', payload);
    return response.data;
  },

  async register(payload) {
    const response = await api.post('/auth/register', payload);
    return response.data;
  },

  async me() {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Silently refreshes the access token.
  // The 401-interceptor in api.js calls this automatically,
  // but AuthContext.silentRefresh() also uses it directly.
  async refresh() {
    const response = await api.post('/auth/refresh');
    return response.data;
  },

  async logout() {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  async forgotPassword(payload) {
    const response = await api.post('/auth/forgot-password', payload);
    return response.data;
  },

  async resetPassword(payload) {
    const response = await api.post('/auth/reset-password', payload);
    return response.data;
  },

  async verifyEmailCode(payload) {
    const response = await api.post('/auth/verify-email', payload);
    return response.data;
  },

  async resendVerification() {
    const response = await api.post('/auth/resend-verification');
    return response.data;
  },
};
