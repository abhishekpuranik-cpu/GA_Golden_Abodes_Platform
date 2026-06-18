import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllocation } from '../../hooks/postsales/useAllocation.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import { useAssignees } from '../../hooks/postsales/useMyTasks.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { TASK_KINDS } from '../../data/postsales/taskKinds.js';

const WORK_TYPES = [
  { id: '', label: 'All work types' },
  { id: 'cx', label: 'Frontend / CX (customer)' },
  { id: 'backend', label: 'Backend (coordination)' },
];

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function WorkAllocation() {
  const [taskKind, setTaskKind] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [cxExecutive, setCxExecutive] = useState('');
  const [backendExecutive, setBackendExecutive] = useState('');
  const [assignPerson, setAssignPerson] = useState('');
  const [assignKind, setAssignKind] = useState('cx');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const filters = useMemo(() => ({ ...query, ...(taskKind ? { taskKind } : {}) }), [query, taskKind]);
  const { rows, summary, loading, error, assignExecutives, assignSteps, autoAssign } = useAllocation(filters);
  const { assignees, cxTeam, backendTeam } = useAssignees();

  const suggestedPeople = assignKind === 'backend' ? backendTeam : cxTeam;

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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Work allocation</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--ps-text-muted)', fontSize: '0.9rem' }}>
            Assign frontend (CX) and backend executives by project, location, and work type. CLP due / received / pending comes from the Demands tab.
          </p>
        </div>
        <Link to="/app/post-sales/demands" className="ps-btn">Open Demands data →</Link>
      </div>

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

      {message && <div className="ps-card" style={{ marginTop: 12, background: 'var(--ps-accent-soft)' }}>{message}</div>}
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
    </div>
  );
}
