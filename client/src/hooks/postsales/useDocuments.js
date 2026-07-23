import { useCallback, useEffect, useState } from 'react';

import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, cachedFetch, getCached, setCached } from '../../lib/postsales/postSalesCache.js';

function docIdentity(d) {
  return `${d._id}|${d.docType}|${d.clpLetterTaskId || ''}|${d.checklistIndex ?? ''}|${d.stepNumber ?? ''}`;
}

export function useDocuments(unitId) {
  const [data, setData] = useState({ documents: [], grouped: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!unitId) { setData({ documents: [], grouped: {} }); setLoading(false); return; }
    const key = cacheKey(['documents', unitId]);
    if (!silent) {
      const cached = getCached(key);
      if (cached) {
        setData(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    try {
      const next = silent
        ? await postSalesApi.listDocuments(unitId)
        : await cachedFetch(key, () => postSalesApi.listDocuments(unitId), 2 * 60 * 1000);
      if (silent) setCached(key, next, 2 * 60 * 1000);
      setData(next);
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
      const documents = [...prev.documents, doc];
      const grouped = { ...prev.grouped };
      const stepKey = doc.stepNumber || 0;
      grouped[stepKey] = documents.filter((d) => (d.stepNumber || 0) === stepKey);
      const next = { documents, grouped };
      if (unitId) setCached(cacheKey(['documents', unitId]), next, 2 * 60 * 1000);
      return next;
    });
    return doc;
  };

  const uploadDocuments = async (files, meta) => {
    const list = [...files];
    const docs = [];
    for (const file of list) {
      docs.push(await uploadDocument(file, meta));
    }
    return docs;
  };

  return { ...data, loading, error, refresh, uploadDocument, uploadDocuments, docIdentity };
}
