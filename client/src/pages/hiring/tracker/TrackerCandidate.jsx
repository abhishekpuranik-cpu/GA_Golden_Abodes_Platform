import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { trackerApi } from '../../../lib/hiring/trackerApi.js';
import {
  STAGES, STAGE_LABEL, STATUS_LABEL, REC_LABEL, ROUND_STATUS_LABEL, REASON_LABEL, MODE_LABEL,
  fmtDate, daysSince, isOverdue, scoreTone
} from '../../../lib/hiring/trackerLabels.js';
import EvaluationForm from './EvaluationForm.jsx';
import {
  StatusModal, ReasonModal, MoveStageModal, ScheduleModal, DecisionModal, EditProfileModal, NextActionModal
} from './TrackerModals.jsx';

function Stepper({ c }) {
  const idx = STAGES.indexOf(c.stage);
  return (
    <ol className="ht-stepper">
      {STAGES.map((s, i) => {
        const optional = s === 'MGMT_R2' && !c.r2Required;
        const state = i < idx ? 'done' : i === idx ? 'current' : 'todo';
        return (
          <li key={s} className={`is-${state} ${optional ? 'is-optional' : ''} ${i === idx && c.status !== 'ACTIVE' ? `is-${c.status.toLowerCase()}` : ''}`}>
            <span className="ht-step-dot">{state === 'done' && !optional ? '✓' : i + 1}</span>
            <span className="ht-step-label">{STAGE_LABEL[s]}{optional ? ' (optional)' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ id, title, meta, open, onToggle, children }) {
  return (
    <section id={id} className={`ht-section ${open ? 'is-open' : ''}`}>
      <button type="button" className="ht-section-head" onClick={onToggle} aria-expanded={open}>
        <span className="ht-section-title">{title}</span>
        <span className="ht-section-meta">{meta}</span>
        <span className="ht-chevron" aria-hidden>{open ? '–' : '+'}</span>
      </button>
      {open && <div className="ht-section-body">{children}</div>}
    </section>
  );
}

function RoundOps({ r, evalStatus, label }) {
  return (
    <div className="ht-ops">
      <div><span>Interview</span><b>{ROUND_STATUS_LABEL[r?.status] || '—'}</b></div>
      <div><span>Scheduled</span><b>{fmtDate(r?.scheduledAt, true)}</b></div>
      <div><span>Interviewer</span><b>{r?.interviewerName || '—'}</b></div>
      <div><span>Mode</span><b>{MODE_LABEL[r?.mode] || '—'}</b></div>
      <div><span>Evaluation</span><b>{evalStatus === 'SUBMITTED' ? 'Completed' : evalStatus === 'DRAFT' ? 'In progress' : 'Not started'}</b></div>
      {r?.rescheduleCount > 0 && <div><span>Rescheduled</span><b>{r.rescheduleCount}×</b></div>}
      {r?.noShowCount > 0 && <div><span>No-shows</span><b>{r.noShowCount}</b></div>}
      {r?.venue && <div className="ht-ops-wide"><span>Venue</span><b>{r.venue}</b></div>}
      <p className="ht-ops-note">{label}</p>
    </div>
  );
}

const HISTORY_ICON = { CREATED: '＋', STAGE: '→', STATUS: '●', SCHEDULE: '◷', EVAL: '✎', DECISION: '★', ASSIGN: '👤', NOTE: '•' };

export default function TrackerCandidate() {
  const { id } = useParams();
  const { caps, users, positions, user } = useOutletContext();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [open, setOpen] = useState({});
  const [toast, setToast] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(() => {
    trackerApi.candidate(id)
      .then((d) => {
        setData(d);
        setOpen((o) => (Object.keys(o).length ? o : { [defaultSection(d.candidate)]: true }));
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };
  const setCand = (candidate) => setData((d) => ({ ...d, candidate: { ...candidate, history: candidate.history || d.candidate.history } }));
  const run = async (fn, msg) => {
    const r = await fn();
    if (r?.candidate) setCand(r.candidate);
    setModal(null);
    if (msg) flash(msg);
    return r;
  };

  if (err) return <div className="ht-empty-card"><h2>Candidate unavailable</h2><p className="hr-muted">{err}</p><Link to="/app/hiring/tracker">← Back to pipeline</Link></div>;
  if (!data) return <p className="hr-muted">Loading candidate…</p>;

  const c = data.candidate;
  const position = data.position || positions.find((p) => p._id === c.positionId);
  const inHr = ['SHORTLISTED', 'HR_SCREENING'].includes(c.stage);
  const canHoldReject = inHr ? caps.hr : caps.mgmt;
  const closed = ['REJECTED', 'WITHDRAWN', 'SELECTED'].includes(c.status);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const scrollTo = (k) => {
    setOpen((o) => ({ ...o, [k]: true }));
    setTimeout(() => document.getElementById(`sec-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const r1Assigned = c.r1?.interviewerId;
  const canEditR1 = caps.mgmt && (!r1Assigned || r1Assigned === user?.id || caps.decide);
  const r2Assigned = c.r2?.interviewerId;
  const canEditR2 = caps.mgmt && (!r2Assigned || r2Assigned === user?.id || caps.decide);

  const transition = (body, msg) => run(() => trackerApi.transition(c._id, body), msg);

  async function advance() {
    try {
      await transition({ action: 'ADVANCE' }, 'Moved to next stage');
    } catch (e) {
      if (e.data?.gate && caps.override) setModal({ type: 'override-advance', reason: e.data.gate });
      else if (e.data?.gate && caps.mgmt && c.hr?.recommendation === 'HOLD') setModal({ type: 'pull' });
      else flash(e.message);
    }
  }

  /* ---------- Primary action, by stage ---------- */
  let primary = null;
  if (c.status === 'ACTIVE') {
    if (c.stage === 'SHORTLISTED' && caps.hr) {
      primary = <button type="button" className="hr-btn hr-btn-gold" onClick={() => transition({ action: 'START_HR' }, 'HR screening started').then(() => scrollTo('hr'))}>Start HR screening</button>;
    } else if (c.stage === 'HR_SCREENING') {
      if (c.hr?.status === 'SUBMITTED' && c.hr.recommendation === 'HOLD' && caps.mgmt) {
        primary = <button type="button" className="hr-btn hr-btn-gold" onClick={() => setModal({ type: 'pull' })}>Pull into 1st round</button>;
      } else if (c.hr?.status === 'SUBMITTED' && c.hr.recommendation === 'NOT_RECOMMENDED' && caps.hr) {
        primary = <button type="button" className="hr-btn ht-btn-danger" onClick={() => setModal({ type: 'status', action: 'REJECT' })}>Confirm rejection</button>;
      } else if (caps.hr) {
        primary = <button type="button" className="hr-btn hr-btn-gold" onClick={() => scrollTo('hr')}>{c.hr?.status === 'DRAFT' ? 'Continue HR screening' : 'Open HR screening'}</button>;
      }
    } else if (c.stage === 'MGMT_R1' || c.stage === 'MGMT_R2') {
      const round = c.stage === 'MGMT_R1' ? '1' : '2';
      const r = round === '1' ? c.r1 : c.r2;
      if (caps.mgmt && r?.status === 'SCHEDULED') {
        primary = <button type="button" className="hr-btn hr-btn-gold" onClick={() => scrollTo(`r${round}`)}>Open {round === '1' ? '1st' : '2nd'} round evaluation</button>;
      } else {
        primary = <button type="button" className="hr-btn hr-btn-gold" onClick={() => setModal({ type: 'schedule', round })}>{r?.scheduledAt ? 'Reschedule' : 'Schedule'} {round === '1' ? '1st' : '2nd'} round</button>;
      }
    } else if (c.stage === 'DECISION' && caps.decide) {
      primary = <button type="button" className="hr-btn hr-btn-gold" onClick={() => setModal({ type: 'decision' })}>Record final decision</button>;
    }
  } else if (c.status === 'ON_HOLD' && canHoldReject) {
    primary = <button type="button" className="hr-btn hr-btn-gold" onClick={() => setModal({ type: 'resume' })}>Resume candidate</button>;
  } else if (closed && caps.override) {
    primary = <button type="button" className="hr-btn hr-btn-outline" onClick={() => setModal({ type: 'reopen' })}>Reopen</button>;
  }

  const overdue = isOverdue(c);
  const hrMeta = c.hr?.status === 'SUBMITTED'
    ? <><span className={`ht-score ht-score-${scoreTone(c.hr.score)}`}>{c.hr.score?.toFixed(2)}</span> {REC_LABEL[c.hr.recommendation]}</>
    : c.hr?.status === 'DRAFT' ? 'In progress' : 'Not started';
  const r1Meta = c.r1EvalStatus === 'SUBMITTED' ? 'Completed' : ROUND_STATUS_LABEL[c.r1?.status];
  const r2Meta = !c.r2Required ? 'Not required' : c.r2EvalStatus === 'SUBMITTED' ? 'Completed' : ROUND_STATUS_LABEL[c.r2?.status];
  const decisionMeta = c.decision?.outcome ? STATUS_LABEL[c.decision.outcome] || c.decision.outcome : c.stage === 'DECISION' ? 'Awaiting decision' : 'Pending';

  return (
    <div className="ht-cand">
      <Link to="/app/hiring/tracker" className="ht-back">← Pipeline</Link>

      <header className="ht-cand-head">
        <div className="ht-cand-id">
          <h1>{c.name}</h1>
          <p className="ht-cand-pos">
            {position?.title || '—'}
            <span className={`ht-status ht-status-${c.status.toLowerCase()}`}>{STATUS_LABEL[c.status]}</span>
            {c.statusReasonCode && <span className="ht-chip">{REASON_LABEL[c.statusReasonCode]}</span>}
            {caps.mgmt && c.overrideCount > 0 && <span className="ht-chip ht-chip-warn">Overridden ×{c.overrideCount}</span>}
          </p>
          <div className="ht-contact">
            {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn ↗</a>}
          </div>
        </div>
        <div className="ht-cand-actions">
          {primary}
          {c.resume?.fileId
            ? <a className="hr-btn hr-btn-outline" href={trackerApi.resumeUrl(c._id)} target="_blank" rel="noreferrer">View resume</a>
            : null}
          <button type="button" className="hr-btn hr-btn-outline" onClick={() => fileRef.current?.click()}>
            {c.resume?.fileId ? 'Replace resume' : 'Upload resume'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try { await run(() => trackerApi.uploadResume(c._id, f), 'Resume uploaded'); } catch (ex) { flash(ex.message); }
            }}
          />
        </div>
      </header>

      <Stepper c={c} />

      <div className="ht-cand-grid">
        <div className="ht-cand-main">
          <Section id="sec-profile" title="Candidate profile" meta={[c.currentDesignation, c.currentCompany].filter(Boolean).join(' · ')} open={open.profile} onToggle={() => toggle('profile')}>
            <div className="ht-facts">
              <div><span>Current company</span><b>{c.currentCompany || '—'}</b></div>
              <div><span>Designation</span><b>{c.currentDesignation || '—'}</b></div>
              <div><span>Experience</span><b>{c.totalExperienceYears != null ? `${c.totalExperienceYears} yrs` : '—'}</b></div>
              <div><span>Location</span><b>{c.location || '—'}</b></div>
              <div><span>Current CTC</span><b>{c.currentCtcLakh != null ? `₹${c.currentCtcLakh} L` : '—'}</b></div>
              <div><span>Expected CTC</span><b>{c.expectedCtcLakh != null ? `₹${c.expectedCtcLakh} L` : '—'}</b></div>
              <div><span>Notice period</span><b>{c.noticePeriodDays != null ? `${c.noticePeriodDays} days` : '—'}</b></div>
              <div><span>Source</span><b>{c.source || '—'}</b></div>
              <div><span>Resume</span><b>{c.resume?.fileId ? <a href={trackerApi.resumeUrl(c._id)} target="_blank" rel="noreferrer">{c.resume.name}</a> : '—'}</b></div>
            </div>
            {c.profileNotes && <p className="ht-notes">{c.profileNotes}</p>}
            {position && (
              <details className="ht-jd">
                <summary>Role brief — {position.title}</summary>
                <p><b>Mandate:</b> {position.mandate}</p>
                <p><b>Experience:</b> {position.experience}</p>
                <p><b>Reports to:</b> {position.reportsTo}</p>
                {position.kpis?.length > 0 && <p><b>KPIs:</b> {position.kpis.join(' · ')}</p>}
                {position.knockouts?.length > 0 && <p className="ht-knockout"><b>Knockout profiles:</b> {position.knockouts.join(' · ')}</p>}
              </details>
            )}
            <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'edit' })}>Edit details</button>
          </Section>

          <Section id="sec-hr" title="Initial screening (HR)" meta={hrMeta} open={open.hr} onToggle={() => toggle('hr')}>
            {c.stage === 'SHORTLISTED' && c.hr?.status === 'NOT_STARTED' && (
              <p className="hr-muted">Scoring the first question starts the screening automatically.</p>
            )}
            <div className="ht-inline-ops">
              <span>Screening call: <b>{fmtDate(c.hr?.scheduledAt, true)}</b></span>
              {caps.hr && !closed && <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'schedule', round: 'HR' })}>{c.hr?.scheduledAt ? 'Reschedule' : 'Schedule call'}</button>}
            </div>
            <EvaluationForm
              kind="HR"
              fetchEval={() => trackerApi.hrEval(c._id)}
              saveEval={(body) => trackerApi.saveHrEval(c._id, body)}
              canEdit={caps.hr && c.status === 'ACTIVE' && (inHr || caps.override)}
              lockedReason={c.status !== 'ACTIVE' ? 'Resume the candidate to edit the screening.' : !inHr ? 'Locked — candidate has moved to management rounds.' : ''}
              onSaved={(cand, submitted) => { if (cand) setCand(cand); if (submitted) { flash('HR screening submitted'); load(); } }}
            />
          </Section>

          <Section id="sec-r1" title="1st round interview (Management)" meta={r1Meta} open={open.r1} onToggle={() => toggle('r1')}>
            <RoundOps r={c.r1} evalStatus={c.r1EvalStatus} label={caps.mgmt ? '' : 'Evaluation details are visible to management only. HR coordinates scheduling.'} />
            {!closed && STAGES.indexOf(c.stage) >= STAGES.indexOf('MGMT_R1') && (
              <div className="ht-inline-ops">
                <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'schedule', round: '1' })}>{c.r1?.scheduledAt ? 'Reschedule / change interviewer' : 'Schedule interview'}</button>
                {c.r1?.status === 'SCHEDULED' && c.r1EvalStatus !== 'SUBMITTED' && (
                  <button type="button" className="ht-link-btn" onClick={() => run(() => trackerApi.schedule(c._id, { round: '1', status: 'NO_SHOW' }), 'No-show recorded').catch((e) => flash(e.message))}>Mark no-show</button>
                )}
              </div>
            )}
            {caps.mgmt && STAGES.indexOf(c.stage) >= STAGES.indexOf('MGMT_R1') && (
              <EvaluationForm
                key={`r1-${c.stage}`}
                kind="R1"
                fetchEval={() => trackerApi.mgmtEval(c._id, 1)}
                saveEval={(body) => trackerApi.saveMgmtEval(c._id, 1, body)}
                canEdit={canEditR1 && c.status === 'ACTIVE' && (c.stage === 'MGMT_R1' || caps.override)}
                lockedReason={!canEditR1 ? `Assigned to ${c.r1?.interviewerName}. Only they or a decision-maker can edit.` : c.status !== 'ACTIVE' ? 'Resume the candidate to edit.' : c.stage !== 'MGMT_R1' ? 'Locked — candidate has moved on.' : ''}
                onSaved={(cand, submitted) => { if (cand) setCand(cand); if (submitted) { flash('1st round evaluation submitted'); load(); } }}
              />
            )}
            {caps.mgmt && STAGES.indexOf(c.stage) < STAGES.indexOf('MGMT_R1') && <p className="hr-muted">Opens once the candidate clears HR screening.</p>}
          </Section>

          <Section id="sec-r2" title="2nd round interview (Optional)" meta={r2Meta} open={open.r2} onToggle={() => toggle('r2')}>
            {!c.r2Required ? (
              <>
                <p className="hr-muted">Not required. Management can request a 2nd round when needed — it does not block the final decision.</p>
                {caps.mgmt && ['MGMT_R1', 'DECISION'].includes(c.stage) && c.status === 'ACTIVE' && (
                  <button type="button" className="hr-btn hr-btn-outline hr-btn-sm" onClick={() => run(() => trackerApi.setSecondRound(c._id, true), '2nd round requested').then(load).catch((e) => flash(e.message))}>Request 2nd round</button>
                )}
              </>
            ) : (
              <>
                <RoundOps r={c.r2} evalStatus={c.r2EvalStatus} label={caps.mgmt ? '' : 'Evaluation details are visible to management only.'} />
                {!closed && (
                  <div className="ht-inline-ops">
                    <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'schedule', round: '2' })}>{c.r2?.scheduledAt ? 'Reschedule / change interviewer' : 'Schedule interview'}</button>
                    {c.r2?.status === 'SCHEDULED' && c.r2EvalStatus !== 'SUBMITTED' && (
                      <button type="button" className="ht-link-btn" onClick={() => run(() => trackerApi.schedule(c._id, { round: '2', status: 'NO_SHOW' }), 'No-show recorded').catch((e) => flash(e.message))}>Mark no-show</button>
                    )}
                    {caps.mgmt && c.r2EvalStatus === 'NOT_STARTED' && c.status === 'ACTIVE' && (
                      <button type="button" className="ht-link-btn" onClick={() => run(() => trackerApi.setSecondRound(c._id, false), '2nd round cancelled').then(load).catch((e) => flash(e.message))}>Not needed after all</button>
                    )}
                  </div>
                )}
                {caps.mgmt && STAGES.indexOf(c.stage) >= STAGES.indexOf('MGMT_R2') && (
                  <EvaluationForm
                    key={`r2-${c.stage}`}
                    kind="R2"
                    fetchEval={() => trackerApi.mgmtEval(c._id, 2)}
                    saveEval={(body) => trackerApi.saveMgmtEval(c._id, 2, body)}
                    canEdit={canEditR2 && c.status === 'ACTIVE' && (c.stage === 'MGMT_R2' || caps.override)}
                    lockedReason={!canEditR2 ? `Assigned to ${c.r2?.interviewerName}.` : c.stage !== 'MGMT_R2' ? 'Locked — candidate has moved on.' : ''}
                    onSaved={(cand, submitted) => { if (cand) setCand(cand); if (submitted) { flash('2nd round evaluation submitted'); load(); } }}
                  />
                )}
              </>
            )}
          </Section>

          <Section id="sec-decision" title="Hiring decision" meta={decisionMeta} open={open.decision} onToggle={() => toggle('decision')}>
            {c.decision?.outcome ? (
              <div className="ht-facts">
                <div><span>Outcome</span><b className={`ht-status ht-status-${c.decision.outcome.toLowerCase()}`}>{STATUS_LABEL[c.decision.outcome]}</b></div>
                <div><span>Decided by</span><b>{c.decision.byName || '—'}</b></div>
                <div><span>Date</span><b>{fmtDate(c.decision.at, true)}</b></div>
                {caps.mgmt && <div className="ht-ops-wide"><span>Remarks</span><b>{c.decision.remarks || '—'}</b></div>}
              </div>
            ) : (
              <p className="hr-muted">
                {c.stage === 'DECISION' ? 'All required rounds are complete — awaiting the final decision.' : 'Available after the management round(s).'}
              </p>
            )}
            {caps.decide && !closed && (
              <button type="button" className="hr-btn hr-btn-sm" onClick={() => setModal({ type: 'decision', override: c.stage !== 'DECISION' })}>
                {c.stage === 'DECISION' ? 'Record decision' : 'Record decision (override)'}
              </button>
            )}
          </Section>
        </div>

        <aside className="ht-cand-side">
          <div className={`ht-side-card ht-next ${overdue ? 'is-overdue' : ''}`}>
            <h3>Next action</h3>
            <p className="ht-next-text">{c.nextAction || 'No pending action'}</p>
            <p className="ht-side-meta">
              {c.nextActionDue ? `${overdue ? 'Overdue — was due' : 'Due'} ${fmtDate(c.nextActionDue)}` : ''}
              {c.nextActionOwner ? ` · ${c.nextActionOwner}` : ''}
            </p>
            <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'next' })}>Update</button>
          </div>

          <div className="ht-side-card">
            <h3>Status</h3>
            <dl className="ht-dl">
              <dt>Stage</dt><dd>{STAGE_LABEL[c.stage]} · {daysSince(c.stageEnteredAt)}d</dd>
              <dt>HR owner</dt><dd>{c.hrOwnerName || '—'}</dd>
              <dt>1st round</dt><dd>{c.r1?.interviewerName || '—'}</dd>
              {c.r2Required && <><dt>2nd round</dt><dd>{c.r2?.interviewerName || '—'}</dd></>}
              <dt>Added</dt><dd>{fmtDate(c.createdAt)}</dd>
              {c.statusReason && <><dt>Note</dt><dd>{c.statusReason}</dd></>}
            </dl>
            <div className="ht-side-links">
              {c.status === 'ACTIVE' && canHoldReject && <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'status', action: 'HOLD' })}>Put on hold</button>}
              {c.status === 'ACTIVE' && canHoldReject && STAGES.indexOf(c.stage) < STAGES.indexOf('DECISION') && (
                <button type="button" className="ht-link-btn" onClick={advance}>Move to next stage</button>
              )}
              {['ACTIVE', 'ON_HOLD'].includes(c.status) && canHoldReject && <button type="button" className="ht-link-btn ht-danger" onClick={() => setModal({ type: 'status', action: 'REJECT' })}>Reject</button>}
              {['ACTIVE', 'ON_HOLD', 'SELECTED'].includes(c.status) && <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'status', action: 'WITHDRAW' })}>Candidate withdrew</button>}
              {caps.override && !closed && <button type="button" className="ht-link-btn" onClick={() => setModal({ type: 'move' })}>Override stage…</button>}
            </div>
          </div>

          <div className="ht-side-card">
            <h3>Hiring journey</h3>
            <ol className="ht-timeline">
              {[...(c.history || [])].reverse().map((h) => (
                <li key={h._id} className={h.override ? 'is-override' : ''}>
                  <span className="ht-tl-icon" aria-hidden>{HISTORY_ICON[h.type] || '•'}</span>
                  <div>
                    <p>
                      {h.summary}
                      {h.reasonCode && <em> — {REASON_LABEL[h.reasonCode]}</em>}
                      {h.override && <span className="ht-chip ht-chip-warn">Override</span>}
                    </p>
                    {h.note && <p className="ht-tl-note">{h.note}</p>}
                    <time>{fmtDate(h.at, true)} · {h.byName}</time>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {toast && <div className="ht-toast" role="status">{toast}</div>}

      {modal?.type === 'status' && (
        <StatusModal
          action={modal.action}
          confidentialNote={!inHr && modal.action !== 'WITHDRAW'}
          onClose={() => setModal(null)}
          onSubmit={(body) => transition(body, 'Status updated').then(load)}
        />
      )}
      {modal?.type === 'resume' && (
        <ReasonModal title="Resume candidate" label="Note *" cta="Resume" onClose={() => setModal(null)} onSubmit={(reason) => transition({ action: 'RESUME', reason }, 'Candidate resumed').then(load)} />
      )}
      {modal?.type === 'reopen' && (
        <ReasonModal title="Reopen candidate" label="Why is this candidate being reopened? *" cta="Reopen" onClose={() => setModal(null)} onSubmit={(reason) => transition({ action: 'REOPEN', reason }, 'Candidate reopened').then(load)} />
      )}
      {modal?.type === 'pull' && (
        <ReasonModal title="Pull into 1st round" label="Why proceed despite HR hold? *" cta="Move to 1st round" onClose={() => setModal(null)} onSubmit={(reason) => transition({ action: 'ADVANCE', reason }, 'Moved to 1st round').then(load)} />
      )}
      {modal?.type === 'override-advance' && (
        <ReasonModal
          title="Override stage requirement"
          label="Override reason (audited) *"
          cta="Override and move"
          onClose={() => setModal(null)}
          onSubmit={(reason) => transition({ action: 'ADVANCE', override: true, reason }, 'Moved with override').then(load)}
        >
          <div className="ht-alert ht-alert-warn">{modal.reason}</div>
        </ReasonModal>
      )}
      {modal?.type === 'move' && (
        <MoveStageModal current={c.stage} onClose={() => setModal(null)} onSubmit={(body) => transition(body, 'Stage overridden').then(load)} />
      )}
      {modal?.type === 'schedule' && (
        <ScheduleModal
          round={modal.round}
          current={modal.round === 'HR' ? { scheduledAt: c.hr?.scheduledAt } : modal.round === '1' ? c.r1 : c.r2}
          users={users}
          onClose={() => setModal(null)}
          onSubmit={(body) => run(() => trackerApi.schedule(c._id, body), 'Schedule saved').then(load)}
        />
      )}
      {modal?.type === 'decision' && (
        <DecisionModal candidate={c} needsOverride={c.stage !== 'DECISION'} onClose={() => setModal(null)} onSubmit={(body) => run(() => trackerApi.decide(c._id, body), 'Decision recorded').then(load)} />
      )}
      {modal?.type === 'edit' && (
        <EditProfileModal candidate={c} users={users} onClose={() => setModal(null)} onSubmit={(body) => run(() => trackerApi.updateCandidate(c._id, body), 'Details saved').then(load)} />
      )}
      {modal?.type === 'next' && (
        <NextActionModal candidate={c} onClose={() => setModal(null)} onSubmit={(body) => run(() => trackerApi.updateCandidate(c._id, body), 'Next action updated')} />
      )}
    </div>
  );
}

function defaultSection(c) {
  if (['SHORTLISTED', 'HR_SCREENING'].includes(c.stage)) return 'hr';
  if (c.stage === 'MGMT_R1') return 'r1';
  if (c.stage === 'MGMT_R2') return 'r2';
  if (c.stage === 'DECISION') return 'decision';
  return 'profile';
}
