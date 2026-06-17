import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useLoans(unitId) {
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!unitId) { setLoan(null); setLoading(false); return; }
    setLoading(true);
    try {
      setLoan(await postSalesApi.getLoan(unitId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsertLoan = async (body) => {
    const l = await postSalesApi.upsertLoan({ ...body, unitId });
    await refresh();
    return l;
  };

  return { loan, loading, error, refresh, upsertLoan };
}
