import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, getCached, setCached } from '../../lib/postsales/postSalesCache.js';

export function useDemands(params = {}) {
  const [demands, setDemands] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const paramKey = JSON.stringify(params);

  const refresh = useCallback(async () => {
    const key = cacheKey(['demands', paramKey]);
    const cached = getCached(key);
    if (cached) {
      setDemands(cached.demands || []);
      setSummary(cached.summary || {});
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await postSalesApi.listDemands(params);
      setCached(key, data, 90 * 1000);
      setDemands(data.demands || []);
      setSummary(data.summary || {});
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [paramKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateDemand = async (id, body, { silent = false } = {}) => {
    const d = await postSalesApi.updateDemand(id, body);
    if (silent) {
      setDemands((prev) => prev.map((row) => (row._id === id ? { ...row, ...d } : row)));
    } else {
      await refresh();
    }
    return d;
  };

  return { demands, summary, loading, error, refresh, updateDemand };
}
