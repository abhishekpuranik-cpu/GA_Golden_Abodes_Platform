import { useCallback, useEffect, useState } from 'react';

import { postSalesApi } from '../../lib/postSalesApi.js';

function docIdentity(d) {
  return `${d._id}|${d.docType}|${d.clpLetterTaskId || ''}|${d.checklistIndex ?? ''}|${d.stepNumber ?? ''}`;
}

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
      const documents = [...prev.documents, doc];
      const grouped = { ...prev.grouped };
      const stepKey = doc.stepNumber || 0;
      grouped[stepKey] = documents.filter((d) => (d.stepNumber || 0) === stepKey);
      return { documents, grouped };
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
