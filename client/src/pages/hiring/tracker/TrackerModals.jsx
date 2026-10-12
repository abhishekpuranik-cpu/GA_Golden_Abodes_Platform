import { useState } from 'react';
import { REASON_LABEL, STAGES, STAGE_LABEL, toLocalInput } from '../../../lib/hiring/trackerLabels.js';

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="hr-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`hr-modal ${wide ? 'ht-modal-wide' : ''}`}>
        <div className="ht-modal-head">
          <h2>{title}</h2>
          <button type="button" className="ht-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const REASONS_BY_ACTION = {
  HOLD: ['POSITION_ON_HOLD', 'CTC_MISMATCH', 'NOTICE_PERIOD', 'BETTER_CANDIDATE', 'OTHER'],
  REJECT: ['NOT_SUITABLE', 'EXPERIENCE_GAP', 'COMMUNICATION', 'CTC_MISMATCH', 'NOTICE_PERIOD', 'NO_SHOW', 'BETTER_CANDIDATE', 'OTHER'],
  WITHDRAW: ['CANDIDATE_WITHDREW', 'OFFER_DECLINED', 'OTHER']
};

const ACTION_TITLE = { HOLD: 'Put candidate on hold', REJECT: 'Reject candidate', WITHDRAW: 'Mark as withdrawn' };

export function StatusModal({ action, confidentialNote, onClose, onSubmit }) {
  const [reasonCode, setReasonCode] = useState(REASONS_BY_ACTION[action][0]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try { await onSubmit({ action, reasonCode, reason }); } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={ACTION_TITLE[action]} onClose={onClose}>
      <form onSubmit={go}>
        <div className="hr-form-row">
          <label>Reason (visible to HR)</label>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {REASONS_BY_ACTION[action].map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
          </select>
        </div>
        <div className="hr-form-row">
          <label>Note{reasonCode === 'OTHER' ? ' *' : ''}{confidentialNote ? ' (management only)' : ''}</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required={reasonCode === 'OTHER'} />
        </div>
        {err && <p className="hr-error">{err}</p>}
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className={`hr-btn ${action === 'REJECT' ? 'ht-btn-danger' : ''}`} disabled={busy}>Confirm</button>
        </div>
      </form>
    </Modal>
  );
}

export function ReasonModal({ title, label, cta, onClose, onSubmit, children }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try { await onSubmit(reason); } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={go}>
        {children}
        <div className="hr-form-row">
          <label>{label}</label>
          <textarea rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {err && <p className="hr-error">{err}</p>}
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn" disabled={busy}>{cta}</button>
        </div>
      </form>
    </Modal>
  );
}

export function MoveStageModal({ current, onClose, onSubmit }) {
  const [to, setTo] = useState(STAGES.find((s) => s !== current) || 'DECISION');
  return (
    <ReasonModal
      title="Override: move stage"
      label="Override reason (recorded in audit trail) *"
      cta="Move candidate"
      onClose={onClose}
      onSubmit={(reason) => onSubmit({ action: 'MOVE', to, reason })}
    >
      <p className="hr-muted">Use only when the normal workflow cannot be followed. The override is permanently recorded.</p>
      <div className="hr-form-row">
        <label>Move to</label>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {STAGES.filter((s) => s !== current).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
      </div>
    </ReasonModal>
  );
}

export function ScheduleModal({ round, current, users, onClose, onSubmit }) {
  const label = round === 'HR' ? 'HR screening' : round === '1' ? '1st round interview' : '2nd round interview';
  const [at, setAt] = useState(toLocalInput(current?.scheduledAt));
  const [mode, setMode] = useState(current?.mode || 'IN_PERSON');
  const [venue, setVenue] = useState(current?.venue || '');
  const [interviewerId, setInterviewerId] = useState(current?.interviewerId || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pool = users.filter((u) => u.mgmt);

  async function go(e) {
    e.preventDefault();
    if (!at) { setErr('Pick a date and time'); return; }
    setBusy(true);
    setErr('');
    const iv = pool.find((u) => u.id === interviewerId);
    try {
      await onSubmit({
        round,
        scheduledAt: new Date(at).toISOString(),
        ...(round === 'HR' ? {} : { mode, venue, interviewerId, interviewerName: iv?.name || '' })
      });
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <Modal title={`${current?.scheduledAt ? 'Reschedule' : 'Schedule'} ${label}`} onClose={onClose}>
      <form onSubmit={go}>
        <div className="hr-form-row">
          <label>Date &amp; time *</label>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
        </div>
        {round !== 'HR' && (
          <>
            <div className="hr-form-row">
              <label>Interviewer</label>
              <select value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
                <option value="">Select interviewer…</option>
                {pool.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="hr-form-row">
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="IN_PERSON">In person</option>
                <option value="VIDEO">Video call</option>
                <option value="PHONE">Phone</option>
              </select>
            </div>
            <div className="hr-form-row">
              <label>Venue / meeting link</label>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Golden HQ Sales Gallery, Zoom link…" />
            </div>
          </>
        )}
        {current?.rescheduleCount > 0 && <p className="hr-muted">Rescheduled {current.rescheduleCount} time(s) already.</p>}
        {err && <p className="hr-error">{err}</p>}
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-gold" disabled={busy}>Save schedule</button>
        </div>
      </form>
    </Modal>
  );
}

export function DecisionModal({ candidate, needsOverride, onClose, onSubmit }) {
  const [outcome, setOutcome] = useState('SELECTED');
  const [remarks, setRemarks] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDue, setNextActionDue] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSubmit({
        outcome, remarks, nextAction,
        nextActionDue: nextActionDue ? new Date(nextActionDue).toISOString() : null,
        ...(needsOverride ? { override: true, overrideReason } : {})
      });
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <Modal title={`Final hiring decision — ${candidate.name}`} onClose={onClose}>
      <form onSubmit={go}>
        {needsOverride && (
          <div className="ht-alert ht-alert-warn">
            Required rounds are not complete. Recording a decision now is an override and will be audited.
          </div>
        )}
        <div className="ht-decision-group" role="radiogroup">
          {[['SELECTED', 'Selected'], ['ON_HOLD', 'On hold'], ['REJECTED', 'Rejected']].map(([v, l]) => (
            <button key={v} type="button" className={`ht-decision ht-decision-${v.toLowerCase()} ${outcome === v ? 'on' : ''}`} onClick={() => setOutcome(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="hr-form-row">
          <label>Decision remarks * (management only)</label>
          <textarea rows={3} required value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div className="hr-form-row">
          <label>Next action (visible to HR)</label>
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder={outcome === 'SELECTED' ? 'e.g. Release offer at ₹X L, joining by …' : outcome === 'ON_HOLD' ? 'e.g. Revisit after Sourcing Head hire' : 'e.g. Send regret email'}
          />
        </div>
        <div className="hr-form-row">
          <label>Next action due</label>
          <input type="date" value={nextActionDue} onChange={(e) => setNextActionDue(e.target.value)} />
        </div>
        {needsOverride && (
          <div className="hr-form-row">
            <label>Override reason *</label>
            <textarea rows={2} required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
          </div>
        )}
        {err && <p className="hr-error">{err}</p>}
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-gold" disabled={busy}>Record decision</button>
        </div>
      </form>
    </Modal>
  );
}

const PROFILE_FIELDS = [
  ['name', 'Full name', 'text'], ['phone', 'Phone', 'tel'], ['email', 'Email', 'email'],
  ['currentCompany', 'Current company', 'text'], ['currentDesignation', 'Current designation', 'text'],
  ['totalExperienceYears', 'Total experience (yrs)', 'number'], ['location', 'Current location', 'text'],
  ['currentCtcLakh', 'Current CTC (₹ lakh)', 'number'], ['expectedCtcLakh', 'Expected CTC (₹ lakh)', 'number'],
  ['noticePeriodDays', 'Notice period (days)', 'number'], ['source', 'Source', 'text'], ['linkedinUrl', 'LinkedIn URL', 'text']
];

export function EditProfileModal({ candidate, users, onClose, onSubmit }) {
  const [f, setF] = useState(() => {
    const o = {};
    PROFILE_FIELDS.forEach(([k]) => { o[k] = candidate[k] ?? ''; });
    o.profileNotes = candidate.profileNotes || '';
    o.hrOwnerId = candidate.hrOwnerId || '';
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const hr = users.find((u) => u.id === f.hrOwnerId);
    const body = { ...f };
    if (f.hrOwnerId !== (candidate.hrOwnerId || '')) body.hrOwnerName = hr?.name || '';
    else delete body.hrOwnerId;
    try { await onSubmit(body); } catch (ex) { setErr(ex.message); setBusy(false); }
  }
  return (
    <Modal title="Edit candidate details" onClose={onClose} wide>
      <form onSubmit={go}>
        <div className="ht-form-grid">
          {PROFILE_FIELDS.map(([k, label, type]) => (
            <label key={k} className={k === 'linkedinUrl' ? 'ht-span-2' : ''}>{label}
              <input type={type} step={type === 'number' ? 'any' : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required={k === 'name'} />
            </label>
          ))}
          <label>HR owner
            <select value={f.hrOwnerId} onChange={(e) => setF({ ...f, hrOwnerId: e.target.value })}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="ht-span-2">Notes
            <textarea rows={3} value={f.profileNotes} onChange={(e) => setF({ ...f, profileNotes: e.target.value })} />
          </label>
        </div>
        {err && <p className="hr-error">{err}</p>}
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-gold" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

export function NextActionModal({ candidate, onClose, onSubmit }) {
  const [text, setText] = useState(candidate.nextAction || '');
  const [due, setDue] = useState(candidate.nextActionDue ? toLocalInput(candidate.nextActionDue).slice(0, 10) : '');
  const [owner, setOwner] = useState(candidate.nextActionOwner || '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Update next action" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try { await onSubmit({ nextAction: text, nextActionDue: due ? new Date(`${due}T18:00:00`).toISOString() : null, nextActionOwner: owner }); } finally { setBusy(false); }
      }}
      >
        <p className="hr-muted">Visible to everyone with Hiring Tracker access, including HR.</p>
        <div className="hr-form-row"><label>Next action</label><input value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div className="hr-form-row"><label>Due date</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div className="hr-form-row"><label>Owner</label><input value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-gold" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
