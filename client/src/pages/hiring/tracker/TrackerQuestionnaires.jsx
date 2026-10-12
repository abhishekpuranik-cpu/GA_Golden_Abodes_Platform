import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { trackerApi } from '../../../lib/hiring/trackerApi.js';
import { Modal } from './TrackerModals.jsx';

const KINDS = [
  { kind: 'HR', label: 'HR screening', mgmt: false },
  { kind: 'MGMT_R1', label: '1st round (Management)', mgmt: true },
  { kind: 'MGMT_R2', label: '2nd round (Optional)', mgmt: true }
];

const blank = () => ({ id: `new-${Date.now().toString(36)}`, category: '', text: '', guidance: '', weight: 3 });

export default function TrackerQuestionnaires() {
  const { caps, positions, reloadRefs } = useOutletContext();
  const [positionId, setPositionId] = useState(positions[0]?._id || '');
  const kinds = KINDS.filter((k) => (k.mgmt ? caps.editMgmtTemplates : caps.editHrTemplates));
  const [kind, setKind] = useState(kinds[0]?.kind || 'HR');
  const [templates, setTemplates] = useState({});
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const position = positions.find((p) => p._id === positionId);
  const [openings, setOpenings] = useState(position?.openings ?? 1);

  useEffect(() => { setOpenings(position?.openings ?? 1); }, [position]);

  useEffect(() => {
    if (!positionId) return;
    setDraft(null);
    trackerApi.templates(positionId).then((d) => {
      const map = Object.fromEntries((d.templates || []).map((t) => [t.kind, t]));
      setTemplates(map);
    }).catch((e) => setMsg(e.message));
  }, [positionId]);

  useEffect(() => {
    const t = templates[kind];
    setDraft(t ? t.questions.map((q) => ({ ...q })) : []);
    setDirty(false);
  }, [templates, kind]);

  const totalWeight = useMemo(() => (draft || []).reduce((s, q) => s + (Number(q.weight) || 0), 0), [draft]);

  const confirmLeave = () => !dirty || window.confirm('Discard unsaved changes?');
  const edit = (i, patch) => { setDirty(true); setDraft((d) => d.map((q, idx) => (idx === i ? { ...q, ...patch } : q))); };
  const move = (i, dir) => {
    setDirty(true);
    setDraft((d) => {
      const next = [...d];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const { template } = await trackerApi.saveTemplate(positionId, kind, draft);
      setTemplates((t) => ({ ...t, [kind]: template }));
      setMsg('Saved. New evaluations will use this version; evaluations already started keep their questions.');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function reset() {
    if (!window.confirm('Replace this questionnaire with the default questions from the JD pack?')) return;
    setBusy(true);
    try {
      const { template } = await trackerApi.resetTemplate(positionId, kind);
      setTemplates((t) => ({ ...t, [kind]: template }));
      setMsg('Reset to default.');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function savePosition(patch) {
    try {
      await trackerApi.updatePosition(positionId, patch);
      await reloadRefs();
      setMsg('Position updated.');
    } catch (e) { setMsg(e.message); }
  }

  const tpl = templates[kind];

  return (
    <div className="ht-qb">
      <aside className="ht-qb-positions">
        <h3>Positions</h3>
        {positions.map((p) => (
          <button
            key={p._id}
            type="button"
            className={`${p._id === positionId ? 'on' : ''} ${p.isActive ? '' : 'is-inactive'}`}
            onClick={() => confirmLeave() && setPositionId(p._id)}
          >
            {p.title}
            {!p.isActive && <em> (closed)</em>}
          </button>
        ))}
        <button type="button" className="ht-link-btn" onClick={() => setShowNew(true)}>+ New position</button>
      </aside>

      <div className="ht-qb-main">
        {position && (
          <div className="ht-qb-pos">
            <div>
              <h2>{position.title}</h2>
              <p className="hr-muted">{position.department} · reports to {position.reportsTo}</p>
            </div>
            <label className="ht-inline-field">Openings
              <input type="number" min="0" value={openings} onChange={(e) => setOpenings(e.target.value)} onBlur={() => Number(openings) !== position.openings && savePosition({ openings: Number(openings) })} />
            </label>
            <label className="ht-check">
              <input type="checkbox" checked={position.isActive} onChange={(e) => savePosition({ isActive: e.target.checked })} />
              Accepting candidates
            </label>
          </div>
        )}

        <div className="ht-seg ht-qb-kinds">
          {kinds.map((k) => (
            <button key={k.kind} type="button" className={kind === k.kind ? 'on' : ''} onClick={() => confirmLeave() && setKind(k.kind)}>{k.label}</button>
          ))}
        </div>

        {!draft ? <p className="hr-muted">Loading…</p> : (
          <>
            <p className="ht-side-meta">
              {draft.length} questions · total weight {totalWeight}
              {tpl?.updatedByName ? ` · last edited by ${tpl.updatedByName} on ${new Date(tpl.updatedAt).toLocaleDateString('en-IN')}` : ''}
            </p>
            <div className="ht-qb-list">
              {draft.map((q, i) => (
                <div key={q.id} className="ht-qb-item">
                  <div className="ht-qb-order">
                    <span>Q{i + 1}</span>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Move down">▼</button>
                  </div>
                  <div className="ht-qb-fields">
                    <div className="ht-qb-row">
                      <input className="ht-qb-cat" value={q.category} placeholder="Category (e.g. Functional capability)" onChange={(e) => edit(i, { category: e.target.value })} />
                      <label className="ht-qb-weight">Weight
                        <select value={q.weight} onChange={(e) => edit(i, { weight: Number(e.target.value) })}>
                          {[0, 1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <em>{totalWeight ? `${Math.round(((Number(q.weight) || 0) / totalWeight) * 100)}%` : ''}</em>
                      </label>
                    </div>
                    <textarea rows={2} value={q.text} placeholder="Question" onChange={(e) => edit(i, { text: e.target.value })} />
                    <textarea rows={2} className="ht-qb-guide" value={q.guidance} placeholder="Evaluation guidance — what good / poor answers look like" onChange={(e) => edit(i, { guidance: e.target.value })} />
                  </div>
                  <button type="button" className="ht-icon-btn" onClick={() => { setDirty(true); setDraft((d) => d.filter((_, idx) => idx !== i)); }} aria-label="Remove question">×</button>
                </div>
              ))}
            </div>
            <div className="ht-qb-actions">
              <button type="button" className="hr-btn hr-btn-outline" onClick={() => { setDirty(true); setDraft((d) => [...d, blank()]); }}>+ Add question</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="ht-link-btn" onClick={reset} disabled={busy}>Reset to default</button>
              <button type="button" className="hr-btn hr-btn-gold" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save questionnaire'}</button>
            </div>
            <p className="ht-side-meta">Weight 0 keeps a question for notes only — it is not scored. Scores are 1–5 and the overall score is the weighted average.</p>
            {msg && <p className="ht-msg">{msg}</p>}
          </>
        )}
      </div>

      {showNew && <NewPositionModal onClose={() => setShowNew(false)} onCreated={async (p) => { setShowNew(false); await reloadRefs(); setPositionId(p._id); }} />}
    </div>
  );
}

function NewPositionModal({ onClose, onCreated }) {
  const [f, setF] = useState({ title: '', department: '', reportsTo: '', experience: '', location: 'Golden HQ, Pune', mandate: '', openings: 1 });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="New position" onClose={onClose} wide>
      <form onSubmit={async (e) => {
        e.preventDefault();
        try { const { position } = await trackerApi.createPosition(f); onCreated(position); } catch (ex) { setErr(ex.message); }
      }}
      >
        <div className="ht-form-grid">
          <label className="ht-span-2">Title *<input required value={f.title} onChange={set('title')} /></label>
          <label>Department<input value={f.department} onChange={set('department')} /></label>
          <label>Reports to<input value={f.reportsTo} onChange={set('reportsTo')} /></label>
          <label>Experience<input value={f.experience} onChange={set('experience')} /></label>
          <label>Openings<input type="number" min="0" value={f.openings} onChange={set('openings')} /></label>
          <label className="ht-span-2">Role mandate<textarea rows={2} value={f.mandate} onChange={set('mandate')} /></label>
        </div>
        <p className="hr-muted">Starts with generic HR and management questionnaires — tailor them after creating.</p>
        {err && <p className="hr-error">{err}</p>}
        <div className="ht-modal-actions">
          <button type="button" className="hr-btn hr-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-gold">Create position</button>
        </div>
      </form>
    </Modal>
  );
}
