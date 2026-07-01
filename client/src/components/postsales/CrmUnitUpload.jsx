import { useRef, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

const ACTION_BADGE = {
  create: 'green',
  update: 'amber',
  unchanged: 'grey',
  error: 'red',
};

export default function CrmUnitUpload({ scope, onComplete }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const scopeLabel = [scope.project, scope.phase, scope.building].filter(Boolean).join(' · ') || 'All projects';

  const [applyMsg, setApplyMsg] = useState(null);

  const runUpload = async (dryRun) => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose an Excel or CSV file first.');
      return;
    }
    setBusy(true);
    setError(null);
    if (!dryRun) setApplyMsg('Applying import — this may take up to a minute for large files…');
    try {
      const result = await postSalesApi.uploadCrmUnits(file, { ...scope, dryRun });
      if (dryRun) {
        setPreview(result);
        setApplyMsg(null);
      } else {
        setPreview(null);
        setApplyMsg(null);
        if (fileRef.current) fileRef.current.value = '';
        onComplete?.(result);
      }
    } catch (e) {
      setApplyMsg(null);
      setError(e.message || 'Import failed — try again or use a smaller file.');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    window.open('/api/postsales/units/crm-template', '_blank');
  };

  return (
    <div className="ps-card ps-demands-upload" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <strong>Upload CRM data</strong>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>
            Daily sold-units file scoped to filter: <strong>{scopeLabel}</strong>.
            Supports the full CRM template or Cashflow <strong>collection_report_stage_wise</strong> dump.
            <strong> Re-imports keep existing pipeline progress, step comments, checklists, documents, and CLP letter tasks</strong> — only master fields and collection amounts are refreshed.
            New units still get pipeline + demands from the spreadsheet. Empty CRM columns do not overwrite saved phone, executives, etc.
          </p>
        </div>
        <button type="button" className="ps-btn" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Open upload'}
        </button>
      </div>

      {open && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button type="button" className="ps-btn" onClick={downloadTemplate}>Download template</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" />
            <button type="button" className="ps-btn" disabled={busy} onClick={() => runUpload(true)}>
              {busy && !preview ? 'Previewing…' : 'Preview import'}
            </button>
            <button
              type="button"
              className="ps-btn ps-btn-primary"
              disabled={busy || !(preview?.summary?.create || preview?.summary?.update)}
              onClick={() => {
                if (!window.confirm(`Apply import?\n\nNew: ${preview?.summary?.create ?? 0}\nUpdates: ${preview?.summary?.update ?? 0}\nUnchanged: ${preview?.summary?.unchanged ?? 0}`)) return;
                runUpload(false);
              }}
            >
              {busy && applyMsg ? 'Applying…' : 'Apply import'}
            </button>
          </div>

          {applyMsg && <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>{applyMsg}</div>}
          {error && <div className="ps-error" style={{ marginTop: 10 }}>{error}</div>}

          {preview && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10, fontSize: '0.85rem' }}>
                <span><strong>{preview.summary.create}</strong> new</span>
                <span><strong>{preview.summary.update}</strong> update</span>
                <span><strong>{preview.summary.unchanged}</strong> unchanged</span>
                <span><strong>{preview.summary.errors}</strong> errors</span>
                {(preview.summary.demandsCreated > 0 || preview.summary.demandsUpdated > 0) && (
                  <span><strong>{preview.summary.demandsCreated || 0}</strong> demands (new)</span>
                )}
                {preview.summary.pipelineAdvanced > 0 && (
                  <span><strong>{preview.summary.pipelineAdvanced}</strong> pipeline advances</span>
                )}
              </div>
              <div style={{ overflow: 'auto', maxHeight: 320, border: '1px solid var(--ps-border)', borderRadius: 8 }}>
                <table className="ps-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Unit</th>
                      <th>Customer</th>
                      <th>Step</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 200).map((r, i) => (
                      <tr key={`${r.unitNumber}-${i}`}>
                        <td><span className={`ps-badge ps-badge-${ACTION_BADGE[r.action] || 'grey'}`}>{r.action}</span></td>
                        <td>
                          <strong>{r.unitNumber}</strong>
                          <div className="ps-demands-meta">{[r.project, r.phase, r.building].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td>{r.customerName || '—'}</td>
                        <td>{r.pipelineStep ? `${r.pipelineStep}/20` : r.currentStep ? `${r.currentStep}/20` : r.action === 'create' ? '1/20' : '—'}</td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {r.error && <span style={{ color: 'var(--ps-danger)' }}>{r.error}</span>}
                          {r.changes?.length > 0 && r.changes.map((c) => (
                            <div key={c.field}>{c.field}: {c.from} → {c.to}</div>
                          ))}
                          {r.action === 'create' && `Pipeline at step ${r.pipelineStep || 1}${r.demands ? ` · ${r.demands} CLP demands with due dates` : ''}`}
                          {r.action === 'update' && r.demands ? `${r.demands} demand rows synced` : null}
                          {r.preservedPipeline && 'Pipeline, comments & attachments preserved'}
                          {r.action === 'unchanged' && 'No changes'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 200 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)', marginTop: 8 }}>Showing first 200 rows.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
