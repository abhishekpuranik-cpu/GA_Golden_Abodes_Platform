import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { hiringApi } from '../../lib/hiringApi.js';
import { formatINR } from '../../lib/hiring/formatINR.js';
import CandidateProfileView from '../../components/hiring/CandidateProfileView.jsx';
import VerdictButtons from '../../components/hiring/VerdictButtons.jsx';
import MoneyInput from '../../components/hiring/MoneyInput.jsx';

export default function CandidateProfile() {
  const { id: reqId, cid } = useParams();
  const outlet = useOutletContext() || {};
  const canWrite = !!outlet.canWrite;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [offerForm, setOfferForm] = useState({ fixedCtcPaise: null, designationOffered: '' });
  const [interviewForm, setInterviewForm] = useState({ round: 1, panel: '', scheduledAt: '' });

  function load() {
    setLoadError('');
    hiringApi.getCandidate(cid)
      .then(setData)
      .catch((e) => {
        setLoadError(e.message || 'Failed to load candidate');
        setData(null);
      });
  }

  useEffect(() => { load(); }, [cid]);

  if (loadError) {
    return (
      <>
        <p><Link to={`/app/hiring/req/${reqId}`}>← Back</Link></p>
        <p className="hr-error">{loadError}</p>
        <button type="button" className="hr-btn" onClick={load}>Retry</button>
      </>
    );
  }

  if (!data) return <p className="hr-muted">Loading…</p>;

  const candidate = data.candidate || {};
  const requisition = data.requisition || null;
  const interviews = data.interviews || [];
  const offer = data.offer || null;
  const profile = data.profile || candidate.profileSnapshot || null;

  async function refreshProfile() {
    setProfileBusy(true);
    setMsg('');
    try {
      await hiringApi.refreshCandidateProfile(cid);
      load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function advanceStage(delta) {
    const to = Number(candidate.currentStageNumber) + delta;
    if (to < 1 || to > 9) return;
    try {
      await hiringApi.updateStage(cid, { toStage: to });
      setNote('');
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function rejectOrDrop(stage) {
    try {
      await hiringApi.updateStage(cid, { toStage: stage });
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function submitFeedback(verdict) {
    try {
      await hiringApi.addFeedback(cid, { verdict, note });
      setNote('');
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function createOffer(e) {
    e.preventDefault();
    try {
      await hiringApi.createOffer({
        candidateId: cid,
        fixedCtcPaise: offerForm.fixedCtcPaise,
        designationOffered: offerForm.designationOffered
      });
      load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function updateOfferStatus(status) {
    if (!offer) return;
    try {
      await hiringApi.updateOffer(offer._id, { status });
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function scheduleInterview(e) {
    e.preventDefault();
    try {
      await hiringApi.scheduleInterview({
        candidateId: cid,
        round: interviewForm.round,
        panel: interviewForm.panel.split(',').map((s) => s.trim()).filter(Boolean),
        scheduledAt: interviewForm.scheduledAt || null
      });
      load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <>
      <p><Link to={`/app/hiring/req/${reqId}`}>← {requisition?.reqCode || 'Requisition'}</Link></p>

      {canWrite && candidate.metaviewCandidateId && (
        <div className="hr-toolbar" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="hr-btn hr-btn-outline hr-btn-sm" disabled={profileBusy} onClick={refreshProfile}>
            {profileBusy ? 'Refreshing…' : 'Refresh Metaview profile'}
          </button>
          {candidate.linkedinUrl && (
            <a className="hr-btn hr-btn-outline hr-btn-sm" href={candidate.linkedinUrl} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
          )}
        </div>
      )}

      <CandidateProfileView candidate={candidate} profile={profile} requisition={requisition} />

      {msg && <p className="hr-error">{msg}</p>}

      {canWrite && (
        <div className="hr-card">
          <h2>Actions</h2>
          <div className="hr-form-row">
            <label>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Screening note…" />
          </div>
          <VerdictButtons onSelect={submitFeedback} />
          <div className="hr-toolbar" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="hr-btn hr-btn-sm" onClick={() => advanceStage(1)}>Advance stage</button>
            <button type="button" className="hr-btn hr-btn-sm hr-btn-outline" onClick={() => rejectOrDrop(8)}>Reject</button>
            <button type="button" className="hr-btn hr-btn-sm hr-btn-outline" onClick={() => rejectOrDrop(9)}>Dropped</button>
          </div>
        </div>
      )}

      <div className="hr-card">
        <h2>Feedback history</h2>
        {(candidate.feedbackHistory || []).length === 0 ? (
          <p className="hr-muted">No feedback yet.</p>
        ) : (
          [...(candidate.feedbackHistory || [])].reverse().map((f, i) => (
            <div key={i} className="hr-feedback-item">
              <strong>{f.verdict}</strong> · {f.note || '—'}
              {!f.syncedToMetaview && <span className="hr-muted"> (pending Metaview sync)</span>}
            </div>
          ))
        )}
      </div>

      <div className="hr-card">
        <h2>Interviews</h2>
        {interviews.map((iv) => (
          <div key={iv._id} className="hr-feedback-item">
            Round {iv.round} · {iv.outcome} · {iv.scheduledAt ? new Date(iv.scheduledAt).toLocaleString('en-IN') : 'TBD'}
            {iv.panel?.length > 0 && <span className="hr-muted"> — {iv.panel.join(', ')}</span>}
          </div>
        ))}
        {canWrite && (
          <form onSubmit={scheduleInterview} style={{ marginTop: '1rem' }}>
            <div className="hr-form-row">
              <label>Round</label>
              <input type="number" min={1} value={interviewForm.round} onChange={(e) => setInterviewForm({ ...interviewForm, round: Number(e.target.value) })} />
            </div>
            <div className="hr-form-row">
              <label>Panel (comma-separated)</label>
              <input value={interviewForm.panel} onChange={(e) => setInterviewForm({ ...interviewForm, panel: e.target.value })} />
            </div>
            <div className="hr-form-row">
              <label>Scheduled at</label>
              <input type="datetime-local" value={interviewForm.scheduledAt} onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })} />
            </div>
            <button type="submit" className="hr-btn hr-btn-sm">Schedule</button>
          </form>
        )}
      </div>

      <div className="hr-card">
        <h2>Offer</h2>
        {offer ? (
          <>
            <p>{formatINR(offer.fixedCtcPaise)} · {offer.designationOffered || '—'} · <strong>{offer.status}</strong></p>
            {canWrite && (
              <div className="hr-toolbar">
                {offer.status === 'Draft' && (
                  <button type="button" className="hr-btn hr-btn-sm" onClick={() => updateOfferStatus('Sent')}>Mark Sent</button>
                )}
                {offer.status === 'Sent' && (
                  <>
                    <button type="button" className="hr-btn hr-btn-sm hr-btn-gold" onClick={() => updateOfferStatus('Accepted')}>Accepted</button>
                    <button type="button" className="hr-btn hr-btn-sm hr-btn-outline" onClick={() => updateOfferStatus('Declined')}>Declined</button>
                  </>
                )}
              </div>
            )}
          </>
        ) : canWrite ? (
          <form onSubmit={createOffer}>
            <MoneyInput
              label="Fixed CTC (₹/year)"
              valuePaise={offerForm.fixedCtcPaise}
              onChangePaise={(v) => setOfferForm({ ...offerForm, fixedCtcPaise: v })}
            />
            <div className="hr-form-row">
              <label>Designation</label>
              <input value={offerForm.designationOffered} onChange={(e) => setOfferForm({ ...offerForm, designationOffered: e.target.value })} />
            </div>
            <button type="submit" className="hr-btn">Create draft offer</button>
          </form>
        ) : (
          <p className="hr-muted">No offer yet.</p>
        )}
      </div>
    </>
  );
}
