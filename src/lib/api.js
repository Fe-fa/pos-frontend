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

// ─── Token Refresh State ───────────────────────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  );
  failedQueue = [];
};

const forceLogout = () => {
  localStorage.removeItem(storageKeys.token);
  localStorage.removeItem(storageKeys.user);
  localStorage.removeItem(storageKeys.storeId);
  window.dispatchEvent(new Event('auth:logout'));
};

// ─── Request Interceptor ───────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(storageKeys.token);
  const storeId = localStorage.getItem(storageKeys.storeId);

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (storeId) config.headers['X-Store-Id'] = storeId;
  if (config.data instanceof FormData) delete config.headers['Content-Type'];

  console.log(
    `%c[🚀 API REQUEST] ${config.method?.toUpperCase()} ➡️ ${config.url}`,
    'color: #00bfff; font-weight: bold;',
    { storeId: config.headers['X-Store-Id'] || 'None Assigned' }
  );

  return config;
}, (error) => Promise.reject(error));

// ─── Response Interceptor ──────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Ignore intentional request cancellations (TanStack Query, unmounts, etc.)
    if (
      axios.isCancel(error) ||
      error.code === 'ERR_CANCELED' ||
      error.name === 'CanceledError'
    ) {
      return Promise.reject(error);
    }

    const original = error.config;
    const status = error.response?.status;

    // ── Auto-refresh on 401 ──────────────────────────────────────────────
    if (
      status === 401 &&
      !original._retry &&                          // don't retry twice
      !original.url?.includes('/auth/refresh') &&  // refresh itself failed → logout
      !original.url?.includes('/auth/login')       // bad credentials → let form handle it
    ) {
      original._retry = true;

      // If a refresh is already in-flight, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers['Authorization'] = `Bearer ${token}`;
            return api(original);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        const { data } = await api.post('/auth/refresh'); // uses current token from request interceptor
        const newToken = data.access_token;

        localStorage.setItem(storageKeys.token, newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        original.headers['Authorization'] = `Bearer ${newToken}`;

        processQueue(null, newToken);

        console.log(
          '%c[🔄 TOKEN REFRESHED] Retrying queued requests...',
          'color: #00e676; font-weight: bold;'
        );

        return api(original); // retry the original failed request
      } catch (refreshError) {
        processQueue(refreshError, null);
        forceLogout();

        console.warn(
          '%c[🔒 SESSION EXPIRED] Refresh failed — user logged out.',
          'color: #ff9800; font-weight: bold;'
        );

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── General error logger ─────────────────────────────────────────────
    console.error(
      `%c[❌ API ERROR] From ${original?.url || 'Unknown URL'}`,
      'color: #ff4747; font-weight: bold;',
      {
        status,
        data: error.response?.data,
        message: error.message,
      }
    );

    return Promise.reject(error);
  }
);

export default api;