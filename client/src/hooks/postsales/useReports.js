import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useCollectionRegister(filters = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [asOf, setAsOf] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  }, [JSON.stringify(filters)]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveForecast = async (unitId, body) => {
    const result = await postSalesApi.saveCollectionForecast(unitId, body);
    await refresh();
    return result;
  };

  return { rows, summary, asOf, loading, error, refresh, saveForecast };
}

export function useDisbursementForecast(filters = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await postSalesApi.getDisbursementForecast(filters);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
