import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { storageKeys } from '../lib/api';
import { authService } from '../services/authService';
import { readJSON, userHasStoreAssignment, writeJSON } from '../utils/helpers';

export const AuthContext = createContext(null);
export { useAuth } from '../hooks/useAuth';

let inflightProfileFetch = null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readJSON(storageKeys.user, null));
  const [loading, setLoading] = useState(!!localStorage.getItem(storageKeys.token));

  const clearSession = useCallback(() => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.storeId);
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

  useEffect(() => {
    const token = localStorage.getItem(storageKeys.token);
    if (!token) { setLoading(false); return; }
    refreshProfile()
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [clearSession, refreshProfile]);

  const login = async (payload) => {
    const response = await authService.login(payload);
    localStorage.setItem(storageKeys.token, response.access_token);
    writeJSON(storageKeys.user, response.user);
    setUser(response.user);

    // Fetch fresh permissions so any recent changes take effect
    try {
      const freshUser = await refreshProfile();
      return freshUser;
    } catch {
      return response.user;
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