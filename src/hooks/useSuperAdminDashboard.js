import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dashboardService from '../services/dashboardService';

const createEmptyDashboardData = () => ({
  currency: 'KES',
  summary: { platform: {}, today: {}, stats: {}, inventory: {}, store_performance: [] },
  trends: { last_7_days: [] },
  operations: { system_health: {}, background_jobs: [] },
  subscriptions: { subscription_distribution: [] },
  security: { audit_events: [], meta: null },
});

const createInitialSectionLoading = () => ({
  summary: true, trends: false, operations: false, subscriptions: false, security: false,
});

const createIdleSectionLoading = () => ({
  summary: false, trends: false, operations: false, subscriptions: false, security: false,
});

const NEXT_SECTION_MAP = {
  summary: 'trends', trends: 'operations', operations: 'subscriptions',
  subscriptions: 'security', security: null,
};

const FALLBACK_MAP = {
  summary: 'Failed to load dashboard summary.',
  trends: 'Failed to load dashboard trends.',
  operations: 'Failed to load operations.',
  subscriptions: 'Failed to load subscriptions.',
  security: 'Failed to load security events.',
};

export function useSuperAdminDashboard({ selectedStoreId } = {}) {
  const [data, setData] = useState(createEmptyDashboardData);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sectionLoading, setSectionLoading] = useState(createInitialSectionLoading);
  const [securityPage, setSecurityPage] = useState(1);

  const requestIdRef = useRef(0);
  const mainAbortRef = useRef(null);
  const securityAbortRef = useRef(null);
  const securityRequestIdRef = useRef(0);

  // ← ADD 1: ref to always hold the latest storeId without being a dep
  const selectedStoreIdRef = useRef(selectedStoreId);
  useEffect(() => {
    selectedStoreIdRef.current = selectedStoreId;
  }, [selectedStoreId]);

  // ← ADD 2: ref to track previous storeId so we skip duplicate loads
  const prevStoreIdRef = useRef(undefined);

  const applySection = useCallback((key, payload) => {
    setData((prev) => {
      switch (key) {
        case 'summary':
          return { ...prev, currency: payload?.currency ?? prev.currency, summary: payload?.summary ?? prev.summary };
        case 'trends':
          return { ...prev, trends: payload?.trends ?? prev.trends };
        case 'operations':
          return { ...prev, operations: payload?.operations ?? prev.operations };
        case 'subscriptions':
          return { ...prev, subscriptions: payload?.subscriptions ?? prev.subscriptions };
        case 'security':
          return { ...prev, security: payload?.security ?? prev.security };
        default:
          return prev;
      }
    });
  }, []);

  const markSectionStart = useCallback((key) => {
    setSectionLoading((prev) => ({ ...prev, [key]: true }));
  }, []);

  const markSectionSuccess = useCallback((key) => {
    const nextKey = NEXT_SECTION_MAP[key];
    setSectionLoading((prev) => ({
      ...prev,
      [key]: false,
      ...(nextKey ? { [nextKey]: true } : null),
    }));
  }, []);

  const stopAllSectionLoading = useCallback(() => {
    setSectionLoading(createIdleSectionLoading());
  }, []);

  // ← CHANGED: selectedStoreId removed from deps, read via ref instead
  const loadDashboard = useCallback(
    async ({ clearExisting = false, isRefresh = false } = {}) => {
      mainAbortRef.current?.abort();

      const controller = new AbortController();
      mainAbortRef.current = controller;

      const reqId = ++requestIdRef.current;

      if (clearExisting) setData(createEmptyDashboardData());

      setError('');
      setSecurityPage(1);
      setLoading(!isRefresh);
      setRefreshing(isRefresh);
      setSectionLoading(createInitialSectionLoading());

      try {
        await dashboardService.initializeSuperAdminDashboard({
          storeId: selectedStoreIdRef.current,  // ← use ref here
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
        setError(err?.response?.data?.message || err?.message || 'Failed to initialize dashboard.');
      } finally {
        if (requestIdRef.current === reqId) {
          setLoading(false);
          setRefreshing(false);
          stopAllSectionLoading();
          mainAbortRef.current = null;
        }
      }
    },
    [applySection, markSectionStart, markSectionSuccess, stopAllSectionLoading] // ← selectedStoreId removed
  );

  const refresh = useCallback(async () => {
    await loadDashboard({ clearExisting: false, isRefresh: true });
  }, [loadDashboard]);

  const changeSecurityPage = useCallback(
    async (nextPage) => {
      const page = Number(nextPage);
      if (!Number.isInteger(page) || page < 1) return;
      if (page === securityPage) return;

      securityAbortRef.current?.abort();
      const controller = new AbortController();
      securityAbortRef.current = controller;
      const reqId = ++securityRequestIdRef.current;

      setError('');
      setSectionLoading((prev) => ({ ...prev, security: true }));

      try {
        const payload = await dashboardService.getSuperAdminSecurity({
          storeId: selectedStoreIdRef.current,  // ← use ref here too
          signal: controller.signal,
          page,
        });
        if (securityRequestIdRef.current !== reqId) return;
        applySection('security', payload);
        setSecurityPage(page);
      } catch (err) {
        if (securityRequestIdRef.current !== reqId) return;
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
        setError(err?.response?.data?.message || err?.message || FALLBACK_MAP.security);
      } finally {
        if (securityRequestIdRef.current === reqId) {
          setSectionLoading((prev) => ({ ...prev, security: false }));
          securityAbortRef.current = null;
        }
      }
    },
    [securityPage, applySection] // ← selectedStoreId removed
  );

  // ← CHANGED: skip load if storeId hasn't actually changed
  useEffect(() => {
    if (prevStoreIdRef.current === selectedStoreId) return;
    prevStoreIdRef.current = selectedStoreId;

    loadDashboard({ clearExisting: true, isRefresh: false });

    return () => {
      mainAbortRef.current?.abort();
      securityAbortRef.current?.abort();
    };
  }, [selectedStoreId, loadDashboard]);

  return useMemo(
    () => ({
      data, loading, refreshing, error, sectionLoading,
      refresh, securityPage, changeSecurityPage,
      isScopedToStore: Boolean(selectedStoreId),
    }),
    [data, loading, refreshing, error, sectionLoading, refresh, securityPage, changeSecurityPage, selectedStoreId]
  );
}

export default useSuperAdminDashboard;