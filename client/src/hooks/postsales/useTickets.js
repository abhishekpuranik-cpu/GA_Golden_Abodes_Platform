import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useTickets(params = {}) {
  const [tickets, setTickets] = useState([]);
  const [ackBreachCount, setAckBreachCount] = useState(0);
  const [resBreachCount, setResBreachCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await postSalesApi.listTickets(params);
      setTickets(data.tickets || []);
      setAckBreachCount(data.ackBreachCount || 0);
      setResBreachCount(data.resBreachCount || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { refresh(); }, [refresh]);

  const createTicket = async (body) => {
    const t = await postSalesApi.createTicket(body);
    await refresh();
    return t;
  };

  const updateTicket = async (id, body) => {
    const t = await postSalesApi.updateTicket(id, body);
    await refresh();
    return t;
  };

  return { tickets, ackBreachCount, resBreachCount, loading, error, refresh, createTicket, updateTicket };
}
