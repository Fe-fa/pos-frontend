import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_VERSION = 1;

const canUseStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

export const buildEmptyPosDraftData = () => ({
  billing: null,
  selectedCustomerId: '',
  notes: '',
  pointsToRedeem: 0,
  chapa5ClaimedQty: 0,
});

export const buildEmptyPublishedPosData = () => ({
  lastPublishedAt: null,
  lastPublishedBillingId: null,
  lastPublishedKind: null,
  billing: null,
});

const normalizeEnvelope = (raw, initialDraftData, initialPublishedData) => ({
  version: STORAGE_VERSION,
  meta: {
    updatedAt: raw?.meta?.updatedAt || Date.now(),
  },
  draft_data:
    raw?.draft_data && typeof raw.draft_data === 'object'
      ? {
          ...clone(initialDraftData),
          ...raw.draft_data,
        }
      : clone(initialDraftData),
  published_data:
    raw?.published_data && typeof raw.published_data === 'object'
      ? {
          ...clone(initialPublishedData),
          ...raw.published_data,
        }
      : clone(initialPublishedData),
});

const loadEnvelope = (storageKey, initialDraftData, initialPublishedData) => {
  if (!storageKey || !canUseStorage()) {
    return normalizeEnvelope(undefined, initialDraftData, initialPublishedData);
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return normalizeEnvelope(undefined, initialDraftData, initialPublishedData);
    }

    const parsed = JSON.parse(raw);
    return normalizeEnvelope(parsed, initialDraftData, initialPublishedData);
  } catch {
    return normalizeEnvelope(undefined, initialDraftData, initialPublishedData);
  }
};

const saveEnvelope = (storageKey, envelope) => {
  if (!storageKey || !canUseStorage()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(envelope));
};

export function useAtomicDraftStore({
  storageKey,
  initialDraftData,
  initialPublishedData,
}) {
  const initialDraftRef = useRef(clone(initialDraftData));
  const initialPublishedRef = useRef(clone(initialPublishedData));
  const storageKeyRef = useRef(storageKey);

  const finalizeEnvelope = useCallback((candidate) => {
    const normalized = normalizeEnvelope(
      candidate,
      initialDraftRef.current,
      initialPublishedRef.current
    );

    return {
      ...normalized,
      version: STORAGE_VERSION,
      meta: {
        updatedAt: Date.now(),
      },
    };
  }, []);

  const [state, setState] = useState(() =>
    finalizeEnvelope(
      loadEnvelope(storageKey, initialDraftRef.current, initialPublishedRef.current)
    )
  );

  useEffect(() => {
    storageKeyRef.current = storageKey;

    const next = finalizeEnvelope(
      loadEnvelope(storageKey, initialDraftRef.current, initialPublishedRef.current)
    );

    setState(next);
  }, [storageKey, finalizeEnvelope]);

  useEffect(() => {
    if (!canUseStorage()) return undefined;

    const onStorage = (event) => {
      if (event.key !== storageKeyRef.current) return;

      const next = finalizeEnvelope(
        loadEnvelope(
          storageKeyRef.current,
          initialDraftRef.current,
          initialPublishedRef.current
        )
      );

      setState(next);
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [finalizeEnvelope]);

  const commit = useCallback(
    (updater) => {
      setState((prev) => {
        const candidate = typeof updater === 'function' ? updater(prev) : updater;
        const next = finalizeEnvelope(candidate);

        // Atomic write: one key, one full snapshot
        saveEnvelope(storageKeyRef.current, next);

        return next;
      });
    },
    [finalizeEnvelope]
  );

  const updateDraftData = useCallback(
    (updater) => {
      commit((prev) => ({
        ...prev,
        draft_data:
          typeof updater === 'function' ? updater(prev.draft_data) : updater,
      }));
    },
    [commit]
  );

  const replaceDraftData = useCallback(
    (nextDraftData) => {
      commit((prev) => ({
        ...prev,
        draft_data: nextDraftData,
      }));
    },
    [commit]
  );

  const clearDraftData = useCallback(() => {
    commit((prev) => ({
      ...prev,
      draft_data: clone(initialDraftRef.current),
    }));
  }, [commit]);

  const setPublishedData = useCallback(
    (updater) => {
      commit((prev) => ({
        ...prev,
        published_data:
          typeof updater === 'function' ? updater(prev.published_data) : updater,
      }));
    },
    [commit]
  );

  const clearPublishedData = useCallback(() => {
    commit((prev) => ({
      ...prev,
      published_data: clone(initialPublishedRef.current),
    }));
  }, [commit]);

  const clearAll = useCallback(() => {
    commit({
      version: STORAGE_VERSION,
      meta: { updatedAt: Date.now() },
      draft_data: clone(initialDraftRef.current),
      published_data: clone(initialPublishedRef.current),
    });
  }, [commit]);

  return {
    state,
    draftData: state.draft_data,
    publishedData: state.published_data,
    updateDraftData,
    replaceDraftData,
    clearDraftData,
    setPublishedData,
    clearPublishedData,
    clearAll,
  };
}
