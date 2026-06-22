import { useCallback, useEffect, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useDocuments(unitId) {
  const [data, setData] = useState({ documents: [], grouped: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!unitId) { setData({ documents: [], grouped: {} }); setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      setData(await postSalesApi.listDocuments(unitId));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { refresh(); }, [refresh]);

  const uploadDocument = async (file, meta) => {
    const doc = await postSalesApi.uploadDocumentFile(file, meta);
    setData((prev) => {
      const documents = [...prev.documents.filter((d) => d.docType !== doc.docType), doc];
      const grouped = { ...prev.grouped };
      const stepKey = doc.stepNumber || 0;
      grouped[stepKey] = [...(grouped[stepKey] || []).filter((d) => d.docType !== doc.docType), doc];
      return { documents, grouped };
    });
    return doc;
  };

  return { ...data, loading, error, refresh, uploadDocument };
}
