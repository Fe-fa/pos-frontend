import { useEffect, useRef, useState } from 'react';
import { dashboardService } from '../services/dashboardService';

const CACHE_TTL = 60_000;
const cache     = new Map();
const CACHE_KEY = 'super-admin-dashboard-summary';

function getHotData() {
  const entry = cache.get(CACHE_KEY);
  if (!entry) return null;
  if (entry.promise) return null;                      // in-flight, not settled data
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(CACHE_KEY);
    return null;
  }
  return entry.data;
}

function getInflight() {
  return cache.get(CACHE_KEY)?.promise ?? null;
}

async function fetchSummary() {
  const hot = getHotData();
  if (hot) return hot;

  const inflight = getInflight();
  if (inflight) return inflight;

  const promise = dashboardService
    .getSuperAdminSummary()
    .then((data) => {
      cache.set(CACHE_KEY, { ts: Date.now(), data, promise: null });
      return data;
    })
    .catch((err) => {
      cache.delete(CACHE_KEY);
      throw err;
    });

  cache.set(CACHE_KEY, { ts: Date.now(), data: null, promise });
  return promise;
}

export function useSuperAdminDashboard() {
  // Lazy initialisers run synchronously on the very first render —
  // before React paints anything.  If the cache is already hot the
  // component mounts with real data and loading=false, so the
  // "Preparing dashboard…" loader is never shown on repeat visits.
  const [summary, setSummary] = useState(() => getHotData());
  const [loading, setLoading] = useState(() => getHotData() === null);
  const [error,   setError  ] = useState('');

  const versionRef = useRef(0);

  useEffect(() => {
    // Cache was hot — component already has data, nothing to fetch.
    if (summary !== null && !getInflight()) return;

    let cancelled = false;
    const version = ++versionRef.current;

    setError('');
    // Only show the loader when there is truly nothing to display yet.
    // If stale summary data is already in state, keep showing it while
    // we refresh silently in the background.
    if (summary === null) setLoading(true);

    fetchSummary()
      .then((data) => {
        if (cancelled || version !== versionRef.current) return;
        setSummary(data);
      })
      .catch((err) => {
        if (cancelled || version !== versionRef.current) return;
        setError(err?.message || 'Failed to load dashboard data.');
      })
      .finally(() => {
        if (!cancelled && version === versionRef.current) {
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { summary, loading, error };
}