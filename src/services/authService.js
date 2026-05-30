import api from '../lib/api';

export const authService = {
  login(payload) {
    return api.post('/auth/login', payload).then((res) => res.data);
  },
  register(payload) {
    return api.post('/auth/register', payload).then((res) => res.data);
  },
  me() {
    return api.get('/auth/me').then((res) => res.data);
  },
  logout() {
    return api.post('/auth/logout').then((res) => res.data);
  },
  forgotPassword(payload) {
    return api.post('/auth/forgot-password', payload).then((res) => res.data);
  },
  resetPassword(payload) {
    return api.post('/auth/reset-password', payload).then((res) => res.data);
  },
};
