
import axios from 'axios';

export const storageKeys = {
  token: 'pos_token',
  user: 'pos_user',
  storeId: 'pos_store_id',
  pendingVerification: 'pos_pending_verification',
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

// ── Request: attach Bearer token ──────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(storageKeys.token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response: handle 401 with one silent-refresh attempt ──────
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const is401 = error?.response?.status === 401;
    // Skip the refresh loop for auth endpoints themselves
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/logout');

    if (is401 && !isAuthEndpoint && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until the refresh resolves
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResp = await api.post('/auth/refresh');
        const newToken = refreshResp.data?.access_token;

        if (newToken) {
          localStorage.setItem(storageKeys.token, newToken);
          api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Refresh failed — fire logout event so AuthContext can clear state
        localStorage.removeItem(storageKeys.token);
        localStorage.removeItem(storageKeys.user);
        localStorage.removeItem(storageKeys.storeId);
        localStorage.removeItem(storageKeys.pendingVerification);
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
