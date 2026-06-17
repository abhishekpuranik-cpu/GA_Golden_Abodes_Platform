import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useDemands(params = {}) {
  const [demands, setDemands] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await postSalesApi.listDemands(params);
      setDemands(data.demands || []);
      setSummary(data.summary || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateDemand = async (id, body) => {
    const d = await postSalesApi.updateDemand(id, body);
    await refresh();
    return d;
  };

  return { demands, summary, loading, error, refresh, updateDemand };
}
