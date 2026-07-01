import { useMemo, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { docTypeForChecklistItem } from '../../lib/postsales/checklistDocTypes.js';

function openUrl(doc) {
  if (doc?.fileId) return postSalesApi.documentFileUrl(doc.fileId);
  if (doc?.driveLink) return doc.driveLink;
  return null;
}

export default function ChecklistLineDocs({
  unitId,
  stepNumber = 12,
  clpLetterTaskId,
  checklist = [],
  documents = [],
  actor = '',
  uploadDocument,
  onRefresh,
  disabled = false,
  compact = false,
}) {
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState(null);

  const byLine = useMemo(() => {
    const map = new Map();
    for (const doc of documents) {
      if (clpLetterTaskId && String(doc.clpLetterTaskId) !== String(clpLetterTaskId)) continue;
      if (!clpLetterTaskId && doc.clpLetterTaskId) continue;
      const idx = doc.checklistIndex ?? -1;
      if (!map.has(idx)) map.set(idx, []);
      map.get(idx).push(doc);
    }
    return map;
  }, [documents, clpLetterTaskId]);

  const uploadFiles = async (index, itemText, fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    setErr(null);
    setBusyKey(`${index}`);
    try {
      for (const file of files) {
        await uploadDocument(file, {
          unitId,
          stepNumber,
          clpLetterTaskId: clpLetterTaskId || undefined,
          checklistIndex: index,
          checklistItem: itemText,
          docType: docTypeForChecklistItem(itemText, index),
          label: file.name,
          status: 'uploaded',
          uploadedBy: actor,
        });
      }
      onRefresh?.({ silent: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyKey(null);
    }
  };

  if (!checklist.length) {
    return <div className="ps-reports-muted">No checklist lines for attachments.</div>;
  }

  return (
    <div className={`ps-checklist-docs ${compact ? 'compact' : ''}`}>
      {!compact && <strong>Documents per checklist line</strong>}
      {err && <div className="ps-error">{err}</div>}
      {checklist.map((item, index) => {
        const lineDocs = byLine.get(index) || [];
        const busy = busyKey === String(index);
        return (
          <div key={index} className="ps-checklist-doc-row">
            <div className="ps-checklist-doc-label">
              <span className="ps-checklist-doc-num">{index + 1}.</span>
              <span>{item.item || item}</span>
              {item.done && <span className="ps-badge ps-badge-green" style={{ marginLeft: 8 }}>done</span>}
            </div>
            <div className="ps-checklist-doc-files">
              {lineDocs.length ? lineDocs.map((doc) => (
                <div key={doc._id} className="ps-checklist-doc-chip">
                  {openUrl(doc) ? (
                    <a href={openUrl(doc)} target="_blank" rel="noreferrer">{doc.fileName || doc.label || 'File'}</a>
                  ) : (
                    <span>{doc.fileName || doc.label || 'File'}</span>
                  )}
                </div>
              )) : (
                <span className="ps-reports-muted">No files</span>
              )}
            </div>
            <label className={`ps-btn ps-reports-mini-btn ${busy ? 'disabled' : ''}`} style={{ margin: 0, cursor: disabled || busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Uploading…' : '+ Add files'}
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt"
                style={{ display: 'none' }}
                disabled={disabled || busy}
                onChange={(e) => {
                  uploadFiles(index, item.item || item, e.target.files || []);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
