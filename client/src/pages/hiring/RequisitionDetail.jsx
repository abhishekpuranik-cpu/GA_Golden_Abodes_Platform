import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { hiringApi } from '../../lib/hiringApi.js';
import { STAGE_LABELS, formatLpaBand } from '../../lib/hiring/formatINR.js';
import { metaviewSearchUrl, metaviewSourcingHomeUrl } from '../../lib/hiring/metaviewLinks.js';
import EmptyState from '../../components/hiring/EmptyState.jsx';
import ImportDrawer from '../../components/hiring/ImportDrawer.jsx';
import RequisitionEditForm from '../../components/hiring/RequisitionEditForm.jsx';

export default function RequisitionDetail() {
  const { id } = useParams();
  const { canWrite, sourcingAuto } = useOutletContext();
  const navigate = useNavigate();
  const [req, setReq] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState('info');
  const [busy, setBusy] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newCand, setNewCand] = useState({ name: '', source: 'referral', email: '', phone: '', entityTag: 'PAD' });

  function load() {
    setLoadError('');
    Promise.all([
      hiringApi.getRequisition(id),
      hiringApi.listCandidates({ requisitionId: id })
    ])
      .then(([reqDoc, candDoc]) => {
        setReq(reqDoc);
        setCandidates(candDoc?.candidates || []);
      })
      .catch((e) => {
        setLoadError(e.message || 'Failed to load requisition');
        setReq(null);
      });
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (req?.entityTag) setNewCand((c) => ({ ...c, entityTag: req.entityTag }));
  }, [req?.entityTag]);

  async function handleSync() {
    setBusy('sync');
    setMsg('');
    setMsgTone('info');
    try {
      const r = await hiringApi.syncRequisition(id);
      const statusNote = r.status?.phase ? ` · Agent: ${r.status.phase}` : '';
      setMsg(`Synced — ${r.upserted} new (${r.total} in Metaview)${statusNote}`);
      setMsgTone('success');
      load();
    } catch (e) {
      setMsg(e.message);
      setMsgTone('error');
    } finally {
      setBusy('');
    }
  }

  async function handleSource() {
    setBusy('source');
    setMsg('');
    setMsgTone('info');
    try {
      const r = await hiringApi.sourceRequisition(id);
      if (r.alreadyActive) {
        setMsg(r.message || 'Metaview search already active — use Sync to pull candidates.');
      } else {
        setMsg(r.message || 'Metaview search started. Sync periodically to import candidates.');
      }
      setMsgTone('success');
      load();
    } catch (e) {
      setMsg(e.message);
      setMsgTone('error');
    } finally {
      setBusy('');
    }
  }

  async function handleSaveEdit(body) {
    setBusy('edit');
    try {
      const updated = await hiringApi.updateRequisition(id, body);
      setShowEdit(false);
      setReq(updated);
      setMsg(
        updated.metaviewUpdated
          ? 'Requirements saved and sent to Metaview for refine.'
          : 'Requirements saved.'
      );
      setMsgTone('success');
      load();
    } finally {
      setBusy('');
    }
  }

  async function handleScrap() {
    if (!window.confirm('Scrap this position? It will be marked Cancelled and stay in history (not deleted).')) return;
    setBusy('scrap');
    setMsg('');
    try {
      await hiringApi.deleteRequisition(id, { mode: 'scrap', reason: 'Scrapped from hiring app' });
      setMsg('Position scrapped (Cancelled).');
      setMsgTone('success');
      load();
    } catch (e) {
      if (String(e.message || '').includes('Sent offers')) {
        if (window.confirm(`${e.message}\n\nForce scrap anyway?`)) {
          try {
            await hiringApi.deleteRequisition(id, { mode: 'scrap', force: true, reason: 'Force-scrapped with open Sent offers' });
            setMsg('Position force-scrapped.');
            setMsgTone('success');
            load();
          } catch (e2) {
            setMsg(e2.message);
            setMsgTone('error');
          }
        } else {
          setMsg(e.message);
          setMsgTone('error');
        }
      } else {
        setMsg(e.message);
        setMsgTone('error');
      }
    } finally {
      setBusy('');
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this position from the board? It will be soft-deleted (recoverable in DB).')) return;
    setBusy('delete');
    setMsg('');
    try {
      await hiringApi.deleteRequisition(id, { mode: 'delete' });
      navigate('/app/hiring');
    } catch (e) {
      setMsg(e.message);
      setMsgTone('error');
      setBusy('');
    }
  }

  function handleImported(data) {
    setMsg(`Imported ${data.imported} candidates (${data.skippedDuplicates} duplicates skipped)`);
    setMsgTone('success');
    load();
  }

  async function handleAddCandidate(e) {
    e.preventDefault();
    try {
      await hiringApi.createCandidate({
        ...newCand,
        requisitionId: id,
        entityTag: newCand.entityTag || req.entityTag
      });
      setShowAdd(false);
      setNewCand({ name: '', source: 'referral', email: '', phone: '', entityTag: req?.entityTag || 'PAD' });
      load();
    } catch (err) {
      setMsg(err.message);
      setMsgTone('error');
    }
  }

  if (loadError) {
    return (
      <>
        <p><Link to="/app/hiring">← Requisitions</Link></p>
        <p className="hr-error">{loadError}</p>
        <button type="button" className="hr-btn" onClick={load}>Retry</button>
      </>
    );
  }

  if (!req) return <p className="hr-muted">Loading…</p>;

  const stages = Object.keys(STAGE_LABELS).map(Number).filter((n) => n <= 9);
  const openInMetaview = req.metaviewUrl || metaviewSearchUrl(req.metaviewSearchId);

  return (
    <>
      <p><Link to="/app/hiring">← Requisitions</Link></p>
      <div className="hr-card">
        <div className="hr-toolbar">
          <span className="hr-badge">{req.reqCode}</span>
          <span className="hr-badge hr-badge-gold">{req.status}</span>
          {req.promptClosure && <span className="hr-badge" style={{ background: '#fef3c7' }}>Headcount filled — consider closing</span>}
        </div>
        <h2>{req.role}</h2>
        <p className="hr-muted">{req.location} · {req.entityTag} · {formatLpaBand(req.bandMinPaise, req.bandMaxPaise)}</p>
        {(req.department || req.projectName) && (
          <p className="hr-muted">{[req.department, req.projectName].filter(Boolean).join(' · ')}</p>
        )}
        <p style={{ whiteSpace: 'pre-wrap' }}>{req.brief}</p>
        <p className="hr-muted">Hired {req.filledHeadcount || 0} / {req.headcount}</p>
        {req.metaviewSearchId && (
          <p className="hr-metaview-banner">
            Metaview search active · Sync pulls candidates matched to this job description
            {req.sourcingMode === 'auto' && ' (agent may take 5–15 min for new searches)'}
          </p>
        )}
      </div>

      <div className="hr-toolbar">
        {canWrite && (
          <>
            <button type="button" className="hr-btn" onClick={() => setShowEdit(true)}>Edit requirements</button>
            <button type="button" className="hr-btn" onClick={() => setShowAdd(true)}>+ Add candidate</button>
            <button type="button" className="hr-btn hr-btn-outline" onClick={() => setShowImport(true)}>Import CSV/XLSX</button>
            {sourcingAuto && !req.metaviewSearchId && (
              <button type="button" className="hr-btn hr-btn-gold" disabled={!!busy} onClick={handleSource}>
                {busy === 'source' ? 'Launching…' : 'Launch Metaview'}
              </button>
            )}
            {(sourcingAuto || req.metaviewSearchId) && (
              <button type="button" className="hr-btn hr-btn-outline" disabled={!!busy || !req.metaviewSearchId} onClick={handleSync}>
                {busy === 'sync' ? 'Syncing…' : 'Sync Metaview'}
              </button>
            )}
            {req.status !== 'Cancelled' && req.status !== 'Closed' && (
              <button type="button" className="hr-btn hr-btn-outline" style={{ borderColor: '#b91c1c', color: '#b91c1c' }} disabled={!!busy} onClick={handleScrap}>
                {busy === 'scrap' ? 'Scrapping…' : 'Scrap position'}
              </button>
            )}
            <button type="button" className="hr-btn hr-btn-outline" style={{ borderColor: '#64748b', color: '#64748b' }} disabled={!!busy} onClick={handleDelete}>
              Delete
            </button>
          </>
        )}
        {openInMetaview ? (
          <a
            className="hr-btn hr-btn-gold"
            href={openInMetaview}
            target="_blank"
            rel="noreferrer"
          >
            Open in Metaview ↗
          </a>
        ) : (
          <a
            className="hr-btn hr-btn-outline"
            href={metaviewSourcingHomeUrl()}
            target="_blank"
            rel="noreferrer"
            title="No search linked yet — opens Metaview Sourcing home"
          >
            Metaview home ↗
          </a>
        )}
      </div>
      {msg && <p className={msgTone === 'error' ? 'hr-error' : 'hr-muted'}>{msg}</p>}

      <h3 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A' }}>Pipeline</h3>
      {!candidates.length ? (
        <EmptyState title="No candidates" hint="Add manually, import CSV, or Launch Metaview + Sync." />
      ) : (
        <div className="hr-kanban">
          {stages.map((stageNum) => {
            const col = candidates.filter((c) => c.currentStageNumber === stageNum);
            return (
              <div key={stageNum} className="hr-kanban-col">
                <h4>{STAGE_LABELS[stageNum]} ({col.length})</h4>
                {col.map((c) => (
                  <div
                    key={c._id}
                    className="hr-cand-chip"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/app/hiring/req/${id}/candidate/${c._id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/app/hiring/req/${id}/candidate/${c._id}`)}
                  >
                    <strong>{c.name}</strong>
                    <br />
                    <span className="hr-muted">{c.source}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {showEdit && (
        <RequisitionEditForm
          initial={req}
          busy={busy === 'edit'}
          onCancel={() => setShowEdit(false)}
          onSave={handleSaveEdit}
        />
      )}

      <ImportDrawer
        open={showImport}
        onClose={() => setShowImport(false)}
        requisitionId={id}
        defaultEntityTag={req.entityTag}
        onImported={handleImported}
      />

      {showAdd && (
        <div className="hr-modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add candidate</h2>
            <form onSubmit={handleAddCandidate}>
              <div className="hr-form-row">
                <label>Name</label>
                <input required value={newCand.name} onChange={(e) => setNewCand({ ...newCand, name: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <label>Entity tag</label>
                <select value={newCand.entityTag} onChange={(e) => setNewCand({ ...newCand, entityTag: e.target.value })}>
                  {['PAD', 'NBD', 'NP', 'GV', 'GAPL', 'Suryakiran'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="hr-form-row">
                <label>Source</label>
                <select value={newCand.source} onChange={(e) => setNewCand({ ...newCand, source: e.target.value })}>
                  {['referral', 'naukri', 'linkedin', 'walk-in', 'other'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="hr-form-row">
                <label>Email</label>
                <input type="email" value={newCand.email} onChange={(e) => setNewCand({ ...newCand, email: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <label>Phone</label>
                <input value={newCand.phone} onChange={(e) => setNewCand({ ...newCand, phone: e.target.value })} />
              </div>
              <button type="submit" className="hr-btn hr-btn-gold">Save</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
