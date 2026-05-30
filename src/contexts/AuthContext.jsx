import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storageKeys } from '../lib/api';
import { authService } from '../services/authService';
import { readJSON, userHasStoreAssignment, writeJSON } from '../utils/helpers';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readJSON(storageKeys.user, null));
  const [loading, setLoading] = useState(!!localStorage.getItem(storageKeys.token));

  const clearSession = useCallback(() => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.storeId);
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const response = await authService.me();
    writeJSON(storageKeys.user, response.user);
    setUser(response.user);
    return response.user;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(storageKeys.token);
    if (!token) {
      setLoading(false);
      return;
    }

    refreshProfile()
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [clearSession, refreshProfile]);

  const login = async (payload) => {
    const response = await authService.login(payload);
    localStorage.setItem(storageKeys.token, response.access_token);
    writeJSON(storageKeys.user, response.user);
    setUser(response.user);
    return response.user;
  };

  const register = async (payload) => authService.register(payload);

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore logout errors
    }
    clearSession();
  };

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    hasStoreAssignment: userHasStoreAssignment(user),
    login,
    register,
    logout,
    refreshProfile,
    setUser,
    clearSession,
  }), [clearSession, loading, refreshProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
