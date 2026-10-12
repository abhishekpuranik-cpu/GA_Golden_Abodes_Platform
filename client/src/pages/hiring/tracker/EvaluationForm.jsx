import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REC_LABEL, fmtDate, scoreTone } from '../../../lib/hiring/trackerLabels.js';

const LABELS = {
  HR: {
    response: 'Candidate response / HR notes',
    comment: 'HR evaluation comment',
    summary: 'Supporting comments for recommendation',
    submit: 'Submit HR screening'
  },
  MGMT: {
    response: 'Candidate response',
    comment: 'Interviewer remarks',
    summary: 'Final remarks',
    submit: 'Submit evaluation'
  }
};

const SCORE_HINT = { 1: 'Poor', 2: 'Below expectations', 3: 'Meets', 4: 'Strong', 5: 'Outstanding' };

export function weightedScore(answers) {
  let num = 0;
  let den = 0;
  let scored = 0;
  let required = 0;
  for (const a of answers) {
    const w = Number(a.weight) || 0;
    if (w <= 0) continue;
    required += 1;
    if (!a.score) continue;
    scored += 1;
    num += a.score * w;
    den += w;
  }
  const score = den ? Math.round((num / den) * 100) / 100 : null;
  return { score, scored, required, complete: required > 0 && scored === required };
}

function suggestion(score) {
  if (score == null) return '';
  if (score >= 3.5) return 'RECOMMENDED';
  if (score >= 2.5) return 'HOLD';
  return 'NOT_RECOMMENDED';
}

/**
 * kind: 'HR' | 'R1' | 'R2'
 * fetchEval(): Promise<{evaluation}>; saveEval(body): Promise<{evaluation, candidate}>
 */
export default function EvaluationForm({ kind, fetchEval, saveEval, canEdit, onSaved, lockedReason, candidateName, positionTitle }) {
  const L = LABELS[kind === 'HR' ? 'HR' : 'MGMT'];
  const isMgmt = kind !== 'HR';
  const [ev, setEv] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState({ busy: false, at: null, error: '' });
  const [openGuide, setOpenGuide] = useState({});
  const [missing, setMissing] = useState([]);
  const dirty = useRef(false);
  const timer = useRef(null);
  const inflight = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchEval()
      .then((d) => {
        if (!alive) return;
        setEv(d.evaluation);
        setEditing(d.evaluation.status !== 'SUBMITTED');
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const calc = useMemo(() => (ev ? weightedScore(ev.answers) : null), [ev]);
  const readOnly = !canEdit || !editing;

  const payload = useCallback((e, submit) => ({
    answers: e.answers.map((a) => ({ qid: a.qid, response: a.response, comment: a.comment, score: a.score, flagged: Boolean(a.flagged) })),
    recommendation: e.recommendation,
    summary: e.summary,
    ...(isMgmt ? { strengths: e.strengths, concerns: e.concerns } : {}),
    ...(kind === 'R1' ? { requiresSecondRound: e.requiresSecondRound } : {}),
    submit
  }), [isMgmt, kind]);

  const persist = useCallback(async (submit = false) => {
    if (!ev) return null;
    if (inflight.current) await inflight.current.catch(() => {});
    dirty.current = false;
    setSaveState((s) => ({ ...s, busy: true, error: '' }));
    const p = saveEval(payload(ev, submit));
    inflight.current = p;
    try {
      const d = await p;
      setSaveState({ busy: false, at: new Date(), error: '' });
      if (submit) {
        setEv(d.evaluation);
        setEditing(false);
      } else {
        setEv((cur) => ({ ...cur, status: d.evaluation.status, isNew: false }));
      }
      onSaved?.(d.candidate, submit);
      return d;
    } catch (e) {
      setSaveState({ busy: false, at: null, error: e.message });
      if (submit) throw e;
      return null;
    } finally {
      inflight.current = null;
    }
  }, [ev, payload, saveEval, onSaved]);

  useEffect(() => {
    if (!dirty.current || readOnly || ev?.status === 'SUBMITTED') return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { persist(false); }, 1800);
    return () => clearTimeout(timer.current);
  }, [ev, readOnly, persist]);

  const update = (patch) => { dirty.current = true; setEv((cur) => ({ ...cur, ...patch })); };
  const updateAnswer = (qid, patch) => {
    dirty.current = true;
    setEv((cur) => ({ ...cur, answers: cur.answers.map((a) => (a.qid === qid ? { ...a, ...patch } : a)) }));
    if (patch.score) setMissing((m) => m.filter((x) => x !== qid));
  };

  async function submit() {
    clearTimeout(timer.current);
    const miss = ev.answers.filter((a) => Number(a.weight) > 0 && !a.score).map((a) => a.qid);
    setMissing(miss);
    if (miss.length) {
      setSaveState((s) => ({ ...s, error: `Score all questions first — ${miss.length} remaining` }));
      document.getElementById(`q-${miss[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!ev.recommendation) {
      setSaveState((s) => ({ ...s, error: 'Choose a recommendation' }));
      return;
    }
    try { await persist(true); } catch { /* message already shown */ }
  }

  if (err) return <p className="hr-error">{err}</p>;
  if (!ev) return <p className="hr-muted">Loading questionnaire…</p>;
  if (!ev.answers?.length) return <p className="hr-muted">No questionnaire is configured for this round yet.</p>;

  const groups = [];
  ev.answers.forEach((a, i) => {
    const g = groups.find((x) => x.category === (a.category || 'General'));
    if (g) g.items.push({ a, i }); else groups.push({ category: a.category || 'General', items: [{ a, i }] });
  });
  const sugg = suggestion(calc.score);

  return (
    <div className="ht-eval">
      <div className="ht-eval-questions">
        {candidateName && (
          <p className="ht-eval-for">
            Answers recorded for <b>{candidateName}</b>{positionTitle ? ` · ${positionTitle}` : ''}
            {!isMgmt && <span> — flag (⚑) any answer the 1st-round interviewer should dig into.</span>}
          </p>
        )}
        {ev.status === 'SUBMITTED' && (
          <div className="ht-alert ht-alert-ok">
            Submitted by {ev.evaluatorName || '—'} on {fmtDate(ev.submittedAt, true)}.
            {canEdit && !editing && (
              <button type="button" className="ht-link-btn" onClick={() => setEditing(true)}>Edit evaluation</button>
            )}
          </div>
        )}
        {lockedReason && !canEdit && <div className="ht-alert">{lockedReason}</div>}

        {groups.map((g) => (
          <div key={g.category} className="ht-q-group">
            <h4>{g.category}</h4>
            {g.items.map(({ a, i }) => (
              <div
                key={a.qid}
                id={`q-${a.qid}`}
                className={`ht-q ${missing.includes(a.qid) ? 'is-missing' : ''}`}
                tabIndex={-1}
                onKeyDown={(e) => {
                  if (readOnly || e.target.tagName === 'TEXTAREA') return;
                  const n = Number(e.key);
                  if (n >= 1 && n <= 5) updateAnswer(a.qid, { score: n });
                }}
              >
                <div className="ht-q-head">
                  <span className="ht-q-num">Q{i + 1}</span>
                  <p>{a.text}</p>
                  <span className="ht-q-weight" title="Weightage">×{a.weight}</span>
                  {!isMgmt && (
                    <button
                      type="button"
                      className={`ht-flag ${a.flagged ? 'on' : ''}`}
                      disabled={readOnly}
                      aria-pressed={Boolean(a.flagged)}
                      title={a.flagged ? 'Flagged for the 1st-round interviewer' : 'Flag this answer for the 1st-round interviewer'}
                      onClick={() => updateAnswer(a.qid, { flagged: !a.flagged })}
                    >
                      ⚑{a.flagged ? ' Flagged' : ''}
                    </button>
                  )}
                </div>
                {a.guidance && (
                  <button type="button" className="ht-guide-toggle" onClick={() => setOpenGuide((o) => ({ ...o, [a.qid]: !o[a.qid] }))}>
                    {openGuide[a.qid] ? 'Hide' : 'Show'} what good looks like
                  </button>
                )}
                {openGuide[a.qid] && <p className="ht-guide">{a.guidance}</p>}
                <div className="ht-q-fields">
                  <label>
                    <span>{L.response}</span>
                    <textarea rows={2} value={a.response || ''} readOnly={readOnly} onChange={(e) => updateAnswer(a.qid, { response: e.target.value })} />
                  </label>
                  <label>
                    <span>{L.comment}</span>
                    <textarea rows={2} value={a.comment || ''} readOnly={readOnly} onChange={(e) => updateAnswer(a.qid, { comment: e.target.value })} />
                  </label>
                </div>
                <div className="ht-score-row" role="radiogroup" aria-label={`Score for question ${i + 1}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={a.score === n}
                      className={`ht-score-btn ${a.score === n ? `on tone-${scoreTone(n)}` : ''}`}
                      disabled={readOnly}
                      title={SCORE_HINT[n]}
                      onClick={() => updateAnswer(a.qid, { score: a.score === n ? null : n })}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="ht-score-hint">{a.score ? SCORE_HINT[a.score] : 'Not scored'}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <aside className="ht-eval-side">
        <div className="ht-side-card">
          <div className="ht-big-score">
            <span className={`ht-big-num tone-${scoreTone(calc.score)}`}>{calc.score != null ? calc.score.toFixed(2) : '—'}</span>
            <span className="ht-big-of">/ 5</span>
          </div>
          <div className="ht-progress"><span style={{ width: `${calc.required ? (calc.scored / calc.required) * 100 : 0}%` }} /></div>
          <p className="ht-side-meta">{calc.scored} of {calc.required} questions scored · weighted</p>
          {sugg && <p className="ht-side-meta">Score suggests: <b>{REC_LABEL[sugg]}</b></p>}

          <div className="ht-side-field">
            <span>Recommendation *</span>
            <div className="ht-rec-group">
              {['RECOMMENDED', 'HOLD', 'NOT_RECOMMENDED'].map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={readOnly}
                  className={`ht-rec ht-rec-${r.toLowerCase()} ${ev.recommendation === r ? 'on' : ''}`}
                  onClick={() => update({ recommendation: r })}
                >
                  {REC_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {isMgmt && (
            <>
              <label className="ht-side-field">
                <span>Key strengths</span>
                <textarea rows={2} value={ev.strengths || ''} readOnly={readOnly} onChange={(e) => update({ strengths: e.target.value })} />
              </label>
              <label className="ht-side-field">
                <span>Concerns / risks</span>
                <textarea rows={2} value={ev.concerns || ''} readOnly={readOnly} onChange={(e) => update({ concerns: e.target.value })} />
              </label>
            </>
          )}
          <label className="ht-side-field">
            <span>{L.summary}</span>
            <textarea rows={3} value={ev.summary || ''} readOnly={readOnly} onChange={(e) => update({ summary: e.target.value })} />
          </label>
          {kind === 'R1' && (
            <label className="ht-check">
              <input type="checkbox" checked={Boolean(ev.requiresSecondRound)} disabled={readOnly} onChange={(e) => update({ requiresSecondRound: e.target.checked })} />
              Needs a 2nd round interview
            </label>
          )}

          {!readOnly && (
            <div className="ht-side-actions">
              {ev.status !== 'SUBMITTED' && (
                <button type="button" className="hr-btn hr-btn-outline" onClick={() => persist(false)} disabled={saveState.busy}>Save draft</button>
              )}
              <button type="button" className="hr-btn hr-btn-gold" onClick={submit} disabled={saveState.busy}>
                {ev.status === 'SUBMITTED' ? 'Update evaluation' : L.submit}
              </button>
            </div>
          )}
          <p className="ht-save-state">
            {saveState.error ? <span className="hr-error">{saveState.error}</span>
              : saveState.busy ? 'Saving…'
                : saveState.at ? `Saved ${saveState.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                  : !readOnly ? 'Autosaves as you type' : ''}
          </p>
          {!readOnly && <p className="ht-side-meta">Tip: focus a question and press 1–5 to score.</p>}
        </div>
      </aside>
    </div>
  );
}
