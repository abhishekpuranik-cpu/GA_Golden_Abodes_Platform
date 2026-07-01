import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, getCached, setCached } from '../../lib/postsales/postSalesCache.js';

export function useUnits(filters = {}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    const key = cacheKey(['units', filterKey]);
    const cached = getCached(key);
    if (cached) {
      setUnits(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await postSalesApi.listUnits(filters);
      setCached(key, data, 2 * 60 * 1000);
      setUnits(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterKey]);

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

/** Lightweight unit picker — skips pipeline step payload. */
export function useUnitsLite(filters = {}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    const key = cacheKey(['units-lite', filterKey]);
    const cached = getCached(key);
    if (cached) {
      setUnits(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await postSalesApi.listUnitsLite(filters);
      setCached(key, data, 3 * 60 * 1000);
      setUnits(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { units, loading, error, refresh };
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
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { unit, loading, error, refresh };
}
