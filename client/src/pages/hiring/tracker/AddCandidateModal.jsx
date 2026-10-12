import { useState } from 'react';
import { Link } from 'react-router-dom';
import { trackerApi } from '../../../lib/hiring/trackerApi.js';

const EMPTY = {
  positionId: '', name: '', phone: '', email: '', currentCompany: '', currentDesignation: '',
  totalExperienceYears: '', location: '', currentCtcLakh: '', expectedCtcLakh: '', noticePeriodDays: '',
  source: '', linkedinUrl: '', hrOwnerId: '', r1InterviewerId: '', profileNotes: ''
};

const SOURCES = ['Naukri', 'LinkedIn', 'Referral', 'Agency', 'Metaview', 'Walk-in', 'Internal', 'Other'];

export default function AddCandidateModal({ positions, users, defaultPositionId, currentUserId, onClose, onCreated }) {
  const [f, setF] = useState({ ...EMPTY, positionId: defaultPositionId || '', hrOwnerId: currentUserId || '' });
  const [resume, setResume] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dup, setDup] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const interviewers = users.filter((u) => u.mgmt);

  async function submit(e, allowDuplicate = false) {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const hr = users.find((u) => u.id === f.hrOwnerId);
      const iv = users.find((u) => u.id === f.r1InterviewerId);
      const { candidate } = await trackerApi.createCandidate({
        ...f,
        hrOwnerName: hr?.name || '',
        r1InterviewerName: iv?.name || '',
        allowDuplicate
      });
      if (resume) {
        try { await trackerApi.uploadResume(candidate._id, resume); } catch (ue) { setErr(`Candidate added, but resume upload failed: ${ue.message}`); }
      }
      onCreated(candidate);
    } catch (ex) {
      if (ex.status === 409 && ex.data?.duplicateId) setDup({ id: ex.data.duplicateId, message: ex.message });
      else setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hr-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="hr-modal ht-modal-wide" onSubmit={submit}>
        <div className="ht-modal-head">
          <h2>Add shortlisted candidate</h2>
          <button type="button" className="ht-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ht-form-grid">
          <label className="ht-span-2">Position *
            <select required value={f.positionId} onChange={set('positionId')}>
              <option value="">Select position…</option>
              {positions.filter((p) => p.isActive).map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
            </select>
          </label>
          <label className="ht-span-2">Full name *
            <input required value={f.name} onChange={set('name')} autoFocus />
          </label>
          <label>Phone
            <input value={f.phone} onChange={set('phone')} inputMode="tel" />
          </label>
          <label>Email
            <input type="email" value={f.email} onChange={set('email')} />
          </label>
          <label>Current company
            <input value={f.currentCompany} onChange={set('currentCompany')} />
          </label>
          <label>Current designation
            <input value={f.currentDesignation} onChange={set('currentDesignation')} />
          </label>
          <label>Total experience (yrs)
            <input type="number" min="0" step="0.5" value={f.totalExperienceYears} onChange={set('totalExperienceYears')} />
          </label>
          <label>Current location
            <input value={f.location} onChange={set('location')} />
          </label>
          <label>Current CTC (₹ lakh p.a.)
            <input type="number" min="0" step="0.1" value={f.currentCtcLakh} onChange={set('currentCtcLakh')} />
          </label>
          <label>Expected CTC (₹ lakh p.a.)
            <input type="number" min="0" step="0.1" value={f.expectedCtcLakh} onChange={set('expectedCtcLakh')} />
          </label>
          <label>Notice period (days)
            <input type="number" min="0" value={f.noticePeriodDays} onChange={set('noticePeriodDays')} />
          </label>
          <label>Source
            <select value={f.source} onChange={set('source')}>
              <option value="">—</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>HR owner
            <select value={f.hrOwnerId} onChange={set('hrOwnerId')}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label>1st round interviewer
            <select value={f.r1InterviewerId} onChange={set('r1InterviewerId')}>
              <option value="">Assign later</option>
              {interviewers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="ht-span-2">LinkedIn URL
            <input value={f.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://linkedin.com/in/…" />
          </label>
          <label className="ht-span-2">Resume (PDF / Word, max 5 MB)
            <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] || null)} />
          </label>
          <label className="ht-span-2">Notes
            <textarea rows={2} value={f.profileNotes} onChange={set('profileNotes')} placeholder="Why shortlisted, referral details…" />
          </label>
        </div>

        {dup && (
          <div className="ht-alert ht-alert-warn">
            {dup.message}. <Link to={`/app/hiring/tracker/c/${dup.id}`}>Open existing</Link>
            {' · '}
            <button type="button" className="ht-link-btn" onClick={(e) => submit(e, true)}>Add anyway</button>
          </div>
        )}
        {err && <p className="hr-error">{err}</p>}
        <p className="hr-muted" style={{ fontSize: '0.75rem' }}>Phone or email is required.</p>

        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-gold" disabled={busy}>{busy ? 'Adding…' : 'Add candidate'}</button>
        </div>
      </form>
    </div>
  );
}
