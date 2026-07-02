import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postSalesApi } from '../../lib/postSalesApi.js';
import {
  effectiveAchievedDate,
  fmtClpPercent,
  isTaskEnabled,
} from '../../lib/postsales/clpBookingMilestones.js';
import { formatDueDate } from '../../lib/postSalesSla.js';
import ActivityLogPanel from './ActivityLogPanel.jsx';
import ChecklistLineDocs from './ChecklistLineDocs.jsx';

const STATUS_LABELS = {
  open: 'Waiting for achieved date',
  in_progress: 'In progress',
  complete: 'Complete',
  delayed: 'Delayed',
};

function statusBadge(status, enabled) {
  if (status === 'complete') return 'green';
  if (status === 'delayed') return 'red';
  if (status === 'in_progress' || enabled) return 'blue';
  return 'grey';
}

function statusLabel(task, bookingDate) {
  if (task.status === 'complete') return STATUS_LABELS.complete;
  if (isTaskEnabled(task, bookingDate)) return STATUS_LABELS.in_progress;
  return STATUS_LABELS.open;
}

function taskSort(a, b) {
  const oA = a.scheduleOrder ?? 999;
  const oB = b.scheduleOrder ?? 999;
  if (oA !== oB) return oA - oB;
  return String(a.milestoneName || '').localeCompare(String(b.milestoneName || ''));
}

function fmtAchieved(d) {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClpLetterQueue({
  unitId,
  bookingDate,
  actor,
  highlightMilestone,
  onRefresh,
  documents = [],
  uploadDocument,
  docsMode = false,
}) {
  const [tasks, setTasks] = useState([]);
  const [installmentCount, setInstallmentCount] = useState(0);
  const [loadNote, setLoadNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('todo');
  const [expanded, setExpanded] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setError(null);
    let showedCached = false;
    try {
      const list = await postSalesApi.listClpLetterTasksForUnit(unitId);
      if (list.tasks?.length) {
        setTasks(list.tasks);
        setInstallmentCount(list.tasks.length);
        setLoading(false);
        showedCached = true;
      } else {
        setLoading(true);
      }
      setSyncing(true);
      const synced = await postSalesApi.syncClpLetterTasksForUnit(unitId, { by: actor || 'Pipeline' });
      setTasks(synced.tasks || []);
      setInstallmentCount(synced.total || synced.tasks?.length || 0);
      setLoadNote(synced.message || '');
    } catch (e) {
      if (!showedCached) setError(e.message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [unitId, actor]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => [...tasks].sort(taskSort), [tasks]);

  const stats = useMemo(() => {
    const complete = tasks.filter((t) => t.status === 'complete').length;
    return { complete, total: tasks.length, todo: tasks.length - complete };
  }, [tasks]);

  const visible = useMemo(() => {
    if (filter === 'all') return sorted;
    if (filter === 'done') return sorted.filter((t) => t.status === 'complete');
    return sorted.filter((t) => t.status !== 'complete');
  }, [sorted, filter]);

  useEffect(() => {
    if (!tasks.length) return;
    setExpanded((prev) => {
      if (prev.size && !highlightMilestone) return prev;
      const next = new Set();
      if (highlightMilestone) {
        const slug = String(highlightMilestone).trim().toLowerCase();
        const match = tasks.find((t) => String(t.milestoneName || '').trim().toLowerCase().includes(slug)
          || String(t._id) === slug);
        if (match) next.add(String(match._id));
      } else {
        const firstTodo = [...tasks].sort(taskSort).find((t) => t.status !== 'complete');
        if (firstTodo) next.add(String(firstTodo._id));
      }
      return next;
    });
  }, [tasks, highlightMilestone]);

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(visible.map((t) => String(t._id))));
  const collapseAll = () => setExpanded(new Set());

  const patchStatus = async (task, status, note) => {
    setBusyId(task._id);
    setMsg('');
    try {
      const updated = await postSalesApi.updateClpLetterTaskStatus(task._id, { status, note, by: actor });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
      if (status === 'complete') onRefresh?.();
      setMsg(status === 'complete' ? `${task.milestoneName} marked complete.` : 'Status updated.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleCheck = async (task, index, doneVal) => {
    const snapshot = task;
    setTasks((prev) => prev.map((t) => {
      if (t._id !== task._id) return t;
      const checklist = (t.checklist || []).map((c, i) => (
        i === index ? { ...c, done: doneVal } : c
      ));
      return {
        ...t,
        checklist,
        status: t.status === 'open' ? 'in_progress' : t.status,
      };
    }));
    try {
      const updated = await postSalesApi.toggleClpLetterChecklist(task._id, index, { done: doneVal, by: actor });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? snapshot : t)));
      setMsg(e.message);
    }
  };

  const checklistDone = (task) => (task.checklist || []).filter((c) => c.done).length;
  const checklistTotal = (task) => (task.checklist || []).length;
  const overallPct = stats.total ? Math.round((stats.complete / stats.total) * 100) : 0;

  return (
    <div className="ps-clp-queue">
      <div className="ps-clp-board-summary">
        <div>
          <strong>{docsMode ? 'Documents by installment' : 'CLP / installment checklists'}</strong>
          <div className="ps-reports-muted">
            First {4} milestones use booking date — later ones follow{' '}
            <Link to="/app/post-sales/milestones">Milestones</Link> achieved dates (Reports per unit).
          </div>
        </div>
        <div className="ps-clp-board-stats">
          <span className="ps-badge ps-badge-blue">{stats.complete}/{stats.total} done</span>
          {stats.todo > 0 && <span className="ps-badge ps-badge-amber">{stats.todo} to do</span>}
          {syncing && <span className="ps-reports-muted" style={{ fontSize: '0.75rem' }}>Syncing…</span>}
        </div>
      </div>

      <div className="ps-progress ps-clp-board-progress">
        <div className="ps-progress-fill" style={{ width: `${overallPct}%` }} />
      </div>
      <div className="ps-reports-muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>{overallPct}% complete</div>

      <div className="ps-clp-queue-head">
        <div className="ps-clp-queue-tabs">
          <button type="button" className={`ps-tab ${filter === 'todo' ? 'active' : ''}`} onClick={() => setFilter('todo')}>
            To do ({stats.todo})
          </button>
          <button type="button" className={`ps-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All ({stats.total})
          </button>
          <button type="button" className={`ps-tab ${filter === 'done' ? 'active' : ''}`} onClick={() => setFilter('done')}>
            Done ({stats.complete})
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={expandAll}>Expand all</button>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={collapseAll}>Collapse all</button>
        </div>
      </div>

      {loading && !tasks.length && <div className="ps-reports-muted">Loading installments…</div>}
      {error && <div className="ps-error">{error}</div>}
      {msg && <div className="ps-card" style={{ padding: '8px 12px', fontSize: '0.85rem', background: 'var(--ps-accent-soft)' }}>{msg}</div>}

      {!loading && !installmentCount && (
        <div className="ps-card ps-empty">
          <p>{loadNote || 'No CLP schedule for this project yet.'}</p>
          <p style={{ fontSize: '0.85rem' }}>
            Add milestones on the <Link to="/app/post-sales/milestones">Milestones</Link> tab.
          </p>
        </div>
      )}

      {!loading && installmentCount > 0 && !visible.length && (
        <div className="ps-reports-muted">No installments in this filter — try All or Done.</div>
      )}

      {visible.map((task, idx) => {
        const id = String(task._id);
        const open = expanded.has(id);
        const doneCount = checklistDone(task);
        const totalCount = checklistTotal(task);
        const canComplete = totalCount === 0 || doneCount === totalCount;
        const frozen = task.status === 'complete';
        const linePct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
        const achieved = effectiveAchievedDate(task, bookingDate);
        const enabled = isTaskEnabled(task, bookingDate);
        const achievedLabel = fmtAchieved(achieved);
        const pctLabel = fmtClpPercent(task.clpPercent);

        return (
          <div key={task._id} className={`ps-clp-queue-card ${open ? 'open' : ''} ${frozen ? 'done' : ''}`}>
            <button type="button" className="ps-clp-queue-card-head" onClick={() => toggleExpand(id)}>
              <span className="ps-clp-installment-num">{idx + 1}</span>
              <span>{open ? '▼' : '▶'}</span>
              <span className="ps-clp-queue-title">
                {task.milestoneName}{pctLabel ? ` · ${pctLabel}` : ''}
                {achievedLabel && (
                  <span className="ps-reports-muted">
                    {' · '}
                    {(task.scheduleOrder ?? 999) < 4 && !task.achievedDate && bookingDate ? 'booking ' : 'achieved '}
                    {achievedLabel}
                  </span>
                )}
              </span>
              <span className={`ps-badge ps-badge-${statusBadge(task.status, enabled)}`}>
                {statusLabel(task, bookingDate)}
              </span>
              <span className={`ps-badge ${doneCount === totalCount && totalCount ? 'ps-badge-green' : 'ps-badge-amber'}`}>
                {doneCount}/{totalCount} items
              </span>
              {!open && totalCount > 0 && (
                <span className="ps-clp-mini-progress"><span style={{ width: `${linePct}%` }} /></span>
              )}
            </button>

            {open && (
              <div className="ps-clp-queue-body">
                {!docsMode && (
                  <div className="ps-clp-queue-controls">
                    <label>
                      Status
                      <select
                        value={task.status === 'complete' ? 'complete' : 'in_progress'}
                        disabled={busyId === task._id || !enabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'complete') patchStatus(task, 'complete');
                          else if (task.status === 'complete') patchStatus(task, 'in_progress', 'Reopened');
                          else patchStatus(task, 'in_progress');
                        }}
                      >
                        <option value="in_progress">{enabled ? 'In progress' : 'Waiting for Milestones achieved date'}</option>
                        <option value="complete" disabled={!canComplete || !enabled}>Complete{!canComplete ? ' — finish checklist' : ''}</option>
                      </select>
                    </label>
                    <span className="ps-reports-muted">Due {formatDueDate(task.dueDate)}</span>
                  </div>
                )}

                {!enabled && !docsMode && (
                  <p className="ps-reports-muted" style={{ fontSize: '0.82rem' }}>
                    {(task.scheduleOrder ?? 999) < 4 && !bookingDate
                      ? 'Set booking date on this unit to enable the first four milestones.'
                      : <>Set achieved date on the <Link to="/app/post-sales/milestones">Milestones</Link> tab, then Save &amp; sync.</>}
                  </p>
                )}

                <div className="ps-clp-checklist-block">
                  <div className="ps-clp-checklist-head">
                    <strong>Checklist ({doneCount}/{totalCount})</strong>
                    <div className="ps-progress" style={{ flex: '1 1 120px', maxWidth: 200 }}>
                      <div className="ps-progress-fill" style={{ width: `${linePct}%` }} />
                    </div>
                  </div>
                  {(task.checklist || []).map((item, i) => (
                    <div key={i} className={`ps-clp-checklist-row ${item.done ? 'done' : ''}`}>
                      {!docsMode && (
                        <label className="ps-clp-checklist-check">
                          <input
                            type="checkbox"
                            checked={!!item.done}
                            disabled={frozen || !enabled}
                            onChange={(e) => toggleCheck(task, i, e.target.checked)}
                          />
                        </label>
                      )}
                      <span className="ps-clp-checklist-text">{item.item}</span>
                    </div>
                  ))}
                  {uploadDocument && (
                    <ChecklistLineDocs
                      unitId={unitId}
                      stepNumber={12}
                      clpLetterTaskId={task._id}
                      milestoneName={task.milestoneName}
                      checklist={task.checklist}
                      documents={documents}
                      actor={actor}
                      uploadDocument={uploadDocument}
                      disabled={frozen || !enabled}
                      compact={docsMode}
                    />
                  )}
                </div>

                {!docsMode && !frozen && enabled && (
                  <button
                    type="button"
                    className="ps-btn ps-btn-primary"
                    disabled={!canComplete || busyId === task._id}
                    onClick={() => patchStatus(task, 'complete')}
                  >
                    Mark this installment complete
                  </button>
                )}

                {!docsMode && (
                  <ActivityLogPanel
                    fetchKey={task._id}
                    fetchLog={() => postSalesApi.getClpLetterTaskLog(task._id).then((r) => r.log)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
