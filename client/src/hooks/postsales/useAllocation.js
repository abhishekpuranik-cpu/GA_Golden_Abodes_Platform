import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useAllocation(filters = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await postSalesApi.getAllocation(filters);
      setRows(data.rows || []);
      setSummary(data.summary || {});
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => { refresh(); }, [refresh]);

  const assignExecutives = async (body) => {
    const result = await postSalesApi.assignAllocationExecutives(body);
    await refresh();
    return result;
  };

  const assignSteps = async (body) => {
    const result = await postSalesApi.assignAllocationSteps(body);
    await refresh();
    return result;
  };

  const autoAssign = async (body) => {
    const result = await postSalesApi.autoAssignAllocation(body);
    await refresh();
    return result;
  };

  return { rows, summary, loading, error, refresh, assignExecutives, assignSteps, autoAssign };
}
