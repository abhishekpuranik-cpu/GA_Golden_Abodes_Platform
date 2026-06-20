import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllocation } from '../../hooks/postsales/useAllocation.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import { useAssignees } from '../../hooks/postsales/useMyTasks.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { TASK_KINDS } from '../../data/postsales/taskKinds.js';
import { PHASES } from '../../data/postsales/steps.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

const WORK_TYPES = [
  { id: '', label: 'All work types' },
  { id: 'cx', label: 'Frontend / CX (customer)' },
  { id: 'backend', label: 'Backend (coordination)' },
];

const SUB_TABS = [
  { id: 'assign', label: 'Work assignment' },
  { id: 'catalog', label: 'Activity catalog' },
];

const EMPTY_ACTIVITY = {
  number: '',
  name: '',
  phase: 'booking_handoff',
  assignedRole: '',
  taskKind: 'cx',
  slaDays: '',
  slaUnit: 'working days',
  triggerEvent: '',
  escalation: '',
  checklistText: '',
};

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function checklistToText(list) {
  return (list || []).join('\n');
}

function textToChecklist(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

export default function WorkAllocation() {
  const [unlocked, setUnlocked] = useState(() => postSalesApi.hasAllocationAdmin());
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [subTab, setSubTab] = useState('assign');
  const [taskKind, setTaskKind] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [cxExecutive, setCxExecutive] = useState('');
  const [backendExecutive, setBackendExecutive] = useState('');
  const [assignPerson, setAssignPerson] = useState('');
  const [assignKind, setAssignKind] = useState('cx');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [newActivity, setNewActivity] = useState(EMPTY_ACTIVITY);

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const filters = useMemo(() => ({ ...query, ...(taskKind ? { taskKind } : {}) }), [query, taskKind]);
  const { rows, summary, loading, error, assignExecutives, assignSteps, autoAssign } = useAllocation(unlocked ? filters : {});
  const { cxTeam, backendTeam } = useAssignees();

  const suggestedPeople = assignKind === 'backend' ? backendTeam : cxTeam;

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const data = await postSalesApi.getActivityCatalog();
      setCatalog(data.activities || []);
    } catch (e) {
      setCatalogError(e.message);
      if (e.message?.includes('admin access')) setUnlocked(false);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && subTab === 'catalog') refreshCatalog();
  }, [unlocked, subTab, refreshCatalog]);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      await postSalesApi.verifyAllocationAdmin(password);
      setUnlocked(true);
      setPassword('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLock = () => {
    postSalesApi.clearAllocationAdmin();
    setUnlocked(false);
  };

  const toggleAll = (checked) => {
    setSelected(checked ? new Set(rows.map((r) => r.unitId)) : new Set());
  };

  const toggleRow = (unitId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const scopeBody = () => {
    const body = { ...query };
    if (selected.size) body.unitIds = [...selected];
    return body;
  };

  const run = async (fn) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fn(scopeBody());
      setMessage(typeof result?.stepsUpdated === 'number'
        ? `Updated ${result.stepsUpdated} step(s).`
        : `Updated ${result.modified ?? result.matched ?? 0} unit(s).`);
    } catch (e) {
      setMessage(e.message);
      if (e.message?.includes('admin access')) setUnlocked(false);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (activity) => {
    setEditForm({
      ...activity,
      checklistText: checklistToText(activity.checklist),
    });
  };

  const saveEdit = async () => {
    if (!editForm) return;
    setBusy(true);
    setMessage(null);
    try {
      await postSalesApi.updateActivityCatalogItem(editForm.number, {
        ...editForm,
        checklist: textToChecklist(editForm.checklistText),
      });
      setEditForm(null);
      await refreshCatalog();
      setMessage('Activity updated.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addActivity = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await postSalesApi.addActivityCatalogItem({
        ...newActivity,
        number: newActivity.number ? Number(newActivity.number) : undefined,
        slaDays: newActivity.slaDays !== '' ? Number(newActivity.slaDays) : null,
        checklist: textToChecklist(newActivity.checklistText),
      });
      setNewActivity(EMPTY_ACTIVITY);
      await refreshCatalog();
      setMessage('Activity added.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) {
    return (
      <div className="ps-card" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h2 style={{ marginTop: 0 }}>Work allocation — admin access</h2>
        <p style={{ color: 'var(--ps-text-muted)', fontSize: '0.9rem' }}>
          This tab is restricted. Enter the allocation admin password to manage work assignment and the activity catalog.
        </p>
        <form onSubmit={handleUnlock}>
          {authError && <div className="ps-error" style={{ marginBottom: 12 }}>{authError}</div>}
          <div className="ps-form-group">
            <label>Admin password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button type="submit" className="ps-btn ps-btn-primary" disabled={authBusy}>
            {authBusy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Work allocation</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--ps-text-muted)', fontSize: '0.9rem' }}>
            Assign frontend (CX) and backend executives. Configure pipeline activities and Frontend/Backend tags.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/app/post-sales/demands" className="ps-btn">Open Demands data →</Link>
          <button type="button" className="ps-btn" onClick={handleLock}>Lock tab</button>
        </div>
      </div>

      <div className="ps-tabs" style={{ marginBottom: 16 }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`ps-tab ${subTab === tab.id ? 'active' : ''}`}
            onClick={() => setSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message && <div className="ps-card" style={{ marginBottom: 12, background: 'var(--ps-accent-soft)' }}>{message}</div>}

      {subTab === 'assign' && (
        <>
          <div className="ps-card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <div><div className="ps-kpi-label">Units in view</div><strong>{summary.units ?? rows.length}</strong></div>
            <div><div className="ps-kpi-label">Open CX tasks</div><strong style={{ color: TASK_KINDS.cx.color }}>{summary.openCxTasks ?? 0}</strong></div>
            <div><div className="ps-kpi-label">Open backend tasks</div><strong style={{ color: TASK_KINDS.backend.color }}>{summary.openBackendTasks ?? 0}</strong></div>
            <div><div className="ps-kpi-label">CLP pending</div><strong style={{ color: 'var(--ps-danger)' }}>{fmt(summary.clpPending)}</strong></div>
          </div>

          <PostSalesFilterBar
            project={project}
            phase={phase}
            building={building}
            onProjectChange={setProject}
            onPhaseChange={setPhase}
            onBuildingChange={setBuilding}
            options={options}
            onClear={clear}
            extra={(
              <select value={taskKind} onChange={(e) => setTaskKind(e.target.value)} aria-label="Work type">
                {WORK_TYPES.map((w) => <option key={w.id || 'all'} value={w.id}>{w.label}</option>)}
              </select>
            )}
          />

          <div className="ps-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Bulk assign</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)', marginTop: 0 }}>
              Applies to filtered units{selected.size ? ` (${selected.size} selected)` : ''}. Leave selection empty to use project / phase / building filters only.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div className="ps-form-group">
                <label>Frontend / CX executive</label>
                <select value={cxExecutive} onChange={(e) => setCxExecutive(e.target.value)}>
                  <option value="">— Select —</option>
                  {cxTeam.map((a) => <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>)}
                </select>
              </div>
              <div className="ps-form-group">
                <label>Backend executive</label>
                <select value={backendExecutive} onChange={(e) => setBackendExecutive(e.target.value)}>
                  <option value="">— Select —</option>
                  {backendTeam.map((a) => <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="ps-btn ps-btn-primary" disabled={busy || !cxExecutive} onClick={() => run((body) => assignExecutives({ ...body, cxExecutive }))}>
                Set CX executive
              </button>
              <button type="button" className="ps-btn ps-btn-primary" disabled={busy || !backendExecutive} onClick={() => run((body) => assignExecutives({ ...body, backendExecutive }))}>
                Set backend executive
              </button>
              <button type="button" className="ps-btn" disabled={busy} onClick={() => run(autoAssign)}>
                Auto-assign open steps from executives
              </button>
            </div>

            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--ps-border)' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div className="ps-form-group">
                <label>Assign open steps — work type</label>
                <select value={assignKind} onChange={(e) => setAssignKind(e.target.value)}>
                  <option value="cx">Frontend / CX</option>
                  <option value="backend">Backend</option>
                </select>
              </div>
              <div className="ps-form-group">
                <label>Assignee</label>
                <select value={assignPerson} onChange={(e) => setAssignPerson(e.target.value)}>
                  <option value="">— Select person —</option>
                  {suggestedPeople.map((a) => <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="ps-btn ps-btn-primary"
              style={{ marginTop: 8 }}
              disabled={busy || !assignPerson}
              onClick={() => run((body) => assignSteps({ ...body, taskKind: assignKind, assignedTo: assignPerson, applyDefaultExecutives: true }))}
            >
              Assign open {assignKind === 'backend' ? 'backend' : 'CX'} steps
            </button>
          </div>

          {error && <div className="ps-error">{error}</div>}
          {loading && <div className="ps-empty">Loading allocation board…</div>}

          {!loading && (
            <div className="ps-card" style={{ padding: 0, overflow: 'auto', marginTop: 16 }}>
              <table className="ps-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={(e) => toggleAll(e.target.checked)} aria-label="Select all" /></th>
                    <th>Unit</th>
                    <th>Project / location</th>
                    <th>CX exec</th>
                    <th>Backend exec</th>
                    <th>Open CX</th>
                    <th>Open backend</th>
                    <th>CLP due</th>
                    <th>Received</th>
                    <th>Pending</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.unitId}>
                      <td><input type="checkbox" checked={selected.has(r.unitId)} onChange={() => toggleRow(r.unitId)} /></td>
                      <td>
                        <strong>{r.unitNumber}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)' }}>{r.customerName}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {r.project}
                        {[r.phase, r.building].filter(Boolean).length ? (
                          <div style={{ color: 'var(--ps-text-muted)' }}>{[r.phase, r.building].filter(Boolean).join(' · ')}</div>
                        ) : null}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{r.cxExecutive || '—'}</td>
                      <td style={{ fontSize: '0.85rem' }}>{r.backendExecutive || '—'}</td>
                      <td><span className="ps-badge" style={{ color: TASK_KINDS.cx.color }}>{r.openCxCount}</span></td>
                      <td><span className="ps-badge" style={{ color: TASK_KINDS.backend.color }}>{r.openBackendCount}</span></td>
                      <td style={{ fontSize: '0.85rem' }}>{fmt(r.clpDue)}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--ps-success)' }}>{fmt(r.clpReceived)}</td>
                      <td style={{ fontSize: '0.85rem', color: r.clpPending > 0 ? 'var(--ps-danger)' : undefined }}>{fmt(r.clpPending)}</td>
                      <td>
                        <Link to={`/app/post-sales/units/${r.unitId}`} className="ps-btn">Pipeline</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <div className="ps-empty">No units match these filters.</div>}
            </div>
          )}
        </>
      )}

      {subTab === 'catalog' && (
        <>
          {catalogError && <div className="ps-error">{catalogError}</div>}
          {catalogLoading && <div className="ps-empty">Loading activity catalog…</div>}

          {!catalogLoading && (
            <>
              <div className="ps-card" style={{ padding: 0, overflow: 'auto', marginBottom: 16 }}>
                <table className="ps-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Activity</th>
                      <th>Phase</th>
                      <th>Role</th>
                      <th>Work type</th>
                      <th>SLA</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((a) => (
                      <tr key={a.number}>
                        <td>{a.number}</td>
                        <td><strong>{a.name}</strong></td>
                        <td style={{ fontSize: '0.85rem' }}>{PHASES[a.phase]?.label || a.phase}</td>
                        <td style={{ fontSize: '0.85rem' }}>{a.assignedRole || '—'}</td>
                        <td>
                          <span className="ps-badge" style={{ color: TASK_KINDS[a.taskKind]?.color || TASK_KINDS.cx.color }}>
                            {a.taskKind === 'backend' ? 'Backend' : 'Frontend / CX'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {a.slaDays ? `${a.slaDays} ${a.slaUnit || 'days'}` : a.slaAck ? `Ack ${a.slaAck}d / ${a.slaResolution}d` : '—'}
                        </td>
                        <td><button type="button" className="ps-btn" onClick={() => startEdit(a)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editForm && (
                <div className="ps-card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Edit step {editForm.number}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div className="ps-form-group"><label>Name</label><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></div>
                    <div className="ps-form-group">
                      <label>Phase</label>
                      <select value={editForm.phase} onChange={(e) => setEditForm((f) => ({ ...f, phase: e.target.value }))}>
                        {Object.entries(PHASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div className="ps-form-group"><label>Assigned role</label><input value={editForm.assignedRole} onChange={(e) => setEditForm((f) => ({ ...f, assignedRole: e.target.value }))} /></div>
                    <div className="ps-form-group">
                      <label>Work type</label>
                      <select value={editForm.taskKind} onChange={(e) => setEditForm((f) => ({ ...f, taskKind: e.target.value }))}>
                        <option value="cx">Frontend / CX</option>
                        <option value="backend">Backend</option>
                      </select>
                    </div>
                    <div className="ps-form-group"><label>SLA days</label><input type="number" value={editForm.slaDays ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, slaDays: e.target.value }))} /></div>
                    <div className="ps-form-group"><label>SLA unit</label><input value={editForm.slaUnit || ''} onChange={(e) => setEditForm((f) => ({ ...f, slaUnit: e.target.value }))} /></div>
                  </div>
                  <div className="ps-form-group"><label>Trigger event</label><input value={editForm.triggerEvent || ''} onChange={(e) => setEditForm((f) => ({ ...f, triggerEvent: e.target.value }))} /></div>
                  <div className="ps-form-group"><label>Checklist (one item per line)</label><textarea rows={5} value={editForm.checklistText || ''} onChange={(e) => setEditForm((f) => ({ ...f, checklistText: e.target.value }))} /></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={saveEdit}>Save activity</button>
                    <button type="button" className="ps-btn" onClick={() => setEditForm(null)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="ps-card">
                <h3 style={{ marginTop: 0 }}>Add new activity</h3>
                <form onSubmit={addActivity}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div className="ps-form-group"><label>Step number (optional)</label><input type="number" min="1" value={newActivity.number} onChange={(e) => setNewActivity((f) => ({ ...f, number: e.target.value }))} placeholder="Auto" /></div>
                    <div className="ps-form-group"><label>Activity name</label><input required value={newActivity.name} onChange={(e) => setNewActivity((f) => ({ ...f, name: e.target.value }))} /></div>
                    <div className="ps-form-group">
                      <label>Phase</label>
                      <select value={newActivity.phase} onChange={(e) => setNewActivity((f) => ({ ...f, phase: e.target.value }))}>
                        {Object.entries(PHASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div className="ps-form-group"><label>Assigned role</label><input value={newActivity.assignedRole} onChange={(e) => setNewActivity((f) => ({ ...f, assignedRole: e.target.value }))} /></div>
                    <div className="ps-form-group">
                      <label>Work type</label>
                      <select value={newActivity.taskKind} onChange={(e) => setNewActivity((f) => ({ ...f, taskKind: e.target.value }))}>
                        <option value="cx">Frontend / CX</option>
                        <option value="backend">Backend</option>
                      </select>
                    </div>
                    <div className="ps-form-group"><label>SLA days</label><input type="number" value={newActivity.slaDays} onChange={(e) => setNewActivity((f) => ({ ...f, slaDays: e.target.value }))} /></div>
                  </div>
                  <div className="ps-form-group"><label>Trigger event</label><input value={newActivity.triggerEvent} onChange={(e) => setNewActivity((f) => ({ ...f, triggerEvent: e.target.value }))} /></div>
                  <div className="ps-form-group"><label>Checklist (one item per line)</label><textarea rows={4} value={newActivity.checklistText} onChange={(e) => setNewActivity((f) => ({ ...f, checklistText: e.target.value }))} /></div>
                  <button type="submit" className="ps-btn ps-btn-primary" disabled={busy}>Add activity</button>
                </form>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
