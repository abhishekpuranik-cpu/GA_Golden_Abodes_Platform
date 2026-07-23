import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, cachedFetch, getCached } from '../../lib/postsales/postSalesCache.js';

export function useMyTasks(filters = {}) {
  const [tasks, setTasks] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [cxCount, setCxCount] = useState(null);
  const [backendCount, setBackendCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const key = cacheKey(['my-tasks', filterKey]);
    if (!silent) {
      const cached = getCached(key);
      if (cached) {
        setTasks(cached.tasks || []);
        setAssignee(cached.assignee || '');
        setCxCount(cached.cxCount ?? null);
        setBackendCount(cached.backendCount ?? null);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    try {
      const data = await cachedFetch(key, () => postSalesApi.getMyTasks(filters), 90 * 1000);
      setTasks(data.tasks || []);
      setAssignee(data.assignee || '');
      setCxCount(data.cxCount ?? null);
      setBackendCount(data.backendCount ?? null);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { tasks, assignee, cxCount, backendCount, loading, error, refresh, setTasks };
}

export function useAssignees() {
  const [assignees, setAssignees] = useState([]);
  const [cxTeam, setCxTeam] = useState([]);
  const [backendTeam, setBackendTeam] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cachedFetch('assignees', () => postSalesApi.listAssignees(), 10 * 60 * 1000)
      .then((data) => {
        setAssignees(data.assignees || []);
        setCxTeam(data.cxTeam || data.assignees || []);
        setBackendTeam(data.backendTeam || data.assignees || []);
        setRoles(data.roles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { assignees, cxTeam, backendTeam, roles, loading };
}
