import axios from 'axios';

export const storageKeys = {
  token: 'swiftpos_token',
  user: 'swiftpos_user',
  storeId: 'swiftpos_store_id',
  theme: 'swiftpos_theme',
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(storageKeys.token);
  const storeId = localStorage.getItem(storageKeys.storeId);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (storeId) {
    config.headers['X-Store-Id'] = storeId;
  }

  // --- THE FIX ---
  // If we are sending FormData (file uploads), remove the default JSON Content-Type.
  // This allows Axios/the browser to auto-detect and set the correct multi-part boundary.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
