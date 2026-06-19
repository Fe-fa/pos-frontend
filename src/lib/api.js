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

// Request Interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(storageKeys.token);
  const storeId = localStorage.getItem(storageKeys.storeId);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (storeId) {
    config.headers['X-Store-Id'] = storeId;
  }

  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  // --- DEBUG LOGGER ---
  // Tracks method, URL, and any X-Store-Id headers attached to active calls
  console.log(
    `%c[🚀 API REQUEST] ${config.method?.toUpperCase()} ➡️ ${config.url}`,
    'color: #00bfff; font-weight: bold;',
    { storeId: config.headers['X-Store-Id'] || 'None Assigned' }
  );

  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response Interceptor (Added to catch and debug incoming errors immediately)
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  // TanStack Query aborts stale/unmounted requests on purpose (StrictMode
  // double-mount, component unmount mid-fetch, filter change mid-fetch).
  // That's expected behavior, not a real failure — skip logging it.
  if (
    axios.isCancel(error) ||
    error.code === 'ERR_CANCELED' ||
    error.name === 'CanceledError'
  ) {
    return Promise.reject(error);
  }

  console.error(
    `%c[❌ API ERROR] From ${error.config?.url || 'Unknown URL'}`,
    'color: #ff4747; font-weight: bold;',
    {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    }
  );
  return Promise.reject(error);
});

export default api;