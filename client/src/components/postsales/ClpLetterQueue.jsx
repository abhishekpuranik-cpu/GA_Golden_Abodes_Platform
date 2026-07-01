import { useCallback, useEffect, useMemo, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { formatDueDate } from '../../lib/postSalesSla.js';
import ActivityLogPanel from './ActivityLogPanel.jsx';

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

export default function ClpLetterQueue({ unitId, actor, highlightDemandId, onRefresh }) {
  const [tasks, setTasks] = useState([]);
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
      const { tasks: rows } = await postSalesApi.listClpLetterTasksForUnit(unitId);
      setTasks(rows || []);
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
    }
  }, [highlightDemandId, tasks]);

  const active = useMemo(() => tasks.filter((t) => OPEN.has(t.status)), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.status === 'complete'), [tasks]);
  const visible = tab === 'active' ? active : done;

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

  return (
    <div className="ps-clp-queue">
      <div className="ps-clp-queue-head">
        <div>
          <strong>CLP letter activities</strong>
          <div className="ps-reports-muted">One activity per milestone — complete checklist before marking done.</div>
        </div>
        <div className="ps-clp-queue-tabs">
          <button type="button" className={`ps-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
            Active ({active.length})
          </button>
          <button type="button" className={`ps-tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>
            Done ({done.length})
          </button>
        </div>
      </div>

      {loading && <div className="ps-reports-muted">Loading CLP activities…</div>}
      {error && <div className="ps-error">{error}</div>}
      {msg && <div className="ps-card" style={{ padding: '8px 12px', fontSize: '0.85rem', background: 'var(--ps-accent-soft)' }}>{msg}</div>}

      {!loading && !visible.length && (
        <div className="ps-reports-muted">{tab === 'active' ? 'No open CLP letter activities.' : 'No completed letter activities yet.'}</div>
      )}

      {visible.map((task) => {
        const open = expanded === String(task._id);
        const doneCount = checklistDone(task);
        const totalCount = checklistTotal(task);
        const canComplete = totalCount === 0 || doneCount === totalCount;
        return (
          <div key={task._id} className={`ps-clp-queue-card ${open ? 'open' : ''}`}>
            <button type="button" className="ps-clp-queue-card-head" onClick={() => setExpanded(open ? null : String(task._id))}>
              <span>{open ? '▼' : '▶'}</span>
              <span className="ps-clp-queue-title">{task.milestoneName}{task.clpPercent != null ? ` · ${task.clpPercent}%` : ''}</span>
              <span className={`ps-badge ps-badge-${statusBadge(task.status)}`}>{STATUS_LABELS[task.status] || task.status}</span>
              <span className="ps-reports-muted">Due {formatDueDate(task.dueDate)}</span>
              {totalCount > 0 && (
                <span className="ps-reports-muted">{doneCount}/{totalCount} checklist</span>
              )}
            </button>

            {open && (
              <div className="ps-clp-queue-body">
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

                {(task.checklist || []).length > 0 && (
                  <div className="ps-clp-queue-checklist">
                    <strong>Checklist</strong>
                    {task.checklist.map((item, i) => (
                      <label key={i}>
                        <input
                          type="checkbox"
                          checked={!!item.done}
                          disabled={task.status === 'complete' || busyId === task._id}
                          onChange={(e) => toggleCheck(task, i, e.target.checked)}
                        />
                        <span>{item.item}</span>
                      </label>
                    ))}
                  </div>
                )}

                {task.status !== 'complete' && (
                  <button
                    type="button"
                    className="ps-btn ps-btn-primary"
                    disabled={!canComplete || busyId === task._id}
                    onClick={() => patchStatus(task, 'complete')}
                  >
                    Mark complete
                  </button>
                )}

                <ActivityLogPanel
                  title="Activity log"
                  fetchLog={() => postSalesApi.getClpLetterTaskLog(task._id).then((r) => r.log)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
