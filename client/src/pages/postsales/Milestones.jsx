import { useCallback, useEffect, useRef, useState } from 'react';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { postSalesApi } from '../../lib/postSalesApi.js';

function toInputDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

export default function Milestones() {
  const { project, setProject, options } = useInventoryFilters();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

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
      setError(e.message);
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

  const save = async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      await postSalesApi.saveClpSchedule({
        project,
        rows: rows.map((r, idx) => ({
          milestone: r.milestone,
          percentDue: Number(r.percentDue) || 0,
          constructionLinked: r.constructionLinked,
          targetDate: r.targetDate || undefined,
          achievedDate: r.achievedDate || undefined,
          scheduleOrder: idx,
        })),
      });
      setToast('CLP schedule saved.');
      await load();
      setTimeout(() => setToast(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onAchievedBlur = async (row, idx) => {
    if (!row.achievedDate || !row.constructionLinked) return;
    const prev = rows[idx]?.achievedDate;
    if (prev === row.achievedDate) return;
    const ok = window.confirm(
      `Achieved date entered for "${row.milestone}". Create Demand Tasks for all eligible units in ${project}?`,
    );
    if (!ok) return;
    try {
      const saved = await postSalesApi.saveClpSchedule({ project, rows: rows.map((r, i) => ({
        milestone: r.milestone,
        percentDue: Number(r.percentDue) || 0,
        constructionLinked: r.constructionLinked,
        targetDate: r.targetDate || undefined,
        achievedDate: r.achievedDate || undefined,
        scheduleOrder: i,
      })) });
      const savedRow = saved.rows?.find((r) => r.milestone === row.milestone && toInputDate(r.achievedDate) === row.achievedDate);
      if (!savedRow?._id) {
        setToast('Save schedule first, then retry demand trigger.');
        return;
      }
      const result = await postSalesApi.triggerClpDemandTasks({ project, rowId: savedRow._id });
      if (result.skipped) {
        setToast(result.reason || 'Demand tasks skipped.');
      } else {
        setToast(`${result.tasksCreated ?? 0} CLP task(s) · ${result.demandsCreated ?? 0} demand(s) across ${result.unitsAffected ?? 0} unit(s).`);
      }
      setTimeout(() => setToast(''), 6000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleUpload = async (file) => {
    if (!file || !project) return;
    setSaving(true);
    try {
      const r = await postSalesApi.uploadClpScheduleExcel(project, file);
      setToast(`Imported ${r.rowCount} milestone row(s).`);
      await load();
      setTimeout(() => setToast(''), 5000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ps-milestones-page">
      <div className="ps-reports-head">
        <div>
          <h2 style={{ marginTop: 0 }}>CLP Milestone Schedule</h2>
          <p className="ps-reports-sub">
            Upload or maintain project-level CLP schedule. When an Achieved Date is entered for a construction-linked milestone, you can auto-create Demand Tasks for all eligible units.
          </p>
        </div>
        <div className="ps-reports-excel-actions">
          <button type="button" className="ps-btn" onClick={() => postSalesApi.downloadClpScheduleTemplate()}>Template</button>
          <button type="button" className="ps-btn" disabled={!project || saving} onClick={() => fileRef.current?.click()}>Upload Excel</button>
          <button type="button" className="ps-btn ps-btn-primary" disabled={!project || saving} onClick={save}>{saving ? 'Saving…' : 'Save schedule'}</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      <PostSalesFilterBar
        project={project}
        phase=""
        building=""
        onProjectChange={setProject}
        onPhaseChange={() => {}}
        onBuildingChange={() => {}}
        options={options}
        onClear={() => setProject('')}
      />

      {!project && <div className="ps-empty">Select a project to manage its CLP schedule.</div>}
      {loading && project && <div className="ps-empty">Loading CLP schedule…</div>}
      {error && <div className="ps-error">{error}</div>}

      {project && !loading && (
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
              {rows.map((row, idx) => (
                <tr key={row._id || idx}>
                  <td><input value={row.milestone} onChange={(e) => updateRow(idx, 'milestone', e.target.value)} placeholder="e.g. Slab 5" /></td>
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
                      onBlur={() => onAchievedBlur(rows[idx], idx)}
                    />
                  </td>
                  <td><button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => removeRow(idx)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="ps-btn" style={{ marginTop: 10 }} onClick={addRow}>+ Add milestone</button>
        </div>
      )}

      {toast && <div className="ps-toast">{toast}</div>}
    </div>
  );
}
