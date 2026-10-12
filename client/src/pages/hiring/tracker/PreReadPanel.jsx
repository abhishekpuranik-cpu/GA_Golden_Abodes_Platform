import { useCallback, useEffect, useRef, useState } from 'react';
import { trackerApi } from '../../../lib/hiring/trackerApi.js';
import { fmtDate, scoreTone } from '../../../lib/hiring/trackerLabels.js';
import { Modal } from './TrackerModals.jsx';

const toLines = (list, fn) => (list || []).map(fn).join('\n');
const fromLines = (text, fn) => text.split('\n').map((l) => l.trim()).filter(Boolean).map(fn);
const splitPair = (line, a, b) => {
  const [x, ...rest] = line.split(' | ');
  return { [a]: x.trim(), [b]: rest.join(' | ').trim() };
};

function asText(pr, candidateName, positionTitle) {
  const out = [`1st round pre-read — ${candidateName}${positionTitle ? ` (${positionTitle})` : ''}`, '', pr.headline];
  if (pr.verdict) out.push('', pr.verdict);
  if (pr.snapshot?.length) out.push('', ...pr.snapshot.map((s) => `${s.label}: ${s.value}`));
  const sec = (title, items) => { if (items?.length) out.push('', title, ...items); };
  sec('Strengths', pr.strengths?.map((s) => `• ${s.point}${s.evidence ? ` — ${s.evidence}` : ''}`));
  sec('Concerns', pr.concerns?.map((s) => `• ${s.point}${s.evidence ? ` — ${s.evidence}` : ''}`));
  sec('Verify', pr.verify?.map((v) => `• ${v}`));
  sec('Suggested probes', pr.probes?.map((p, i) => `${i + 1}. ${p.question}${p.why ? ` (${p.why})` : ''}`));
  return out.join('\n');
}

export default function PreReadPanel({ candidateId, candidateName, positionTitle, hrSubmittedAt, canRegenerate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const poll = useRef(null);

  const load = useCallback(() => trackerApi.preRead(candidateId).then((d) => { setData(d); setErr(''); return d; }).catch((e) => setErr(e.message)), [candidateId]);

  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let tries = 0;
    setStalled(false);
    const tick = async () => {
      const d = await load();
      const pending = d && (d.preRead.status === 'GENERATING' || (d.hrStatus === 'SUBMITTED' && d.preRead.status === 'NONE'));
      if (!pending) return;
      if (tries < 40) { tries += 1; poll.current = setTimeout(tick, 3000); } else setStalled(true);
    };
    tick();
    return () => clearTimeout(poll.current);
  }, [load, hrSubmittedAt]);

  async function regenerate() {
    setBusy(true);
    try { setData(await trackerApi.regeneratePreRead(candidateId)); setErr(''); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (err && !data) return <p className="hr-error">{err}</p>;
  if (!data) return <p className="hr-muted">Loading pre-read…</p>;
  const { preRead: pr, hrStatus, stale } = data;

  if (hrStatus !== 'SUBMITTED') {
    return <p className="hr-muted">The pre-read is prepared automatically from {candidateName}&rsquo;s answers once HR submits the screening.</p>;
  }
  if (pr.status === 'GENERATING' || pr.status === 'NONE') {
    if (stalled || busy) {
      return (
        <p className="ht-preread-wait">
          {busy ? <><span className="ht-spinner" aria-hidden /> Preparing pre-read…</> : 'The pre-read is taking longer than expected.'}
          {!busy && canRegenerate && <button type="button" className="ht-link-btn" onClick={regenerate}>Prepare now</button>}
        </p>
      );
    }
    return <p className="ht-preread-wait"><span className="ht-spinner" aria-hidden /> Summarising {candidateName}&rsquo;s screening answers — usually under a minute…</p>;
  }

  return (
    <div className="ht-preread">
      {stale && (
        <div className="ht-alert ht-alert-warn">
          HR updated the screening after this pre-read was prepared.
          {canRegenerate && <button type="button" className="ht-link-btn" onClick={regenerate} disabled={busy}>Refresh pre-read</button>}
        </div>
      )}
      {pr.error && <div className="ht-alert">{pr.error}</div>}

      <p className="ht-preread-headline">{pr.headline}</p>
      {pr.verdict && <p className="ht-preread-verdict">{pr.verdict}</p>}

      {(pr.snapshot?.length > 0 || pr.categoryScores?.length > 0) && (
        <div className="ht-preread-top">
          {pr.snapshot?.length > 0 && (
            <dl className="ht-preread-snap">
              {pr.snapshot.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
            </dl>
          )}
          {pr.categoryScores?.length > 0 && (
            <div className="ht-preread-cats">
              {pr.categoryScores.map((c) => (
                <div key={c.category} className="ht-st-row">
                  <span>{c.category}</span>
                  <span className="ht-st-bar"><span className={`bg-${scoreTone(c.score)}`} style={{ width: `${(c.score / 5) * 100}%` }} /></span>
                  <b>{c.score.toFixed(1)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ht-preread-cols">
        <PointList title="Strengths" tone="good" items={pr.strengths} />
        <PointList title="Concerns" tone="low" items={pr.concerns} />
      </div>

      {pr.verify?.length > 0 && (
        <div className="ht-preread-block">
          <h4>Verify in the interview</h4>
          <ul>{pr.verify.map((v, i) => <li key={i}>{v}</li>)}</ul>
        </div>
      )}

      {pr.probes?.length > 0 && (
        <div className="ht-preread-block ht-preread-probes">
          <h4>Suggested probes for this candidate</h4>
          <ol>{pr.probes.map((p, i) => <li key={i}><b>{p.question}</b>{p.why && <span>{p.why}</span>}</li>)}</ol>
        </div>
      )}

      {pr.digest?.length > 0 && (
        <details className="ht-preread-digest">
          <summary>What {candidateName} said — all {pr.digest.length} screening answers</summary>
          <ol>
            {pr.digest.map((d) => (
              <li key={d.qid} className={d.flagged ? 'is-flagged' : ''}>
                <p className="ht-digest-q">{d.question}{d.flagged && <span className="ht-flag on">⚑ Flagged</span>}</p>
                <p className="ht-digest-a">
                  {d.score != null && <span className={`ht-score ht-score-${scoreTone(d.score)}`}>{d.score}</span>}
                  {d.takeaway}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="ht-preread-foot">
        <span>
          {pr.source === 'AI' ? 'AI-summarised' : 'Auto-summarised'} from HR screening · {fmtDate(pr.generatedAt, true)}
          {pr.editedByName ? ` · edited by ${pr.editedByName}` : ''}
        </span>
        <span className="ht-preread-actions">
          <button type="button" className="ht-link-btn" onClick={() => { navigator.clipboard?.writeText(asText(pr, candidateName, positionTitle)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="ht-link-btn" onClick={() => setEditing(true)}>Edit</button>
          {canRegenerate && <button type="button" className="ht-link-btn" onClick={regenerate} disabled={busy}>{busy ? 'Regenerating…' : 'Regenerate'}</button>}
        </span>
      </div>
      {err && <p className="hr-error">{err}</p>}

      {editing && (
        <EditPreReadModal
          pr={pr}
          onClose={() => setEditing(false)}
          onSave={async (body) => { setData(await trackerApi.savePreRead(candidateId, body)); setEditing(false); }}
        />
      )}
    </div>
  );
}

function PointList({ title, tone, items }) {
  return (
    <div className={`ht-preread-block tone-border-${tone}`}>
      <h4>{title}</h4>
      {items?.length ? (
        <ul>{items.map((p, i) => <li key={i}><b>{p.point}</b>{p.evidence && <span>{p.evidence}</span>}</li>)}</ul>
      ) : <p className="hr-muted">None noted.</p>}
    </div>
  );
}

function EditPreReadModal({ pr, onClose, onSave }) {
  const [f, setF] = useState({
    headline: pr.headline || '',
    verdict: pr.verdict || '',
    strengths: toLines(pr.strengths, (p) => [p.point, p.evidence].filter(Boolean).join(' | ')),
    concerns: toLines(pr.concerns, (p) => [p.point, p.evidence].filter(Boolean).join(' | ')),
    verify: (pr.verify || []).join('\n'),
    probes: toLines(pr.probes, (p) => [p.question, p.why].filter(Boolean).join(' | '))
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Edit pre-read" onClose={onClose} wide>
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave({
            headline: f.headline,
            verdict: f.verdict,
            strengths: fromLines(f.strengths, (l) => splitPair(l, 'point', 'evidence')),
            concerns: fromLines(f.concerns, (l) => splitPair(l, 'point', 'evidence')),
            verify: fromLines(f.verify, (l) => l),
            probes: fromLines(f.probes, (l) => splitPair(l, 'question', 'why'))
          });
        } catch (ex) { setErr(ex.message); }
      }}
      >
        <p className="hr-muted">One item per line. Use &ldquo; | &rdquo; to separate a point from its evidence (or a question from why to ask it).</p>
        <div className="ht-form-grid">
          <label className="ht-span-2">Headline<input value={f.headline} onChange={set('headline')} /></label>
          <label className="ht-span-2">Overall read<textarea rows={3} value={f.verdict} onChange={set('verdict')} /></label>
          <label>Strengths<textarea rows={5} value={f.strengths} onChange={set('strengths')} /></label>
          <label>Concerns<textarea rows={5} value={f.concerns} onChange={set('concerns')} /></label>
          <label className="ht-span-2">Verify in the interview<textarea rows={3} value={f.verify} onChange={set('verify')} /></label>
          <label className="ht-span-2">Suggested probes<textarea rows={5} value={f.probes} onChange={set('probes')} /></label>
        </div>
        {err && <p className="hr-error">{err}</p>}
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-gold">Save pre-read</button>
        </div>
      </form>
    </Modal>
  );
}
