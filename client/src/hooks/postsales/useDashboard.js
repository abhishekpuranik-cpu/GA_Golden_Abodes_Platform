import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, cachedFetch, getCached } from '../../lib/postsales/postSalesCache.js';

export function useDashboard(filters = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const key = cacheKey(['dashboard', filterKey]);
    if (!silent) {
      const cached = getCached(key);
      if (cached) {
        setData(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    setError(null);
    try {
      const next = await cachedFetch(key, () => postSalesApi.dashboard(filters), 90 * 1000);
      setData(next);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
