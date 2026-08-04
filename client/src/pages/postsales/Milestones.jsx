import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { isUnitSpecificClpMilestone } from '../../lib/postsales/clpCollectionPhase.js';

function toInputDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

function formatSyncSummary(sync) {
  if (!sync) return '';
  if (sync.skipped && sync.reason) return sync.reason;
  const t = sync.totals || {};
  const parts = [];
  if (t.milestones) parts.push(`${t.milestones} milestone(s)`);
  if (t.forecastsUpdated) parts.push(`${t.forecastsUpdated} unit(s) in Reports`);
  if (t.tasksCreated) parts.push(`${t.tasksCreated} Step 12 update(s)`);
  if (sync.unitsAffected) parts.push(`${sync.unitsAffected} unit(s) in scope`);
  if (sync.errors?.length) parts.push(`${sync.errors.length} warning(s)`);
  if (!parts.length) return 'No achieved dates to sync.';
  return parts.join(' · ');
}

function friendlyError(e) {
  const msg = e?.message || String(e);
  if (/timed out|timeout/i.test(msg)) return 'Sync timed out — try filtering to one phase or building, then sync again.';
  if (/E11000|duplicate key/i.test(msg)) return 'Duplicate milestone record — contact support or retry after opening Step 12 on the unit once.';
  if (/network|fetch/i.test(msg)) return 'Network error — check connection and retry.';
  return msg;
}

export default function Milestones() {
  const {
    project, phase, building,
    setProject, setPhase, setBuilding,
    options, loadingOptions, clear,
  } = useInventoryFilters();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncLabel, setSyncLabel] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState(null);
  const [syncErrors, setSyncErrors] = useState([]);
  const fileRef = useRef(null);

  const scopeLabel = [project, phase, building].filter(Boolean).join(' · ') || project;

  const load = useCallback(async () => {
    if (!project) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await postSalesApi.getClpSchedule(project);
      setRows((data.rows || []).map((r) => ({
        _id: r._id,
        milestone: r.milestone || '',
        percentDue: r.percentDue ?? '',
        constructionLinked: r.constructionLinked !== false,
        targetDate: toInputDate(r.targetDate),
        achievedDate: toInputDate(r.achievedDate),
        scheduleOrder: r.scheduleOrder,
      })));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => { load(); }, [load]);

  const updateRow = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, {
      milestone: '',
      percentDue: '',
      constructionLinked: true,
      targetDate: '',
      achievedDate: '',
    }]);
  };

  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const payloadRows = () => rows.map((r, idx) => ({
    milestone: r.milestone,
    percentDue: Number(r.percentDue) || 0,
    constructionLinked: r.constructionLinked,
    targetDate: r.targetDate || undefined,
    achievedDate: r.achievedDate || undefined,
    scheduleOrder: idx,
  }));

  const applySyncResult = (sync, prefix) => {
    setSyncErrors(sync?.errors || []);
    const summary = formatSyncSummary(sync);
    setToast(summary ? `${prefix} ${summary}` : prefix);
    if (sync?.errors?.length) {
      setError(`${sync.errors.length} unit(s) had sync warnings — see list below.`);
    }
  };

  const save = async () => {
    if (!project) return;
    setSaving(true);
    setSyncLabel('Saving schedule…');
    setError(null);
    setSyncErrors([]);
    const t0 = performance.now();
    try {
      const result = await postSalesApi.saveClpSchedule({
        project,
        phase,
        building,
        rows: payloadRows(),
        updatedBy: 'Milestones tab',
      });
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      applySyncResult(result.sync, `Saved in ${secs}s.`);
      setTimeout(() => setToast(''), 10000);
    } catch (e) {
      setError(friendlyError(e));
      setToast('');
    } finally {
      setSaving(false);
      setSyncLabel('');
    }
  };

  const resync = async () => {
    if (!project) return;
    setSaving(true);
    setSyncLabel('Syncing to units…');
    setError(null);
    setSyncErrors([]);
    const t0 = performance.now();
    try {
      const sync = await postSalesApi.syncClpAchievedDates({ project, phase, building, by: 'Milestones tab' });
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      applySyncResult(sync, `Synced in ${secs}s.`);
      setTimeout(() => setToast(''), 10000);
    } catch (e) {
      setError(friendlyError(e));
      setToast('');
    } finally {
      setSaving(false);
      setSyncLabel('');
    }
  };

  const handleUpload = async (file) => {
    if (!file || !project) return;
    setSaving(true);
    setSyncLabel('Importing…');
    setError(null);
    setSyncErrors([]);
    try {
      const r = await postSalesApi.uploadClpScheduleExcel(project, file, { phase, building });
      applySyncResult(r.sync, `Imported ${r.rowCount} row(s).`);
      await load();
      setTimeout(() => setToast(''), 10000);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
      setSyncLabel('');
    }
  };

  return (
    <div className="ps-milestones-page">
      <div className="ps-reports-head">
        <div>
          <h2 style={{ marginTop: 0 }}>CLP Milestone Schedule</h2>
          <p className="ps-reports-sub">
            <strong>Building milestones</strong> (slabs → top floor): set Achieved Date here — applies to all units.
            <strong> Unit milestones</strong> (internal wall onward): set per unit on Unit pipeline → Step 12.
          </p>
        </div>
        <div className="ps-reports-excel-actions">
          <button type="button" className="ps-btn" onClick={() => postSalesApi.downloadClpScheduleTemplate()}>Template</button>
          <button type="button" className="ps-btn" disabled={!project || saving} onClick={() => fileRef.current?.click()}>Upload Excel</button>
          <button type="button" className="ps-btn" disabled={!project || saving} onClick={resync} title="Re-push all achieved dates to units in scope">
            {saving && syncLabel ? syncLabel : 'Sync to units'}
          </button>
          <button type="button" className="ps-btn ps-btn-primary" disabled={!project || saving} onClick={save}>
            {saving && syncLabel ? syncLabel : 'Save & sync'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      <PostSalesFilterBar
        project={project}
        phase={phase}
        building={building}
        onProjectChange={setProject}
        onPhaseChange={setPhase}
        onBuildingChange={setBuilding}
        options={options}
        loadingOptions={loadingOptions}
        onClear={clear}
      />

      {!project && <div className="ps-empty">Select a project to manage its CLP schedule.</div>}
      {loading && project && <div className="ps-empty">Loading CLP schedule…</div>}
      {error && <div className="ps-error">{error}</div>}
      {syncErrors.length > 0 && (
        <div className="ps-card ps-sync-warnings">
          <strong>Sync warnings ({syncErrors.length})</strong>
          <ul className="ps-sync-warn-list">
            {syncErrors.slice(0, 8).map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
          {syncErrors.length > 8 && (
            <p className="ps-reports-muted">…and {syncErrors.length - 8} more. Try syncing one building at a time.</p>
          )}
        </div>
      )}

      {project && !loading && (
        <>
          <p className="ps-reports-muted" style={{ margin: '0 0 10px' }}>
            Sync scope: <strong>{scopeLabel}</strong>
            {building || phase ? ' (filtered — faster sync)' : ' (all units — use filters on large projects)'}
          </p>
          <div className="ps-reports-scroll">
            <table className="ps-table ps-clp-schedule-table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th className="ps-num">Percent % Due</th>
                  <th>Construction-linked?</th>
                  <th>Target Date</th>
                  <th>Achieved Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const unitSpecific = isUnitSpecificClpMilestone(row.milestone);
                  return (
                  <tr key={row._id || idx} className={unitSpecific ? 'ps-clp-schedule-unit-row' : ''}>
                    <td>
                      <input value={row.milestone} onChange={(e) => updateRow(idx, 'milestone', e.target.value)} placeholder="e.g. Slab 5" />
                      {unitSpecific && <span className="ps-clp-phase ps-clp-phase-unit">Per unit</span>}
                    </td>
                    <td><input type="number" className="ps-num" value={row.percentDue} onChange={(e) => updateRow(idx, 'percentDue', e.target.value)} /></td>
                    <td>
                      <select value={row.constructionLinked ? 'Y' : 'N'} onChange={(e) => updateRow(idx, 'constructionLinked', e.target.value === 'Y')}>
                        <option value="Y">Y</option>
                        <option value="N">N</option>
                      </select>
                    </td>
                    <td><input type="date" value={row.targetDate} onChange={(e) => updateRow(idx, 'targetDate', e.target.value)} /></td>
                    <td>
                      <input
                        type="date"
                        value={row.achievedDate}
                        onChange={(e) => updateRow(idx, 'achievedDate', e.target.value)}
                        disabled={unitSpecific}
                        title={unitSpecific ? 'Set on Unit pipeline → Step 12 (per unit)' : 'Save & sync pushes to all units in scope'}
                      />
                    </td>
                    <td><button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => removeRow(idx)}>✕</button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <button type="button" className="ps-btn" style={{ marginTop: 10 }} onClick={addRow}>+ Add milestone</button>
          </div>
        </>
      )}

      {toast && <div className="ps-toast">{toast}</div>}
    </div>
  );
}
