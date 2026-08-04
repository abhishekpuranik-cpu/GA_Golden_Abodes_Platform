import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, cachedFetch, getCached } from '../../lib/postsales/postSalesCache.js';

export function useDemands(params = {}) {
  const [demands, setDemands] = useState([]);
  const [summary, setSummary] = useState({});
  const [unitCollectionContext, setUnitCollectionContext] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const paramKey = JSON.stringify(params);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const key = cacheKey(['demands', paramKey]);
    if (!silent) {
      const cached = getCached(key);
      if (cached) {
        setDemands(cached.demands || []);
        setSummary(cached.summary || {});
        setUnitCollectionContext(cached.unitCollectionContext || {});
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    try {
      const data = await cachedFetch(key, () => postSalesApi.listDemands(params), 90 * 1000);
      setDemands(data.demands || []);
      setSummary(data.summary || {});
      setUnitCollectionContext(data.unitCollectionContext || {});
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [paramKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateDemand = async (id, body, { silent = false } = {}) => {
    const d = await postSalesApi.updateDemand(id, body);
    if (silent) {
      setDemands((prev) => prev.map((row) => (row._id === id ? { ...row, ...d } : row)));
    } else {
      await refresh({ silent: true });
    }
    return d;
  };

  return { demands, summary, unitCollectionContext, loading, error, refresh, updateDemand };
}
