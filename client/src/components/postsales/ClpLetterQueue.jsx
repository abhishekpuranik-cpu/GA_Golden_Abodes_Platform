import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { formatDueDate } from '../../lib/postSalesSla.js';
import { compareMilestoneChronology } from '../../lib/postsales/clpMilestoneOrder.js';
import ActivityLogPanel from './ActivityLogPanel.jsx';
import ChecklistLineDocs from './ChecklistLineDocs.jsx';

const STATUS_LABELS = {
  open: 'Not started',
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
  const [demandCount, setDemandCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('todo');
  const [expanded, setExpanded] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const synced = await postSalesApi.syncClpLetterTasksForUnit(unitId, { by: actor || 'Pipeline' });
      setTasks(synced.tasks || []);
      setDemandCount(synced.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [unitId, actor]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () => [...tasks].sort(compareMilestoneChronology),
    [tasks],
  );

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
      if (prev.size && !highlightDemandId) return prev;
      const next = new Set();
      if (highlightDemandId) {
        const match = tasks.find((t) => String(t.demandId) === String(highlightDemandId));
        if (match) next.add(String(match._id));
      } else {
        const firstTodo = [...tasks].sort(compareMilestoneChronology).find((t) => t.status !== 'complete');
        if (firstTodo) next.add(String(firstTodo._id));
      }
      return next;
    });
  }, [tasks, highlightDemandId]);

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
      onRefresh?.();
      setMsg(status === 'complete' ? `${task.milestoneName} marked complete.` : 'Status updated.');
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

  const overallPct = stats.total ? Math.round((stats.complete / stats.total) * 100) : 0;

  return (
    <div className="ps-clp-queue">
      <div className="ps-clp-board-summary">
        <div>
          <strong>{docsMode ? 'Documents by installment' : 'CLP / installment checklists'}</strong>
          <div className="ps-reports-muted">
            Same 10-item checklist repeats for every milestone — work through each installment in order.
          </div>
        </div>
        <div className="ps-clp-board-stats">
          <span className="ps-badge ps-badge-blue">{stats.complete}/{stats.total} installments done</span>
          {stats.todo > 0 && <span className="ps-badge ps-badge-amber">{stats.todo} to do</span>}
        </div>
      </div>

      <div className="ps-progress ps-clp-board-progress">
        <div className="ps-progress-fill" style={{ width: `${overallPct}%` }} />
      </div>
      <div className="ps-reports-muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>{overallPct}% of installments complete</div>

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

      {loading && <div className="ps-reports-muted">Loading installments…</div>}
      {error && <div className="ps-error">{error}</div>}
      {msg && <div className="ps-card" style={{ padding: '8px 12px', fontSize: '0.85rem', background: 'var(--ps-accent-soft)' }}>{msg}</div>}

      {!loading && !demandCount && (
        <div className="ps-card ps-empty">
          <p>No CLP milestone rows for this unit.</p>
          <p style={{ fontSize: '0.85rem' }}>Import collections in <Link to="/app/post-sales/demands">Demands</Link> first — each row becomes an installment checklist here.</p>
        </div>
      )}

      {!loading && demandCount > 0 && !visible.length && (
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

        return (
          <div key={task._id} className={`ps-clp-queue-card ${open ? 'open' : ''} ${frozen ? 'done' : ''}`}>
            <button type="button" className="ps-clp-queue-card-head" onClick={() => toggleExpand(id)}>
              <span className="ps-clp-installment-num">{idx + 1}</span>
              <span>{open ? '▼' : '▶'}</span>
              <span className="ps-clp-queue-title">{task.milestoneName}{task.clpPercent != null ? ` · ${task.clpPercent}%` : ''}</span>
              <span className={`ps-badge ps-badge-${statusBadge(task.status)}`}>{STATUS_LABELS[task.status] || task.status}</span>
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
                        disabled={busyId === task._id}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'complete') patchStatus(task, 'complete');
                          else if (task.status === 'complete') patchStatus(task, 'in_progress', 'Reopened');
                          else patchStatus(task, task.status === 'open' ? 'in_progress' : 'in_progress');
                        }}
                      >
                        <option value="in_progress">{task.status === 'open' ? 'Not started / In progress' : 'In progress'}</option>
                        <option value="complete" disabled={!canComplete}>Complete{!canComplete ? ' — finish checklist' : ''}</option>
                      </select>
                    </label>
                    <span className="ps-reports-muted">Due {formatDueDate(task.dueDate)}</span>
                  </div>
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
                            disabled={frozen || busyId === task._id}
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

                {!docsMode && !frozen && (
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
                    title="Activity log"
                    fetchLog={() => postSalesApi.getClpLetterTaskLog(task._id).then((r) => r.log)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {!docsMode && demandCount > 0 && (
        <p className="ps-reports-muted" style={{ marginTop: 12, fontSize: '0.8rem' }}>
          When construction confirms a milestone, set <strong>Actual date</strong> on that row in{' '}
          <Link to="/app/post-sales/demands">Demands</Link> — the installment moves to In progress automatically.
        </p>
      )}
    </div>
  );
}
