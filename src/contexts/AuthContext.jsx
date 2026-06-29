import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { storageKeys } from '../lib/api';
import { authService } from '../services/authService';
import { readJSON, userHasStoreAssignment, writeJSON } from '../utils/helpers';

export const AuthContext = createContext(null);
export { useAuth } from '../hooks/useAuth';

let inflightProfileFetch = null;
const PERMISSION_REFRESH_INTERVAL = 5 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readJSON(storageKeys.user, null));
  const [loading, setLoading] = useState(!!localStorage.getItem(storageKeys.token));

  const clearSession = useCallback(() => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.storeId);
    localStorage.removeItem(storageKeys.pendingVerification);
    inflightProfileFetch = null;
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!inflightProfileFetch) {
      inflightProfileFetch = authService.me().finally(() => {
        inflightProfileFetch = null;
      });
    }
    const response = await inflightProfileFetch;
    writeJSON(storageKeys.user, response.user);
    setUser(response.user);
    return response.user;
  }, []);

  // Bootstrap — skip if pending email verification
  useEffect(() => {
    const token = localStorage.getItem(storageKeys.token);
    if (!token) { setLoading(false); return; }

    const pending = localStorage.getItem(storageKeys.pendingVerification);
    if (pending) { setLoading(false); return; }

    refreshProfile()
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [clearSession, refreshProfile]);

  // Periodic permission refresh — skip if pending verification
  useEffect(() => {
    if (!user) return;
    const pending = localStorage.getItem(storageKeys.pendingVerification);
    if (pending) return;

    const interval = setInterval(async () => {
      try {
        await refreshProfile();
      } catch (err) {
        if (err?.response?.status === 401) clearSession();
      }
    }, PERMISSION_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [user, refreshProfile, clearSession]);

  // Force logout signal — skip if pending verification
  useEffect(() => {
    const handler = () => {
      const pending = localStorage.getItem(storageKeys.pendingVerification);
      if (pending) return;
      clearSession();
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [clearSession]);

  const login = async (payload) => {
    try {
      const response = await authService.login(payload);
      localStorage.setItem(storageKeys.token, response.access_token);
      writeJSON(storageKeys.user, response.user);
      setUser(response.user);
      return response;
    } catch (err) {
      if (err?.response?.status === 403 && err?.response?.data?.requires_verification) {
        const data = err.response.data;
        localStorage.setItem(storageKeys.token, data.access_token);
        localStorage.setItem(storageKeys.pendingVerification, '1');
        return data;
      }
      throw err;
    }
  };

  const register = async (payload) => authService.register(payload);

  const logout = async () => {
    try { await authService.logout(); } catch {}
    clearSession();
  };

  const can = useCallback((permission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (permission === null) return false;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  }, [user]);

  const hasRole = useCallback((...roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    hasStoreAssignment: userHasStoreAssignment(user),
    can,
    hasRole,
    login,
    register,
    logout,
    refreshProfile,
    setUser,
    clearSession,
  }), [can, clearSession, hasRole, loading, refreshProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}