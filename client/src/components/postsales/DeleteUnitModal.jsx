import { useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export default function DeleteUnitModal({ unit, onClose, onDeleted }) {
  const [password, setPassword] = useState('');
  const [confirmUnit, setConfirmUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const label = [unit?.project, unit?.unitNumber].filter(Boolean).join(' · ');
  const canSubmit = password.trim() && confirmUnit.trim() === String(unit?.unitNumber || '').trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postSalesApi.deleteUnit(unit._id, password);
      onDeleted?.(r);
      onClose();
    } catch (err) {
      setError(err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ps-modal-overlay" onClick={onClose}>
      <div className="ps-modal" onClick={(ev) => ev.stopPropagation()}>
        <h3>Delete duplicate unit</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>
          Permanently removes <strong>{label}</strong> and all pipeline steps, demands, documents, and CLP tasks for this unit.
          This cannot be undone.
        </p>
        <form onSubmit={submit}>
          {error && <div className="ps-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="ps-form-group">
            <label>Type unit number to confirm</label>
            <input
              value={confirmUnit}
              onChange={(e) => setConfirmUnit(e.target.value)}
              placeholder={unit?.unitNumber || 'Unit number'}
              autoComplete="off"
            />
          </div>
          <div className="ps-form-group">
            <label>Admin password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Same as Work Allocation admin"
              autoComplete="current-password"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="ps-btn ps-btn-danger" disabled={!canSubmit || busy}>
              {busy ? 'Deleting…' : 'Delete unit'}
            </button>
            <button type="button" className="ps-btn" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
