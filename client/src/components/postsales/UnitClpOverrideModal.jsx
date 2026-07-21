import { useCallback, useEffect, useRef, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtInput(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

export default function UnitClpOverrideModal({ unitId, open, onClose, onSaved }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError('');
    try {
      setPayload(await postSalesApi.getUnitClpOverride(unitId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    if (open && unitId) load();
  }, [open, unitId, load]);

  const handleUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const result = await postSalesApi.uploadUnitClpOverride(unitId, file);
      setMsg(`Unit CLP saved — ${result.total || result.tasks?.length || 0} installment(s) synced.`);
      await load();
      onSaved?.(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Remove unit CLP override? This unit will follow the project CLP from Milestones again.')) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const result = await postSalesApi.clearUnitClpOverride(unitId);
      setMsg('Unit CLP override cleared — using project CLP.');
      await load();
      onSaved?.(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const rows = payload?.hasOverride ? payload.unitRows : payload?.projectRows;

  return (
    <div className="ps-modal-overlay" onClick={onClose}>
      <div className="ps-modal ps-unit-clp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: '96vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Unit CLP · {payload?.unitNumber || '…'}</h3>
            <p className="ps-clp-board-hint" style={{ margin: '6px 0 0' }}>
              Upload a CLP schedule for this unit only. Other units keep the project CLP from the Milestones tab.
            </p>
          </div>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={onClose}>Close</button>
        </div>

        {error && <div className="ps-error" style={{ marginBottom: 8 }}>{error}</div>}
        {msg && <div className="ps-clp-msg" style={{ marginBottom: 8 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className="ps-btn ps-btn-primary" style={{ margin: 0, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Uploading…' : 'Upload unit CLP'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = '';
              }}
            />
          </label>
          {payload?.hasOverride && (
            <button type="button" className="ps-btn" disabled={busy} onClick={handleClear}>
              Clear unit CLP
            </button>
          )}
          <span className={`ps-badge ${payload?.hasOverride ? 'ps-badge-amber' : 'ps-badge-grey'}`}>
            {payload?.hasOverride ? 'Unit override active' : 'Using project CLP'}
          </span>
        </div>

        {loading && <div className="ps-reports-muted">Loading…</div>}

        {!loading && rows?.length > 0 && (
          <div style={{ maxHeight: '50vh', overflow: 'auto', border: '1px solid var(--ps-border)', borderRadius: 6 }}>
            <table className="ps-tbl" style={{ fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>%</th>
                  <th>Target</th>
                  <th>Achieved</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.milestone}</td>
                    <td style={{ textAlign: 'right' }}>{row.percentDue ?? 0}</td>
                    <td>{fmtDate(row.targetDate)}</td>
                    <td>{fmtDate(row.achievedDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !rows?.length && (
          <div className="ps-empty">No CLP schedule yet — add project CLP on Milestones, or upload a unit-specific file here.</div>
        )}
      </div>
    </div>
  );
}
