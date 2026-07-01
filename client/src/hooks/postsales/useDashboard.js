import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, getCached, setCached } from '../../lib/postsales/postSalesCache.js';

export function useDashboard(filters = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    const key = cacheKey(['dashboard', filterKey]);
    const cached = getCached(key);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const next = await postSalesApi.dashboard(filters);
      setCached(key, next, 90 * 1000);
      setData(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
