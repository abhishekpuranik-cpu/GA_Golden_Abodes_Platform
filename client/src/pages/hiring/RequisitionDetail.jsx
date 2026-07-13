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
  const [newCand, setNewCand] = useState({
    name: '',
    source: 'agency',
    email: '',
    phone: '',
    entityTag: 'PAD',
    agencyName: '',
    agencyContact: '',
    agencyEmail: '',
    agencyNotes: '',
    currentCompany: '',
    cityCurrent: ''
  });
  const [agencyDraft, setAgencyDraft] = useState({ name: '', contact: '' });
  const [showAgencies, setShowAgencies] = useState(false);

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

  async function handleFulfill() {
    if (!window.confirm('Mark this position as Hiring Fulfilled?')) return;
    setBusy('fulfill');
    setMsg('');
    try {
      const updated = await hiringApi.fulfillRequisition(id);
      setReq(updated);
      setMsg('Position marked as Hiring Fulfilled.');
      setMsgTone('success');
      load();
    } catch (e) {
      setMsg(e.message);
      setMsgTone('error');
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
      if (newCand.source === 'agency' && !String(newCand.agencyName || '').trim()) {
        setMsg('Agency name is required for agency candidates');
        setMsgTone('error');
        return;
      }
      await hiringApi.createCandidate({
        ...newCand,
        requisitionId: id,
        entityTag: newCand.entityTag || req.entityTag
      });
      setShowAdd(false);
      setNewCand({
        name: '',
        source: 'agency',
        email: '',
        phone: '',
        entityTag: req?.entityTag || 'PAD',
        agencyName: '',
        agencyContact: '',
        agencyEmail: '',
        agencyNotes: '',
        currentCompany: '',
        cityCurrent: ''
      });
      setMsg('Candidate added to pipeline');
      setMsgTone('success');
      load();
    } catch (err) {
      setMsg(err.message);
      setMsgTone('error');
    }
  }

  async function handleAddAgency(e) {
    e.preventDefault();
    const name = String(agencyDraft.name || '').trim();
    if (!name) return;
    setBusy('agency');
    try {
      const list = [...(req.agenciesShared || [])];
      if (!list.some((a) => String(a.name).toLowerCase() === name.toLowerCase())) {
        list.push({ name, contact: agencyDraft.contact || '', sharedAt: new Date().toISOString(), notes: '' });
      }
      await hiringApi.updateRequisition(id, { agenciesShared: list });
      setAgencyDraft({ name: '', contact: '' });
      setMsg(`Agency "${name}" recorded for this posting`);
      setMsgTone('success');
      load();
    } catch (err) {
      setMsg(err.message);
      setMsgTone('error');
    } finally {
      setBusy('');
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
          {req.promptClosure && req.status !== 'Hiring Fulfilled' && (
            <span className="hr-badge" style={{ background: '#fef3c7' }}>Headcount filled — mark as fulfilled</span>
          )}
          {req.status === 'Hiring Fulfilled' && (
            <span className="hr-badge hr-badge-gold">Hiring Fulfilled</span>
          )}
        </div>
        <h2>{req.role}</h2>
        <p className="hr-muted">{req.location} · {req.entityTag} · {formatLpaBand(req.bandMinPaise, req.bandMaxPaise)}</p>
        {(req.department || req.projectName) && (
          <p className="hr-muted">{[req.department, req.projectName].filter(Boolean).join(' · ')}</p>
        )}
        {(req.requestedBy || req.approvedBy) && (
          <p className="hr-muted">
            Requested by {req.requestedBy || '—'}
            {' · '}
            Approved by {req.approvedBy || '—'}
          </p>
        )}
        <p style={{ whiteSpace: 'pre-wrap' }}>{req.brief}</p>
        <p className="hr-muted">Hired {req.filledHeadcount || 0} / {req.headcount}</p>
        {(req.attachmentsMeta || []).length > 0 && (
          <p className="hr-muted">
            Attachments:{' '}
            {(req.attachmentsMeta || []).map((a) => (
              <a
                key={a.kind}
                href={hiringApi.attachmentUrl(id, a.kind)}
                className="hr-link"
                style={{ marginRight: '0.75rem' }}
              >
                {a.kind === 'jd' ? 'JD' : 'Email'} — {a.filename}
              </a>
            ))}
          </p>
        )}
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
            <button type="button" className="hr-btn hr-btn-outline" onClick={() => setShowAgencies((v) => !v)}>
              {showAgencies ? 'Hide agencies' : 'Agencies shared'}
            </button>
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
            {req.canMarkFulfilled && req.status !== 'Cancelled' && (
              <button type="button" className="hr-btn hr-btn-gold" disabled={!!busy} onClick={handleFulfill}>
                {busy === 'fulfill' ? 'Updating…' : 'Mark Hiring Fulfilled'}
              </button>
            )}
            {req.status !== 'Cancelled' && req.status !== 'Closed' && req.status !== 'Hiring Fulfilled' && (
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

      {showAgencies && (
        <div className="hr-card hr-agency-panel">
          <h3 style={{ marginTop: 0, fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A' }}>
            Agencies this posting was shared with
          </h3>
          <p className="hr-muted" style={{ marginTop: 0 }}>
            Track external agencies that received this JD. Candidates they submit join the same pipeline.
          </p>
          {(req.agenciesShared || []).length === 0 ? (
            <p className="hr-muted">No agencies recorded yet.</p>
          ) : (
            <ul className="hr-agency-list">
              {(req.agenciesShared || []).map((a, i) => (
                <li key={`${a.name}-${i}`}>
                  <strong>{a.name}</strong>
                  {a.contact ? <span className="hr-muted"> · {a.contact}</span> : null}
                  {a.sharedAt ? (
                    <span className="hr-muted"> · shared {new Date(a.sharedAt).toLocaleDateString('en-IN')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <form className="hr-agency-add" onSubmit={handleAddAgency}>
              <input
                required
                placeholder="Agency name"
                value={agencyDraft.name}
                onChange={(e) => setAgencyDraft({ ...agencyDraft, name: e.target.value })}
              />
              <input
                placeholder="Contact (optional)"
                value={agencyDraft.contact}
                onChange={(e) => setAgencyDraft({ ...agencyDraft, contact: e.target.value })}
              />
              <button type="submit" className="hr-btn hr-btn-gold" disabled={busy === 'agency'}>
                {busy === 'agency' ? 'Saving…' : 'Add agency'}
              </button>
            </form>
          )}
        </div>
      )}

      <h3 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A' }}>Pipeline</h3>
      {!candidates.length ? (
        <EmptyState title="No candidates" hint="Add agency / referral candidates, import CSV, or Launch Metaview + Sync." />
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
                    <div className="hr-cand-chip-contact">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          onClick={(e) => e.stopPropagation()}
                          title={c.email}
                        >
                          {c.email}
                        </a>
                      ) : (
                        <span className="hr-muted">No email</span>
                      )}
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          title={c.phone}
                        >
                          {c.phone}
                        </a>
                      ) : (
                        <span className="hr-muted">No phone</span>
                      )}
                    </div>
                    <span className="hr-muted">
                      {c.source === 'agency' && c.agencyName
                        ? `Agency · ${c.agencyName}`
                        : c.source}
                    </span>
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
            <p className="hr-muted" style={{ marginTop: 0 }}>
              Agency submissions enter the same sourcing → hire pipeline as Metaview / portal imports.
            </p>
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
                  {['agency', 'referral', 'naukri', 'linkedin', 'walk-in', 'other'].map((s) => (
                    <option key={s} value={s}>{s === 'agency' ? 'External agency' : s}</option>
                  ))}
                </select>
              </div>
              {newCand.source === 'agency' && (
                <>
                  <div className="hr-form-row">
                    <label>Agency name *</label>
                    <input
                      required
                      list="hr-agency-list"
                      value={newCand.agencyName}
                      onChange={(e) => setNewCand({ ...newCand, agencyName: e.target.value })}
                      placeholder="e.g. ABC Recruiters"
                    />
                    <datalist id="hr-agency-list">
                      {(req.agenciesShared || []).map((a) => (
                        <option key={a.name} value={a.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="hr-form-row hr-form-row-inline">
                    <div style={{ flex: 1 }}>
                      <label>Agency contact</label>
                      <input
                        value={newCand.agencyContact}
                        onChange={(e) => setNewCand({ ...newCand, agencyContact: e.target.value })}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Agency email</label>
                      <input
                        type="email"
                        value={newCand.agencyEmail}
                        onChange={(e) => setNewCand({ ...newCand, agencyEmail: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="hr-form-row">
                    <label>Agency notes</label>
                    <input
                      value={newCand.agencyNotes}
                      onChange={(e) => setNewCand({ ...newCand, agencyNotes: e.target.value })}
                      placeholder="Fee terms, exclusivity, etc."
                    />
                  </div>
                </>
              )}
              <div className="hr-form-row">
                <label>Current company</label>
                <input value={newCand.currentCompany} onChange={(e) => setNewCand({ ...newCand, currentCompany: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <label>Email</label>
                <input type="email" value={newCand.email} onChange={(e) => setNewCand({ ...newCand, email: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <label>Phone</label>
                <input value={newCand.phone} onChange={(e) => setNewCand({ ...newCand, phone: e.target.value })} />
              </div>
              <button type="submit" className="hr-btn hr-btn-gold">Save to pipeline</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
