import api from '../lib/api';

export const posService = {
  bootstrap(params) {
    return api.get('/pos/bootstrap', { params });
  },
};
