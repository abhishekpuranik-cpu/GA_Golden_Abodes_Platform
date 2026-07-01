import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { formatDueDate } from '../../lib/postSalesSla.js';
import { isGstDemand } from '../../lib/postsales/demandAmounts.js';
import ActivityLogPanel from './ActivityLogPanel.jsx';
import ChecklistLineDocs from './ChecklistLineDocs.jsx';
import ClpLetterFlowGuide from './ClpLetterFlowGuide.jsx';

const OPEN = new Set(['open', 'in_progress', 'delayed']);
const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  complete: 'Complete',
  delayed: 'Delayed',
};

function statusBadge(status) {
  if (status === 'complete') return 'green';
  if (status === 'delayed') return 'red';
  if (status === 'in_progress') return 'blue';
  return 'grey';
}

export default function ClpLetterQueue({
  unitId,
  actor,
  highlightDemandId,
  onRefresh,
  documents = [],
  uploadDocument,
  onDocRefresh,
  docsMode = false,
}) {
  const [tasks, setTasks] = useState([]);
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('active');
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, demandRes] = await Promise.all([
        postSalesApi.listClpLetterTasksForUnit(unitId),
        postSalesApi.listDemands({ unitId }),
      ]);
      setTasks(taskRes.tasks || []);
      setDemands((demandRes.demands || []).filter((d) => !isGstDemand(d)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (highlightDemandId && tasks.length) {
      const match = tasks.find((t) => String(t.demandId) === String(highlightDemandId));
      if (match) {
        setTab(OPEN.has(match.status) ? 'active' : 'done');
        setExpanded(String(match._id));
      }
    } else if (docsMode && tasks.length) {
      const first = tasks.find((t) => OPEN.has(t.status)) || tasks[0];
      if (first) setExpanded(String(first._id));
    }
  }, [highlightDemandId, tasks, docsMode]);

  const taskByDemand = useMemo(() => {
    const m = new Map();
    for (const t of tasks) m.set(String(t.demandId), t);
    return m;
  }, [tasks]);

  const upcoming = useMemo(
    () => demands.filter((d) => !taskByDemand.has(String(d._id))),
    [demands, taskByDemand],
  );

  const active = useMemo(() => tasks.filter((t) => OPEN.has(t.status)), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.status === 'complete'), [tasks]);
  const visible = tab === 'active' ? active : tab === 'done' ? done : upcoming;

  const patchStatus = async (task, status, note) => {
    setBusyId(task._id);
    setMsg('');
    try {
      const updated = await postSalesApi.updateClpLetterTaskStatus(task._id, { status, note, by: actor });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
      onRefresh?.();
      setMsg(status === 'complete' ? 'CLP letter activity marked complete.' : 'Status updated.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleCheck = async (task, index, doneVal) => {
    setBusyId(task._id);
    setMsg('');
    try {
      const updated = await postSalesApi.toggleClpLetterChecklist(task._id, index, { done: doneVal, by: actor });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const checklistDone = (task) => (task.checklist || []).filter((c) => c.done).length;
  const checklistTotal = (task) => (task.checklist || []).length;

  const renderUpcomingRow = (d) => {
    const task = taskByDemand.get(String(d._id));
    const hasActual = !!d.actualDate;
    return (
      <div key={d._id} className="ps-clp-upcoming-row">
        <div>
          <strong>{d.milestoneName}</strong>
          {d.clpPercent != null ? ` · ${d.clpPercent}%` : ''}
          <div className="ps-reports-muted">
            {hasActual ? `Achieved ${formatDueDate(d.actualDate)}` : 'Awaiting construction actual date'}
          </div>
        </div>
        {task ? (
          <Link to={`?step=12&demandId=${d._id}`} className="ps-btn ps-reports-mini-btn">Open activity</Link>
        ) : hasActual ? (
          <span className="ps-badge ps-badge-amber">Letter task pending</span>
        ) : (
          <Link to="/app/post-sales/demands" className="ps-btn ps-reports-mini-btn">Set actual date</Link>
        )}
      </div>
    );
  };

  return (
    <div className="ps-clp-queue">
      {!docsMode && (
        <ClpLetterFlowGuide
          unitId={unitId}
          hasTasks={tasks.length > 0}
          hasPendingDemands={demands.length > 0}
        />
      )}

      <div className="ps-clp-queue-head">
        <div>
          <strong>{docsMode ? 'Upload documents per milestone checklist' : 'CLP letter activities'}</strong>
          <div className="ps-reports-muted">
            {docsMode
              ? 'Select a milestone below — each checklist line accepts multiple files.'
              : 'One activity per CLP / installment — tick checklist items and attach proof before marking complete.'}
          </div>
        </div>
        <div className="ps-clp-queue-tabs">
          <button type="button" className={`ps-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
            Active ({active.length})
          </button>
          <button type="button" className={`ps-tab ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => setTab('upcoming')}>
            Milestones ({upcoming.length})
          </button>
          <button type="button" className={`ps-tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>
            Done ({done.length})
          </button>
        </div>
      </div>

      {loading && <div className="ps-reports-muted">Loading CLP activities…</div>}
      {error && <div className="ps-error">{error}</div>}
      {msg && <div className="ps-card" style={{ padding: '8px 12px', fontSize: '0.85rem', background: 'var(--ps-accent-soft)' }}>{msg}</div>}

      {!loading && tab === 'upcoming' && (
        <div className="ps-clp-upcoming-list">
          {upcoming.length ? upcoming.map(renderUpcomingRow) : (
            <div className="ps-reports-muted">All milestones have an open or completed letter activity.</div>
          )}
        </div>
      )}

      {!loading && tab !== 'upcoming' && !visible.length && (
        <div className="ps-reports-muted">
          {tab === 'active' ? 'No open CLP letter activities — check Milestones tab or set Actual date in Demands.' : 'No completed letter activities yet.'}
        </div>
      )}

      {tab !== 'upcoming' && visible.map((task) => {
        const open = expanded === String(task._id) || (docsMode && visible.length === 1);
        const doneCount = checklistDone(task);
        const totalCount = checklistTotal(task);
        const canComplete = totalCount === 0 || doneCount === totalCount;
        const frozen = task.status === 'complete';
        return (
          <div key={task._id} className={`ps-clp-queue-card ${open ? 'open' : ''}`}>
            <button type="button" className="ps-clp-queue-card-head" onClick={() => setExpanded(open ? null : String(task._id))}>
              <span>{open ? '▼' : '▶'}</span>
              <span className="ps-clp-queue-title">{task.milestoneName}{task.clpPercent != null ? ` · ${task.clpPercent}%` : ''}</span>
              <span className={`ps-badge ps-badge-${statusBadge(task.status)}`}>{STATUS_LABELS[task.status] || task.status}</span>
              <span className="ps-reports-muted">Due {formatDueDate(task.dueDate)}</span>
              {totalCount > 0 && (
                <span className={`ps-badge ${doneCount === totalCount ? 'ps-badge-green' : 'ps-badge-amber'}`}>
                  {doneCount}/{totalCount} checklist
                </span>
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
                        disabled={busyId === task._id}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'complete') patchStatus(task, 'complete');
                          else if (task.status === 'complete') patchStatus(task, 'in_progress', 'Reopened from complete');
                          else patchStatus(task, 'in_progress');
                        }}
                      >
                        <option value="in_progress">In progress</option>
                        <option value="complete" disabled={!canComplete}>Complete{!canComplete ? ' (checklist)' : ''}</option>
                      </select>
                    </label>
                    {task.assignee && <span className="ps-reports-muted">Assignee: {task.assignee}</span>}
                  </div>
                )}

                {(task.checklist || []).length > 0 && (
                  <div className="ps-clp-queue-checklist">
                    {!docsMode && <strong>Checklist — complete all before marking this milestone done</strong>}
                    {!docsMode && task.checklist.map((item, i) => (
                      <label key={i}>
                        <input
                          type="checkbox"
                          checked={!!item.done}
                          disabled={frozen || busyId === task._id}
                          onChange={(e) => toggleCheck(task, i, e.target.checked)}
                        />
                        <span className={item.done ? 'done' : ''}>{item.item}</span>
                      </label>
                    ))}
                    {uploadDocument && (
                      <ChecklistLineDocs
                        unitId={unitId}
                        stepNumber={12}
                        clpLetterTaskId={task._id}
                        checklist={task.checklist}
                        documents={documents}
                        actor={actor}
                        uploadDocument={uploadDocument}
                        onRefresh={onDocRefresh}
                        disabled={frozen}
                        compact={docsMode}
                      />
                    )}
                  </div>
                )}

                {!docsMode && !frozen && (
                  <button
                    type="button"
                    className="ps-btn ps-btn-primary"
                    disabled={!canComplete || busyId === task._id}
                    onClick={() => patchStatus(task, 'complete')}
                  >
                    Mark milestone complete
                  </button>
                )}

                {!docsMode && (
                  <ActivityLogPanel
                    title="Activity log"
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
