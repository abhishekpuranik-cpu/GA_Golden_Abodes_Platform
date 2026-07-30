import { useEffect, useMemo, useState } from 'react';

const ACTIONS = [
  { id: 'pending', label: 'Keep pending (verify)', hint: 'Marks unit for verification — pipeline, comments & documents stay intact.' },
  { id: 'cancel', label: 'Mark cancelled', hint: 'Booking cancelled in CRM — unit stays in history as cancelled.' },
  { id: 'reassign', label: 'Change unit number', hint: 'Customer moved to another unit — keeps all pipeline work on this record.' },
];

export default function CrmMissingUnitsModal({ units = [], onCancel, onConfirm, busy = false }) {
  const [choices, setChoices] = useState(() => Object.fromEntries(
    units.map((u) => [u.unitId, { action: 'pending', newUnitNumber: '' }]),
  ));

  useEffect(() => {
    setChoices(Object.fromEntries(
      units.map((u) => [u.unitId, { action: 'pending', newUnitNumber: '' }]),
    ));
  }, [units]);

  const invalid = useMemo(() => units.some((u) => {
    const c = choices[u.unitId];
    if (!c?.action) return true;
    if (c.action === 'reassign' && !String(c.newUnitNumber || '').trim()) return true;
    return false;
  }), [units, choices]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, busy]);

  const handleConfirm = () => {
    const reconciliations = units.map((u) => {
      const c = choices[u.unitId] || {};
      return {
        unitId: u.unitId,
        action: c.action,
        newUnitNumber: c.action === 'reassign' ? String(c.newUnitNumber || '').trim() : undefined,
      };
    });
    onConfirm?.(reconciliations);
  };

  return (
    <div className="ps-task-modal-backdrop" role="dialog" aria-modal="true">
      <div className="ps-task-modal ps-crm-missing-modal">
        <div className="ps-task-modal-hero">
          <div className="ps-task-modal-hero-top">
            <div>
              <div className="ps-task-modal-kicker">CRM reconciliation</div>
              <h2 className="ps-task-modal-title">Units missing from this CRM dump</h2>
            </div>
            <button type="button" className="ps-task-modal-close" onClick={onCancel} disabled={busy} aria-label="Close">×</button>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>
            These booked units exist in Post Sales but were not in the uploaded file (often cancelled or moved in CRM).
            Choose what to do for each — <strong>pipeline steps, comments, checklists, documents, and CLP tasks are always preserved</strong> unless you mark cancelled.
          </p>
        </div>

        <div className="ps-crm-missing-list">
          {units.map((u) => {
            const choice = choices[u.unitId] || { action: 'pending', newUnitNumber: '' };
            return (
              <div key={u.unitId} className="ps-crm-missing-row">
                <div className="ps-crm-missing-main">
                  <strong>{u.project} · {u.unitNumber}</strong>
                  <div className="ps-demands-meta">{u.customerName || '—'}</div>
                  <div className="ps-demands-meta">
                    {[u.phase, u.building].filter(Boolean).join(' · ')}
                    {u.currentStep ? ` · Step ${u.currentStep}/20` : ''}
                    {u.bookingDate ? ` · Booked ${new Date(u.bookingDate).toLocaleDateString('en-IN')}` : ''}
                  </div>
                </div>
                <div className="ps-crm-missing-actions">
                  <label>
                    Action
                    <select
                      value={choice.action}
                      disabled={busy}
                      onChange={(e) => setChoices((prev) => ({
                        ...prev,
                        [u.unitId]: { ...choice, action: e.target.value },
                      }))}
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </label>
                  {choice.action === 'reassign' && (
                    <label>
                      New unit number
                      <input
                        type="text"
                        value={choice.newUnitNumber}
                        disabled={busy}
                        placeholder="e.g. 1204"
                        onChange={(e) => setChoices((prev) => ({
                          ...prev,
                          [u.unitId]: { ...choice, newUnitNumber: e.target.value },
                        }))}
                      />
                    </label>
                  )}
                  <p className="ps-crm-missing-hint">
                    {ACTIONS.find((a) => a.id === choice.action)?.hint}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="ps-task-modal-foot">
          <button type="button" className="ps-btn" onClick={onCancel} disabled={busy}>Back to preview</button>
          <button
            type="button"
            className="ps-btn ps-btn-primary"
            disabled={busy || invalid}
            onClick={handleConfirm}
          >
            {busy ? 'Applying…' : `Apply import & resolve ${units.length} unit(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
