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
  open: 'Waiting',
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

function fmtDateInput(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

function SlabNotesForm({ task, actor, frozen, enabled, onSaved }) {
  const [commentText, setCommentText] = useState('');
  const [nextAction, setNextAction] = useState(task.nextAction || '');
  const [nextActionDate, setNextActionDate] = useState(fmtDateInput(task.nextActionDate));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setNextAction(task.nextAction || '');
    setNextActionDate(fmtDateInput(task.nextActionDate));
  }, [task._id, task.nextAction, task.nextActionDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    const text = commentText.trim();
    if (!text && !nextAction.trim() && !nextActionDate) {
      setErr('Add a comment or next action details.');
      return;
    }
    if (text && !nextActionDate) {
      setErr('Next action date is required when adding a comment.');
      return;
    }
    setSaving(true);
    try {
      let updated = task;
      if (text) {
        updated = await postSalesApi.addClpLetterTaskComment(task._id, {
          text,
          nextAction: nextAction.trim(),
          nextActionDate,
          by: actor,
        });
      } else {
        updated = await postSalesApi.updateClpLetterTask(task._id, {
          nextAction: nextAction.trim(),
          nextActionDate,
          by: actor,
        });
      }
      setCommentText('');
      onSaved?.(updated);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const comments = task.comments || [];

  return (
    <form className="ps-clp-slab-notes" onSubmit={handleSubmit}>
      {comments.length > 0 && (
        <div className="ps-clp-slab-comments">
          {[...comments].reverse().slice(0, 4).map((c, i) => (
            <div key={i} className="ps-clp-slab-comment">
              <span className="ps-clp-slab-comment-meta">
                {c.at ? new Date(c.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                {c.by ? ` · ${c.by}` : ''}
              </span>
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ps-clp-slab-notes-grid">
        <label>
          Comment
          <textarea
            rows={2}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            disabled={frozen || !enabled || saving}
            placeholder="Call notes, customer update…"
          />
        </label>
        <label>
          Next action
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            disabled={frozen || !enabled || saving}
            placeholder="What happens next?"
          />
        </label>
        <label>
          Next action date
          <input
            type="date"
            value={nextActionDate}
            onChange={(e) => setNextActionDate(e.target.value)}
            disabled={frozen || !enabled || saving}
          />
        </label>
      </div>
      {err && <div className="ps-error ps-clp-slab-notes-err">{err}</div>}
      <button
        type="submit"
        className="ps-btn ps-reports-mini-btn"
        disabled={frozen || !enabled || saving}
      >
        {saving ? 'Saving…' : 'Save notes'}
      </button>
    </form>
  );
}

function mergeTaskLists(prev, incoming) {
  if (!prev?.length) return incoming || [];
  if (!incoming?.length) return prev;
  const prevById = new Map(prev.map((t) => [String(t._id), t]));
  return incoming.map((remote) => {
    const local = prevById.get(String(remote._id));
    if (!local?.checklist?.length) return remote;
    const mergedChecklist = (remote.checklist || []).map((item, i) => {
      const localItem = local.checklist[i];
      if (localItem?.done && !item.done) {
        return { ...item, done: true, doneAt: localItem.doneAt, doneBy: localItem.doneBy };
      }
      return item;
    });
    return { ...remote, checklist: mergedChecklist };
  });
}

export default function ClpLetterQueue({
  unitId,
  bookingDate,
  actor,
  highlightMilestone,
  onRefresh,
  reloadToken = 0,
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

  const load = useCallback(async ({ sync = false } = {}) => {
    if (!unitId) return;
    setError(null);
    setLoading(true);
    try {
      const list = await postSalesApi.listClpLetterTasksForUnit(unitId);
      setTasks((prev) => mergeTaskLists(prev, list.tasks || []));
      setInstallmentCount(list.tasks?.length || 0);

      if (sync || !(list.tasks?.length)) {
        setSyncing(true);
        const synced = await postSalesApi.syncClpLetterTasksForUnit(unitId, { by: actor || 'Pipeline' });
        setTasks((prev) => mergeTaskLists(prev, synced.tasks || []));
        setInstallmentCount(synced.total || synced.tasks?.length || 0);
        setLoadNote(synced.message || '');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [unitId, actor]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (reloadToken > 0) load({ sync: true });
  }, [reloadToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (status === 'complete') onRefresh?.(updated);
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
      return { ...t, checklist, status: t.status === 'open' ? 'in_progress' : t.status };
    }));
    try {
      const updated = await postSalesApi.toggleClpLetterChecklist(task._id, index, { done: doneVal, by: actor });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? snapshot : t)));
      setMsg(e.message);
    }
  };

  const completeAllChecklist = async (task) => {
    setBusyId(task._id);
    setMsg('');
    try {
      const updated = await postSalesApi.completeAllClpLetterChecklist(task._id, { by: actor });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)));
      setMsg(`All checklist items marked for ${task.milestoneName}.`);
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
    <div className="ps-clp-queue ps-clp-queue--slim">
      <div className="ps-clp-board-summary">
        <div>
          <strong>{docsMode ? 'Documents by installment' : 'CLP installments'}</strong>
          <div className="ps-clp-board-hint">
            First 4 use booking date · later from <Link to="/app/post-sales/milestones">Milestones</Link>
          </div>
        </div>
        <div className="ps-clp-board-stats">
          <span className="ps-badge ps-badge-blue">{stats.complete}/{stats.total}</span>
          {stats.todo > 0 && <span className="ps-badge ps-badge-amber">{stats.todo} open</span>}
          {syncing && <span className="ps-clp-sync-hint">Syncing…</span>}
        </div>
      </div>

      <div className="ps-progress ps-clp-board-progress">
        <div className="ps-progress-fill" style={{ width: `${overallPct}%` }} />
      </div>

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
        <div className="ps-clp-queue-head-actions">
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => load({ sync: true })} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync CLP'}
          </button>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={expandAll}>Expand</button>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={collapseAll}>Collapse</button>
        </div>
      </div>

      {loading && !tasks.length && <div className="ps-reports-muted">Loading installments…</div>}
      {error && <div className="ps-error">{error}</div>}
      {msg && <div className="ps-clp-msg">{msg}</div>}

      {!loading && !installmentCount && (
        <div className="ps-card ps-empty">
          <p>{loadNote || 'No CLP schedule for this project yet.'}</p>
          <p className="ps-clp-board-hint">Add milestones on the <Link to="/app/post-sales/milestones">Milestones</Link> tab.</p>
        </div>
      )}

      {!loading && installmentCount > 0 && !visible.length && (
        <div className="ps-reports-muted">No installments in this filter.</div>
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
        const allDone = totalCount > 0 && doneCount === totalCount;

        return (
          <div key={task._id} className={`ps-clp-queue-card ${open ? 'open' : ''} ${frozen ? 'done' : ''}`}>
            <button type="button" className="ps-clp-queue-card-head" onClick={() => toggleExpand(id)}>
              <span className="ps-clp-installment-num">{idx + 1}</span>
              <span className="ps-clp-chevron">{open ? '▼' : '▶'}</span>
              <span className="ps-clp-queue-title">
                {task.milestoneName}{pctLabel ? ` · ${pctLabel}` : ''}
                {achievedLabel && (
                  <span className="ps-clp-title-meta">
                    {(task.scheduleOrder ?? 999) < 4 && !task.achievedDate && bookingDate ? 'booking ' : ''}
                    {achievedLabel}
                  </span>
                )}
              </span>
              <span className={`ps-badge ps-badge-${statusBadge(task.status, enabled)}`}>
                {statusLabel(task, bookingDate)}
              </span>
              <span className={`ps-badge ${allDone ? 'ps-badge-green' : 'ps-badge-amber'}`}>
                {doneCount}/{totalCount}
              </span>
              {!open && totalCount > 0 && (
                <span className="ps-clp-mini-progress"><span style={{ width: `${linePct}%` }} /></span>
              )}
            </button>

            {open && (
              <div className="ps-clp-queue-body">
                {!docsMode && (
                  <>
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
                          <option value="in_progress">{enabled ? 'In progress' : 'Waiting for achieved date'}</option>
                          <option value="complete" disabled={!canComplete || !enabled}>
                            Complete{!canComplete ? ' — finish checklist' : ''}
                          </option>
                        </select>
                      </label>
                      <span className="ps-clp-due">Due {formatDueDate(task.dueDate)}</span>
                    </div>

                    {!enabled && (
                      <p className="ps-clp-enable-hint">
                        {(task.scheduleOrder ?? 999) < 4 && !bookingDate
                          ? 'Set booking date on this unit to enable the first four milestones.'
                          : <>Set achieved date on <Link to="/app/post-sales/milestones">Milestones</Link>, then Save &amp; sync.</>}
                      </p>
                    )}

                    <SlabNotesForm
                      task={task}
                      actor={actor}
                      frozen={frozen}
                      enabled={enabled}
                      onSaved={(updated) => setTasks((prev) => prev.map((t) => (t._id === task._id ? updated : t)))}
                    />
                  </>
                )}

                <div className="ps-clp-checklist-block">
                  <div className="ps-clp-checklist-head">
                    <span>Checklist {doneCount}/{totalCount}</span>
                    <div className="ps-progress ps-clp-checklist-progress">
                      <div className="ps-progress-fill" style={{ width: `${linePct}%` }} />
                    </div>
                    {!docsMode && !frozen && enabled && !allDone && (
                      <button
                        type="button"
                        className="ps-btn ps-reports-mini-btn ps-clp-complete-all"
                        disabled={busyId === task._id}
                        onClick={() => completeAllChecklist(task)}
                      >
                        Complete all
                      </button>
                    )}
                  </div>

                  <div className="ps-clp-checklist-items">
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
                  </div>

                  {uploadDocument && (
                    <details className="ps-clp-docs-details">
                      <summary>Attachments</summary>
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
                    </details>
                  )}
                </div>

                {!docsMode && !frozen && enabled && (
                  <button
                    type="button"
                    className="ps-btn ps-btn-primary ps-clp-mark-done"
                    disabled={!canComplete || busyId === task._id}
                    onClick={() => patchStatus(task, 'complete')}
                  >
                    Mark installment complete
                  </button>
                )}

                {!docsMode && (
                  <details className="ps-clp-log-details">
                    <summary>Activity log</summary>
                    <ActivityLogPanel
                      fetchKey={task._id}
                      fetchLog={() => postSalesApi.getClpLetterTaskLog(task._id).then((r) => r.log)}
                    />
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
