import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useSteps(unitId, actor = '') {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      setSteps(await postSalesApi.getSteps(unitId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateStep = async (stepNumber, body) => {
    const step = await postSalesApi.updateStep(unitId, stepNumber, { ...body, by: actor });
    await refresh();
    return step;
  };

  const toggleChecklist = async (stepNumber, index, done) => {
    const step = await postSalesApi.toggleChecklist(unitId, stepNumber, index, { done, by: actor });
    await refresh();
    return step;
  };

  const addStepComment = async (stepNumber, text) => {
    const step = await postSalesApi.addStepComment(unitId, stepNumber, { text, by: actor });
    await refresh();
    return step;
  };

  return { steps, loading, error, refresh, updateStep, toggleChecklist, addStepComment };
}
