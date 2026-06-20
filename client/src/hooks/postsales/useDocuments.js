import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useDocuments(unitId) {
  const [data, setData] = useState({ documents: [], grouped: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!unitId) { setData({ documents: [], grouped: {} }); setLoading(false); return; }
    setLoading(true);
    try {
      setData(await postSalesApi.listDocuments(unitId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createDocument = async (body) => {
    const doc = await postSalesApi.createDocument(body);
    await refresh();
    return doc;
  };

  const uploadDocument = async (file, meta) => {
    const doc = await postSalesApi.uploadDocumentFile(file, meta);
    await refresh();
    return doc;
  };

  const updateDocument = async (id, body) => {
    const doc = await postSalesApi.updateDocument(id, body);
    await refresh();
    return doc;
  };

  return { ...data, loading, error, refresh, createDocument, uploadDocument, updateDocument };
}
