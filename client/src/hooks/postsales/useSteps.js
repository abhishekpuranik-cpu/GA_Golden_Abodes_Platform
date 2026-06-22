import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

function mergeStep(prev, stepNumber, patch) {
  if (typeof patch === 'function') {
    return prev.map((s) => (s.stepNumber === stepNumber ? patch(s) : s));
  }
  return prev.map((s) => (s.stepNumber === stepNumber ? { ...s, ...patch } : s));
}

export function useSteps(unitId, actor = '') {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!unitId) return;
    if (!silent) setLoading(true);
    try {
      setSteps(await postSalesApi.getSteps(unitId));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateStep = async (stepNumber, body) => {
    const step = await postSalesApi.updateStep(unitId, stepNumber, { ...body, by: actor });
    setSteps((prev) => mergeStep(prev, stepNumber, step));
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
      setSteps((prev) => mergeStep(prev, stepNumber, step));
      return step;
    } catch (e) {
      await refresh({ silent: true });
      throw e;
    }
  };

  const addStepComment = async (stepNumber, text) => {
    const step = await postSalesApi.addStepComment(unitId, stepNumber, { text, by: actor });
    setSteps((prev) => mergeStep(prev, stepNumber, step));
    return step;
  };

  return { steps, loading, error, refresh, updateStep, toggleChecklist, addStepComment };
}
