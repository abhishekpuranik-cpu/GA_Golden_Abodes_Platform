import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useMyTasks() {
  const [tasks, setTasks] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await postSalesApi.getMyTasks();
      setTasks(data.tasks || []);
      setAssignee(data.assignee || '');
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { tasks, assignee, loading, error, refresh };
}

export function useAssignees() {
  const [assignees, setAssignees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    postSalesApi.listAssignees()
      .then((data) => {
        setAssignees(data.assignees || []);
        setRoles(data.roles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { assignees, roles, loading };
}
