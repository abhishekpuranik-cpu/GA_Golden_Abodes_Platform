import { useCallback, useEffect, useRef, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, cachedFetch, getCached, setCached } from '../../lib/postsales/postSalesCache.js';

function mergeStep(prev, stepNumber, patch) {
  if (typeof patch === 'function') {
    return prev.map((s) => (s.stepNumber === stepNumber ? patch(s) : s));
  }
  return prev.map((s) => (s.stepNumber === stepNumber ? { ...s, ...patch } : s));
}

function mergeChecklistFromServer(prevSteps, serverSteps) {
  const byNum = new Map(serverSteps.map((s) => [s.stepNumber, s]));
  return prevSteps.map((local) => {
    const remote = byNum.get(local.stepNumber);
    if (!remote) return local;
    const localCl = local.checklist || [];
    const remoteCl = remote.checklist || [];
    if (!localCl.length) return remote;
    const mergedChecklist = remoteCl.map((item, i) => {
      const localItem = localCl[i];
      if (!localItem) return item;
      if (localItem.done && !item.done) return { ...item, done: true, doneAt: localItem.doneAt, doneBy: localItem.doneBy };
      return item;
    });
    return { ...remote, checklist: mergedChecklist };
  });
}

export function useSteps(unitId, actor = '') {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedForUnit = useRef(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!unitId) return;
    const key = cacheKey(['steps', unitId]);
    if (!silent) {
      const cached = getCached(key);
      if (cached?.length) {
        setSteps(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    try {
      const serverSteps = silent
        ? await postSalesApi.getSteps(unitId)
        : await cachedFetch(key, () => postSalesApi.getSteps(unitId), 3 * 60 * 1000);
      if (silent) setCached(key, serverSteps, 3 * 60 * 1000);
      setSteps((prev) => (prev.length ? mergeChecklistFromServer(prev, serverSteps) : serverSteps));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    if (!unitId) return;
    if (loadedForUnit.current === unitId) return;
    loadedForUnit.current = unitId;
    refresh();
  }, [unitId, refresh]);

  const syncCache = (nextSteps) => {
    if (unitId) setCached(cacheKey(['steps', unitId]), nextSteps, 3 * 60 * 1000);
  };

  const updateStep = async (stepNumber, body) => {
    const step = await postSalesApi.updateStep(unitId, stepNumber, { ...body, by: actor });
    setSteps((prev) => {
      const next = mergeStep(prev, stepNumber, step);
      syncCache(next);
      return next;
    });
    return step;
  };

  const toggleChecklist = async (stepNumber, index, done) => {
    setSteps((prev) => mergeStep(prev, stepNumber, (s) => {
      const checklist = [...(s.checklist || [])];
      const item = checklist[index];
      if (!item) return s;
      checklist[index] = {
        ...item,
        done,
        doneAt: done ? new Date().toISOString() : null,
        doneBy: done ? actor : '',
      };
      return { ...s, checklist };
    }));
    try {
      const step = await postSalesApi.toggleChecklist(unitId, stepNumber, index, { done, by: actor });
      setSteps((prev) => {
        const next = mergeStep(prev, stepNumber, step);
        syncCache(next);
        return next;
      });
      return step;
    } catch (e) {
      await refresh({ silent: true });
      throw e;
    }
  };

  const addStepComment = async (stepNumber, text) => {
    const step = await postSalesApi.addStepComment(unitId, stepNumber, { text, by: actor });
    setSteps((prev) => {
      const next = mergeStep(prev, stepNumber, step);
      syncCache(next);
      return next;
    });
    return step;
  };

  return { steps, loading, error, refresh, updateStep, toggleChecklist, addStepComment };
}
