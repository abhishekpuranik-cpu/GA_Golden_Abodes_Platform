import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useUnits(filters = {}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postSalesApi.listUnits(filters);
      setUnits(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => { refresh(); }, [refresh]);

  const createUnit = async (customerBody, unitBody) => {
    const customer = await postSalesApi.createCustomer(customerBody);
    const unit = await postSalesApi.createUnit({ ...unitBody, customerId: customer._id });
    await refresh();
    return unit;
  };

  const updateUnit = async (id, body) => {
    const unit = await postSalesApi.updateUnit(id, body);
    await refresh();
    return unit;
  };

  return { units, loading, error, refresh, createUnit, updateUnit };
}

export function useUnit(id) {
  const [unit, setUnit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      setUnit(await postSalesApi.getUnit(id));
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { unit, loading, error, refresh };
}
