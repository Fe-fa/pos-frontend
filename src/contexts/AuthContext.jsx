
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storageKeys } from '../lib/api';
import { authService } from '../services/authService';
import { readJSON, userHasStoreAssignment, writeJSON } from '../utils/helpers';

export const AuthContext = createContext(null);
export { useAuth } from '../hooks/useAuth';

let inflightProfileFetch = null;
const PERMISSION_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function isPendingVerification() {
  return !!localStorage.getItem(storageKeys.pendingVerification);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readJSON(storageKeys.user, null));
  const [loading, setLoading] = useState(!!localStorage.getItem(storageKeys.token));

  // ── Clear everything ──────────────────────────────────────
  const clearSession = useCallback(() => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.storeId);
    localStorage.removeItem(storageKeys.pendingVerification);
    inflightProfileFetch = null;
    setUser(null);
  }, []);

  // ── Refresh /auth/me ──────────────────────────────────────
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

  // ── Silent token refresh ──────────────────────────────────
  // Calls /auth/refresh, updates the stored token, returns true on success.
  const silentRefresh = useCallback(async () => {
    try {
      const response = await authService.refresh();
      if (response?.access_token) {
        localStorage.setItem(storageKeys.token, response.access_token);
        if (response.user) {
          writeJSON(storageKeys.user, response.user);
          setUser(response.user);
        }
        return true;
      }
    } catch {
      // refresh window expired → force logout
    }
    return false;
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────
  // Run once on mount. Skip only when BOTH conditions are true:
  //   a) a token exists  AND  b) pendingVerification is set.
  // This ensures a user who completed verification (flag removed) 
  // gets their profile loaded normally on the next page load.
  useEffect(() => {
    const token = localStorage.getItem(storageKeys.token);

    if (!token) {
      setLoading(false);
      return;
    }

    // If the user is mid-verification, don't call /auth/me yet —
    // they haven't verified their email so the backend would return
    // profile data for an un-verified account. VerifyEmailPage will
    // remove this flag and call setUser itself after success.
    if (isPendingVerification()) {
      setLoading(false);
      return;
    }

    refreshProfile()
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [clearSession, refreshProfile]);

  // ── Periodic permission refresh ───────────────────────────
  useEffect(() => {
    if (!user) return;
    if (isPendingVerification()) return;

    const interval = setInterval(async () => {
      try {
        await refreshProfile();
      } catch (err) {
        if (err?.response?.status === 401) {
          // Try a silent token refresh first before logging out
          const refreshed = await silentRefresh();
          if (refreshed) {
            // Try profile again with the new token
            try { await refreshProfile(); } catch { clearSession(); }
          } else {
            clearSession();
          }
        }
      }
    }, PERMISSION_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user, refreshProfile, clearSession, silentRefresh]);

  // ── Force logout signal ───────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (isPendingVerification()) return;
      clearSession();
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [clearSession]);

  // ── Login ─────────────────────────────────────────────────
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

  // ── Register ──────────────────────────────────────────────
  const register = async (payload) => authService.register(payload);

  // ── Logout ────────────────────────────────────────────────
  const logout = async () => {
    try { await authService.logout(); } catch {}
    clearSession();
  };

  // ── Permission helpers ────────────────────────────────────
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

  // ── Context value ─────────────────────────────────────────
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
    silentRefresh,
    setUser,
    clearSession,
  }), [can, clearSession, hasRole, loading, refreshProfile, silentRefresh, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
