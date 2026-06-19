import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { storageKeys } from '../lib/api';
import { storeService } from '../services/storeService';
import { normalizeStores } from '../utils/helpers';
import { useAuth } from './AuthContext';

const StoreContext = createContext(null);

const extractStores = (response) => {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
};

// Deduplicate by store_id — prevents dashboard from fetching billings/inventory
// once per duplicate entry
const deduplicateStores = (stores) =>
  Array.from(new Map(stores.map((s) => [String(s.store_id), s])).values());

const pickPreferredStore = (stores, persistedStoreId, defaultStoreId) => {
  const candidates = [
    String(persistedStoreId || ''),
    String(defaultStoreId || ''),
    String(stores?.[0]?.store_id || ''),
  ].filter(Boolean);

  return (
    candidates.find((candidate) =>
      stores.some((s) => String(s.store_id) === String(candidate))
    ) || ''
  );
};

export function StoreProvider({ children }) {
  const { user } = useAuth();

  const [storeId, setStoreIdState] = useState(
    () => localStorage.getItem(storageKeys.storeId) || ''
  );
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);

  // Stable ref so useEffect never needs syncStoreId in its dep array
  const syncStoreId = useCallback((nextValue) => {
    const normalized = String(nextValue || '');
    setStoreIdState(normalized);
    if (normalized) localStorage.setItem(storageKeys.storeId, normalized);
    else localStorage.removeItem(storageKeys.storeId);
  }, []); // no deps — only touches localStorage and stable setter

  // Stable ref for the persisted store ID so resolveStores can read
  // it without capturing a stale closure or adding storeId to the effect deps
  const persistedStoreIdRef = useRef(storeId);
  useEffect(() => {
    persistedStoreIdRef.current = storeId;
  }, [storeId]);

  useEffect(() => {
    if (!user) {
      setStores([]);
      syncStoreId('');
      return;
    }

    let cancelled = false;

    async function resolveStores() {
      const embeddedStores = deduplicateStores(normalizeStores(user) || []);

      if (user.role === 'admin') {
        setLoading(true);
        try {
          const response = await storeService.list({ per_page: 200 });
          if (cancelled) return;

          const apiStores = deduplicateStores(extractStores(response));
          const nextStores = apiStores.length ? apiStores : embeddedStores;

          setStores(nextStores);
          syncStoreId(
            pickPreferredStore(
              nextStores,
              persistedStoreIdRef.current,
              user.default_store_id
            )
          );
        } catch {
          if (cancelled) return;
          setStores(embeddedStores);
          syncStoreId(
            pickPreferredStore(
              embeddedStores,
              persistedStoreIdRef.current,
              user.default_store_id
            )
          );
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // Non-admin: use embedded stores only
      setStores(embeddedStores);
      syncStoreId(
        pickPreferredStore(
          embeddedStores,
          persistedStoreIdRef.current,
          user.default_store_id
        )
      );
    }

    resolveStores();
    return () => { cancelled = true; };
  }, [user, syncStoreId]);

  // Derived state — not stored in useState, computed from existing state
  const activeStore = useMemo(
    () => stores.find((s) => String(s.store_id) === String(storeId)) ?? null,
    [stores, storeId]
  );

  // Context value — only rebuilds when something actually changed
  const value = useMemo(
    () => ({
      storeId,
      setStoreId: syncStoreId,
      stores,
      loading,
      activeStore,
    }),
    [storeId, syncStoreId, stores, loading, activeStore]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}