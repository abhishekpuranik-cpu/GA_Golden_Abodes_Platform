import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, getCached, setCached } from '../../lib/postsales/postSalesCache.js';

export function useCollectionRegister(filters = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [asOf, setAsOf] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postSalesApi.getCollectionRegister(filters);
      setRows(data.rows || []);
      setSummary(data.summary || null);
      setAsOf(data.asOf || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveForecast = async (unitId, body) => {
    const result = await postSalesApi.saveCollectionForecast(unitId, body);
    await refresh();
    return result;
  };

  return { rows, summary, asOf, loading, error, refresh, saveForecast };
}

export function useDisbursementForecast(filters = {}, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const key = cacheKey(['disb-forecast', filterKey]);
    const cached = getCached(key);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await postSalesApi.getDisbursementForecast(filters);
      setCached(key, result, 2 * 60 * 1000);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, filterKey]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    refresh();
  }, [enabled, refresh]);

  return { data, loading, error, refresh };
}
