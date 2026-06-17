import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useMilestones(params = {}) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMilestones(await postSalesApi.listMilestones(params));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { refresh(); }, [refresh]);

  const createMilestone = async (body) => {
    const m = await postSalesApi.createMilestone(body);
    await refresh();
    return m;
  };

  const triggerMilestone = async (id) => {
    const r = await postSalesApi.triggerMilestone(id);
    await refresh();
    return r;
  };

  return { milestones, loading, error, refresh, createMilestone, triggerMilestone };
}
