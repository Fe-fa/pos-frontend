import axios from 'axios';

export const storageKeys = {
  token: 'swiftpos_token',
  user: 'swiftpos_user',
  storeId: 'swiftpos_store_id',
  theme: 'swiftpos_theme',
  pendingVerification: 'swiftpos_pending_verification',
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

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
  localStorage.removeItem(storageKeys.pendingVerification);
  window.dispatchEvent(new Event('auth:logout'));
};

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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (
      axios.isCancel(error) ||
      error.code === 'ERR_CANCELED' ||
      error.name === 'CanceledError'
    ) {
      return Promise.reject(error);
    }

    const original = error.config;
    const status = error.response?.status;

    if (
      status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/verify-email') &&
      !original.url?.includes('/auth/resend-verification')
    ) {
      original._retry = true;

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
        const { data } = await api.post('/auth/refresh');
        const newToken = data.access_token;

        localStorage.setItem(storageKeys.token, newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        original.headers['Authorization'] = `Bearer ${newToken}`;

        processQueue(null, newToken);
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        forceLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    console.error(
      `%c[❌ API ERROR] From ${original?.url || 'Unknown URL'}`,
      'color: #ff4747; font-weight: bold;',
      { status, data: error.response?.data, message: error.message }
    );
    console.error('[❌ API ERROR MESSAGE]', error.response?.data?.message, error.response?.data);

    return Promise.reject(error);
  }
);

export default api;