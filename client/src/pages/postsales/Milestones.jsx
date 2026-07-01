import { useCallback, useEffect, useRef, useState } from 'react';

import { Link } from 'react-router-dom';

import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';

import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';

import { postSalesApi } from '../../lib/postSalesApi.js';



function toInputDate(d) {

  if (!d) return '';

  const x = new Date(d);

  if (Number.isNaN(x.getTime())) return '';

  return x.toISOString().slice(0, 10);

}



function formatSyncSummary(sync) {

  if (!sync?.totals) return '';

  const t = sync.totals;

  const parts = [];

  if (t.milestones) parts.push(`${t.milestones} milestone(s)`);

  if (t.forecastsUpdated) parts.push(`${t.forecastsUpdated} unit date(s) in Reports`);

  if (t.tasksCreated) parts.push(`${t.tasksCreated} Step 12 checklist(s)`);

  return parts.length ? parts.join(' · ') : 'No achieved dates to sync yet.';

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

  const [toast, setToast] = useState('');

  const [error, setError] = useState(null);

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



  const payloadRows = () => rows.map((r, idx) => ({

    milestone: r.milestone,

    percentDue: Number(r.percentDue) || 0,

    constructionLinked: r.constructionLinked,

    targetDate: r.targetDate || undefined,

    achievedDate: r.achievedDate || undefined,

    scheduleOrder: idx,

  }));



  const save = async () => {

    if (!project) return;

    setSaving(true);

    setError(null);

    try {

      const result = await postSalesApi.saveClpSchedule({

        project,

        phase,

        building,

        rows: payloadRows(),

        updatedBy: 'Milestones tab',

      });

      setToast(`Saved. ${formatSyncSummary(result.sync)}`);

      await load();

      setTimeout(() => setToast(''), 8000);

    } catch (e) {

      setError(e.message);

    } finally {

      setSaving(false);

    }

  };



  const resync = async () => {

    if (!project) return;

    setSaving(true);

    setError(null);

    try {

      const sync = await postSalesApi.syncClpAchievedDates({ project, phase, building, by: 'Milestones tab' });

      setToast(`Synced. ${formatSyncSummary(sync)}`);

      setTimeout(() => setToast(''), 8000);

    } catch (e) {

      setError(e.message);

    } finally {

      setSaving(false);

    }

  };



  const handleUpload = async (file) => {

    if (!file || !project) return;

    setSaving(true);

    try {

      const r = await postSalesApi.uploadClpScheduleExcel(project, file, { phase, building });

      setToast(`Imported ${r.rowCount} row(s). ${formatSyncSummary(r.sync)}`);

      await load();

      setTimeout(() => setToast(''), 8000);

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

            Enter <strong>Achieved Date</strong>, then <strong>Save &amp; sync</strong> — dates update every unit in{' '}
            <Link to="/app/post-sales/reports">Reports</Link>; Step 12 shows one checklist per milestone.
            Payments stay on the Demands tab (separate).

          </p>

        </div>

        <div className="ps-reports-excel-actions">

          <button type="button" className="ps-btn" onClick={() => postSalesApi.downloadClpScheduleTemplate()}>Template</button>

          <button type="button" className="ps-btn" disabled={!project || saving} onClick={() => fileRef.current?.click()}>Upload Excel</button>

          <button type="button" className="ps-btn" disabled={!project || saving} onClick={resync}>Sync to units</button>

          <button type="button" className="ps-btn ps-btn-primary" disabled={!project || saving} onClick={save}>{saving ? 'Saving…' : 'Save & sync'}</button>

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



      {project && !loading && (

        <>

          <p className="ps-reports-muted" style={{ margin: '0 0 10px' }}>

            Sync scope: <strong>{scopeLabel}</strong>

            {building || phase ? ' (filtered units only)' : ' (all units in project)'}

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

                        title="Save & sync pushes this date to Reports and Step 12 for all matching units"

                      />

                    </td>

                    <td><button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => removeRow(idx)}>✕</button></td>

                  </tr>

                ))}

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


