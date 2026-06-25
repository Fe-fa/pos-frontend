import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dashboardService from '../services/dashboardService';

const createEmptyDashboardData = () => ({
  currency: 'KES',
  summary: {
    today: {},
    stats: {},
    loyalty: {},
    top_items: [],
    cashier_performance: [],
    register_performance: [],
  },
  trends: {
    last_7_days: [],
  },
  activity: {
    recent: [],
    pending_orders: [],
    low_stock_rows: [],
  },
});

const createInitialSectionLoading = () => ({
  summary: true,
  trends: false,
  activity: false,
});

const createIdleSectionLoading = () => ({
  summary: false,
  trends: false,
  activity: false,
});

export function useManagerDashboard({ selectedStoreId } = {}) {
  const [data, setData] = useState(createEmptyDashboardData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sectionLoading, setSectionLoading] = useState(createInitialSectionLoading);

  const requestIdRef = useRef(0);
  const mainAbortRef = useRef(null);

  const applySection = useCallback((key, payload) => {
    setData((prev) => {
      switch (key) {
        case 'summary':
          return {
            ...prev,
            currency: payload?.currency ?? prev.currency,
            summary: payload?.summary ?? prev.summary,
          };

        case 'trends':
          return {
            ...prev,
            trends: payload?.trends ?? prev.trends,
          };

        case 'activity':
          return {
            ...prev,
            activity: payload?.activity ?? prev.activity,
          };

        default:
          return prev;
      }
    });
  }, []);

  const markSectionStart = useCallback((key) => {
    setSectionLoading((prev) => ({
      ...prev,
      [key]: true,
    }));
  }, []);

  const markSectionSuccess = useCallback((key) => {
    setSectionLoading((prev) => {
      const next = { ...prev, [key]: false };

      // After summary finishes, trends + activity start in parallel
      if (key === 'summary') {
        next.trends = true;
        next.activity = true;
      }

      return next;
    });
  }, []);

  const stopAllSectionLoading = useCallback(() => {
    setSectionLoading(createIdleSectionLoading());
  }, []);

  const loadDashboard = useCallback(
    async ({ clearExisting = false, isRefresh = false } = {}) => {
      mainAbortRef.current?.abort();

      const controller = new AbortController();
      mainAbortRef.current = controller;

      const reqId = ++requestIdRef.current;

      if (clearExisting) {
        setData(createEmptyDashboardData());
      }

      setError('');
      setLoading(!isRefresh);
      setRefreshing(isRefresh);
      setSectionLoading(createInitialSectionLoading());

      try {
        await dashboardService.initializeManagerDashboard({
          storeId: selectedStoreId,
          signal: controller.signal,
          onSectionStart: (key) => {
            if (requestIdRef.current !== reqId) return;
            markSectionStart(key);
          },
          onSectionSuccess: (key, payload) => {
            if (requestIdRef.current !== reqId) return;
            applySection(key, payload);
            markSectionSuccess(key);
          },
        });
      } catch (err) {
        if (requestIdRef.current !== reqId) return;
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;

        setError(
          err?.response?.data?.message ||
            err?.message ||
            'Failed to initialize manager dashboard.'
        );
      } finally {
        if (requestIdRef.current === reqId) {
          setLoading(false);
          setRefreshing(false);
          stopAllSectionLoading();
          mainAbortRef.current = null;
        }
      }
    },
    [selectedStoreId, applySection, markSectionStart, markSectionSuccess, stopAllSectionLoading]
  );

  const refresh = useCallback(async () => {
    await loadDashboard({ clearExisting: false, isRefresh: true });
  }, [loadDashboard]);

  useEffect(() => {
    loadDashboard({ clearExisting: true, isRefresh: false });

    return () => {
      mainAbortRef.current?.abort();
    };
  }, [loadDashboard]);

  return useMemo(
    () => ({
      data,
      loading,
      refreshing,
      error,
      sectionLoading,
      refresh,
      isScopedToStore: Boolean(selectedStoreId),
    }),
    [data, loading, refreshing, error, sectionLoading, refresh, selectedStoreId]
  );
}

export default useManagerDashboard;
