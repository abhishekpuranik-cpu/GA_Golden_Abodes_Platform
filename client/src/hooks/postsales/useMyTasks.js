import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useMyTasks(filters = {}) {
  const [tasks, setTasks] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [cxCount, setCxCount] = useState(null);
  const [backendCount, setBackendCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await postSalesApi.getMyTasks(filters);
      setTasks(data.tasks || []);
      setAssignee(data.assignee || '');
      setCxCount(data.cxCount ?? null);
      setBackendCount(data.backendCount ?? null);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

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
    postSalesApi.listAssignees()
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
