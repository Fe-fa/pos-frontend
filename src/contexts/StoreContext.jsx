import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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

const pickPreferredStore = (stores, persistedStoreId, defaultStoreId) => {
  const candidates = [
    String(persistedStoreId || ''),
    String(defaultStoreId || ''),
    String(stores?.[0]?.store_id || ''),
  ].filter(Boolean);

  const matched = candidates.find((candidate) =>
    stores.some((store) => String(store.store_id) === String(candidate))
  );

  return matched || '';
};

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [storeId, setStoreIdState] = useState(localStorage.getItem(storageKeys.storeId) || '');
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);

  const syncStoreId = (nextValue) => {
    const normalized = String(nextValue || '');
    setStoreIdState(normalized);

    if (normalized) localStorage.setItem(storageKeys.storeId, normalized);
    else localStorage.removeItem(storageKeys.storeId);
  };
  useEffect(() => {
    async function resolveStores() {
      if (!user) {
        setStores([]);
        syncStoreId('');
        return;
      }
      const embeddedStores = normalizeStores(user) || [];

      if (user.role === 'admin') {
        setLoading(true);
        try {
          const response = await storeService.list({ per_page: 10 });
          const apiStores = extractStores(response);
          const nextStores = apiStores.length ? apiStores : embeddedStores;

          setStores(nextStores);

          const preferred = pickPreferredStore(
            nextStores,
            localStorage.getItem(storageKeys.storeId),
            user.default_store_id
          );
          syncStoreId(preferred);
        } catch {
          setStores(embeddedStores);
          const preferred = pickPreferredStore(
            embeddedStores,
            localStorage.getItem(storageKeys.storeId),
            user.default_store_id
          );
          syncStoreId(preferred);
        } finally {
          setLoading(false);
        }
        return;
      }
      const nextStores = embeddedStores;
      setStores(nextStores);

      const preferred = pickPreferredStore(
        nextStores,
        storeId,
        user.default_store_id
      );
      syncStoreId(preferred);
    }

    resolveStores();
  }, [user]);
  const value = useMemo(() => {
    const activeStore =
      stores.find((store) => String(store.store_id) === String(storeId)) || null;
    return {
      storeId,
      setStoreId: syncStoreId,
      stores,
      loading,
      activeStore,
    };
  }, [storeId, stores, loading]);
  
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
