import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PHASES, ESCALATION_MATRIX } from '../../data/postsales/steps.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { formatSlaSummary } from '../../lib/postsales/mergeStepCatalog.js';
import { invalidatePipelineStepDefsCache } from '../../hooks/postsales/usePipelineStepDefs.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';

const SLA_UNITS = [
  'calendar days',
  'working days',
  'calendar days from booking',
  'calendar days from possession',
];

function cloneSteps(steps) {
  return steps.map((s) => ({
    ...s,
    blockedBy: [...(s.blockedBy || [])],
  }));
}

function stepNameByNumber(steps, n) {
  return steps.find((s) => s.number === n)?.name || `Step ${n}`;
}

export default function SlaSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [steps, setSteps] = useState([]);
  const [draft, setDraft] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();

  const [unlocked, setUnlocked] = useState(() => postSalesApi.hasAllocationAdmin());
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postSalesApi.getSlaConfig();
      const list = data.steps || [];
      setSteps(list);
      setDraft(cloneSteps(list));
      setUpdatedAt(data.updatedAt || null);
      setSelected((prev) => prev || list[0]?.number || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(steps) !== JSON.stringify(draft), [steps, draft]);

  const selectedRow = useMemo(
    () => draft.find((s) => s.number === selected) || null,
    [draft, selected],
  );

  const dependencyEdges = useMemo(() => {
    const edges = [];
    for (const s of draft) {
      for (const dep of s.blockedBy || []) {
        edges.push({ from: dep, to: s.number });
      }
    }
    return edges.sort((a, b) => a.to - b.to || a.from - b.from);
  }, [draft]);

  const patchSelected = (patch) => {
    setDraft((prev) => prev.map((s) => (s.number === selected ? { ...s, ...patch } : s)));
  };

  const toggleBlockedBy = (depNum) => {
    if (!selected || depNum === selected) return;
    setDraft((prev) => prev.map((s) => {
      if (s.number !== selected) return s;
      const set = new Set(s.blockedBy || []);
      if (set.has(depNum)) set.delete(depNum);
      else set.add(depNum);
      return { ...s, blockedBy: [...set].sort((a, b) => a - b) };
    }));
  };

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

  const handleSave = async () => {
    if (!unlocked) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const payload = draft.map((s) => ({
        number: s.number,
        slaDays: s.slaDays,
        slaUnit: s.slaUnit,
        slaAck: s.slaAck,
        slaResolution: s.slaResolution,
        triggerEvent: s.triggerEvent,
        blockedBy: s.blockedBy || [],
        escalation: s.escalation || '',
      }));
      const data = await postSalesApi.saveSlaConfig(payload);
      const list = data.steps || [];
      setSteps(list);
      setDraft(cloneSteps(list));
      setUpdatedAt(data.updatedAt || null);
      invalidatePipelineStepDefsCache();
      setMessage('SLA settings saved. Use “Recalculate unit due dates” to apply to existing in-progress and completed main steps.');
    } catch (e) {
      setError(e.message);
      if (e.message?.includes('admin access')) setUnlocked(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    setDraft(cloneSteps(steps));
    setMessage(null);
  };

  const handleRecalculate = async () => {
    if (!unlocked) return;
    const scope = project || phase ? ` for ${[project, phase].filter(Boolean).join(' · ')}` : ' for all units';
    const ok = window.confirm(
      `Recalculate pipeline due dates${scope}?\n\n`
      + '• Updates main process steps (1–11, 13–20) that are in progress, overdue, or completed\n'
      + '• Step 12 (CLP letters) is unchanged\n'
      + '• Demands / CLP collection dates stay as they are\n\n'
      + 'Continue?',
    );
    if (!ok) return;
    setRecalcBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await postSalesApi.recalculatePipelineSlas({
        project: query.project || undefined,
        phase: query.phase || undefined,
      });
      setMessage(
        `Recalculated ${result.unitsProcessed} units — ${result.stepsTouched} steps updated `
        + `(${result.fieldsUpdated} field changes). CLP collection dates untouched.`,
      );
    } catch (e) {
      setError(e.message);
      if (e.message?.includes('admin access')) setUnlocked(false);
    } finally {
      setRecalcBusy(false);
    }
  };

  return (
    <div className="ps-sla-page">
      <div className="ps-page-head">
        <div>
          <h2 className="ps-page-title">Process step SLAs</h2>
          <p className="ps-page-lead">
            Define how long each pipeline step should take, what triggers it, and which earlier steps must finish first.
            These rules drive due dates, My Tasks, and SLA breach alerts on every unit.
          </p>
        </div>
        {updatedAt && (
          <div className="ps-muted" style={{ fontSize: '0.8rem' }}>
            Last saved {new Date(updatedAt).toLocaleString('en-IN')}
          </div>
        )}
      </div>

      {!unlocked && (
        <div className="ps-card ps-sla-admin-gate">
          <h3 style={{ marginTop: 0 }}>Admin access to edit</h3>
          <p className="ps-muted" style={{ marginBottom: 12 }}>
            Anyone can view SLAs. Saving changes uses the same password as{' '}
            <Link to="/app/post-sales/allocation">Work allocation</Link>.
          </p>
          <form className="ps-sla-unlock-form" onSubmit={handleUnlock}>
            <input
              type="password"
              placeholder="Allocation admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="submit" className="ps-btn ps-btn-primary" disabled={authBusy}>
              {authBusy ? 'Checking…' : 'Unlock editing'}
            </button>
          </form>
          {authError && <div className="ps-error">{authError}</div>}
        </div>
      )}

      <PostSalesFilterBar
        project={project}
        phase={phase}
        building={building}
        onProjectChange={setProject}
        onPhaseChange={setPhase}
        onBuildingChange={setBuilding}
        options={options}
        onClear={clear}
      />

      {unlocked && (
        <div className="ps-sla-toolbar">
          <span className="ps-badge ps-badge-blue">Editing unlocked</span>
          <button type="button" className="ps-btn" onClick={() => { postSalesApi.clearAllocationAdmin(); setUnlocked(false); }}>
            Lock
          </button>
          <div className="ps-sla-toolbar-actions">
            <button
              type="button"
              className="ps-btn"
              disabled={recalcBusy}
              onClick={handleRecalculate}
              title="Apply saved SLAs to existing pipeline steps; CLP demands unchanged"
            >
              {recalcBusy ? 'Recalculating…' : 'Recalculate unit due dates'}
            </button>
            <button type="button" className="ps-btn" disabled={!dirty || busy} onClick={handleDiscard}>
              Discard changes
            </button>
            <button type="button" className="ps-btn ps-btn-primary" disabled={!dirty || busy} onClick={handleSave}>
              {busy ? 'Saving…' : 'Save all SLAs'}
            </button>
          </div>
        </div>
      )}

      {message && <div className="ps-success">{message}</div>}
      {error && <div className="ps-error">{error}</div>}
      {loading && <div className="ps-empty">Loading step SLAs…</div>}

      {!loading && draft.length > 0 && (
        <div className="ps-sla-layout">
          <div className="ps-card ps-sla-table-wrap">
            <table className="ps-table ps-sla-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Step</th>
                  <th>Phase</th>
                  <th>SLA</th>
                  <th>Depends on</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {draft.map((s) => (
                  <tr
                    key={s.number}
                    className={selected === s.number ? 'is-selected' : ''}
                    onClick={() => setSelected(s.number)}
                  >
                    <td>{s.number}</td>
                    <td><strong>{s.name}</strong></td>
                    <td className="ps-muted">{PHASES[s.phase]?.label || s.phase}</td>
                    <td>{formatSlaSummary(s)}</td>
                    <td>
                      {(s.blockedBy?.length)
                        ? s.blockedBy.map((n) => (
                          <span key={n} className="ps-sla-dep-chip">{n}</span>
                        ))
                        : '—'}
                    </td>
                    <td className="ps-sla-trigger-cell">{s.triggerEvent || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="ps-card ps-sla-editor">
            {selectedRow ? (
              <>
                <h3 style={{ marginTop: 0 }}>
                  Step {selectedRow.number}: {selectedRow.name}
                </h3>
                <p className="ps-muted" style={{ fontSize: '0.82rem' }}>
                  {PHASES[selectedRow.phase]?.label} · {selectedRow.assignedRole || '—'}
                </p>

                <div className="ps-sla-editor-grid">
                  <label>
                    SLA days
                    <input
                      type="number"
                      min="0"
                      disabled={!unlocked}
                      value={selectedRow.slaDays ?? ''}
                      onChange={(e) => patchSelected({ slaDays: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    SLA unit
                    <select
                      disabled={!unlocked}
                      value={selectedRow.slaUnit || 'working days'}
                      onChange={(e) => patchSelected({ slaUnit: e.target.value })}
                    >
                      {SLA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      {selectedRow.slaUnit && !SLA_UNITS.includes(selectedRow.slaUnit) && (
                        <option value={selectedRow.slaUnit}>{selectedRow.slaUnit}</option>
                      )}
                    </select>
                  </label>
                  <label>
                    Ack SLA (days) — tickets / step 13
                    <input
                      type="number"
                      min="0"
                      disabled={!unlocked}
                      value={selectedRow.slaAck ?? ''}
                      onChange={(e) => patchSelected({ slaAck: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Resolution SLA (days)
                    <input
                      type="number"
                      min="0"
                      disabled={!unlocked}
                      value={selectedRow.slaResolution ?? ''}
                      onChange={(e) => patchSelected({ slaResolution: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>
                </div>

                <label className="ps-sla-field-full">
                  Trigger event
                  <textarea
                    rows={2}
                    disabled={!unlocked}
                    value={selectedRow.triggerEvent || ''}
                    onChange={(e) => patchSelected({ triggerEvent: e.target.value })}
                  />
                </label>

                <label className="ps-sla-field-full">
                  Escalation if breached
                  <select
                    disabled={!unlocked}
                    value={selectedRow.escalation || ''}
                    onChange={(e) => patchSelected({ escalation: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {Object.entries(ESCALATION_MATRIX).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </label>

                <div className="ps-sla-deps-block">
                  <div className="ps-sla-deps-head">
                    <strong>Must complete first (dependencies)</strong>
                    <span className="ps-muted">Select steps that block starting this one</span>
                  </div>
                  <div className="ps-sla-deps-list">
                    {draft
                      .filter((s) => s.number !== selectedRow.number)
                      .map((s) => {
                        const on = (selectedRow.blockedBy || []).includes(s.number);
                        return (
                          <label key={s.number} className={`ps-sla-dep-row${on ? ' is-on' : ''}`}>
                            <input
                              type="checkbox"
                              disabled={!unlocked}
                              checked={on}
                              onChange={() => toggleBlockedBy(s.number)}
                            />
                            <span>
                              <strong>{s.number}.</strong> {s.name}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </>
            ) : (
              <p className="ps-muted">Select a step in the table.</p>
            )}

            {dependencyEdges.length > 0 && (
              <div className="ps-sla-graph">
                <strong>Dependency map</strong>
                <ul>
                  {dependencyEdges.map((e) => (
                    <li key={`${e.from}-${e.to}`}>
                      Step {e.from} ({stepNameByNumber(draft, e.from).slice(0, 36)}
                      {stepNameByNumber(draft, e.from).length > 36 ? '…' : ''})
                      {' → '}
                      <strong>Step {e.to}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
