import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDueDate, slaCountdown } from '../../lib/postSalesSla.js';
import { PHASES } from '../../data/postsales/steps.js';
import { TASK_KINDS } from '../../data/postsales/taskKinds.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import ActivityLogPanel from './ActivityLogPanel.jsx';

function toInputDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

export default function TaskEditDrawer({
  task,
  assignees = [],
  actor = '',
  onClose,
  onSave,
  onComplete,
  onRefresh,
  busy,
}) {
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [status, setStatus] = useState('in_progress');
  const [err, setErr] = useState(null);

  const isClp = task?.taskType === 'clp_letter';

  useEffect(() => {
    if (!task) return;
    setNextAction(task.nextAction || '');
    setNextActionDate(toInputDate(task.nextActionDate));
    setDueDate(toInputDate(task.dueDate));
    setAssignedTo(task.assignedTo || '');
    setChecklist([]);
    setStatus(task.status === 'completed' ? 'complete' : 'in_progress');
    setErr(null);
    if (task.taskType === 'clp_letter' && task.clpLetterTaskId) {
      postSalesApi.getClpLetterTask(task.clpLetterTaskId)
        .then((full) => {
          setChecklist(full.checklist || []);
          setStatus(full.status === 'complete' ? 'complete' : 'in_progress');
          setAssignedTo(full.assignee || task.assignedTo || '');
          setDueDate(toInputDate(full.dueDate || task.dueDate));
        })
        .catch(() => {});
    }
  }, [task]);

  if (!task) return null;

  const kind = TASK_KINDS[task.taskKind] || TASK_KINDS.cx;
  const countdown = slaCountdown(task);
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;
  const canComplete = !checklistTotal || checklistDone === checklistTotal;

  const pipelineLink = isClp
    ? `/app/post-sales/units/${task.unitId}?step=12&demandId=${task.demandId || ''}`
    : `/app/post-sales/units/${task.unitId}?step=${task.stepNumber}`;

  const submit = async () => {
    setErr(null);
    try {
      if (isClp) {
        await postSalesApi.updateClpLetterTask(task.clpLetterTaskId, {
          assignee: assignedTo,
          dueDate: dueDate || undefined,
          by: actor,
        });
        onRefresh?.();
      } else {
        await onSave({
          nextAction,
          nextActionDate: nextActionDate || undefined,
          dueDate: dueDate || undefined,
          assignedTo,
        });
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };

  const complete = async () => {
    setErr(null);
    try {
      if (isClp) {
        if (!canComplete) throw new Error('Complete all checklist items first.');
        await postSalesApi.updateClpLetterTaskStatus(task.clpLetterTaskId, { status: 'complete', by: actor });
        onRefresh?.();
      } else {
        await onComplete();
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };

  const changeStatus = async (next) => {
    setErr(null);
    try {
      if (next === 'complete' && !canComplete) {
        throw new Error('Complete all checklist items before marking done.');
      }
      const apiStatus = next === 'complete' ? 'complete' : 'in_progress';
      await postSalesApi.updateClpLetterTaskStatus(task.clpLetterTaskId, {
        status: apiStatus,
        by: actor,
        note: next === 'in_progress' && status === 'complete' ? 'Reopened from complete' : undefined,
      });
      setStatus(next);
      onRefresh?.();
    } catch (e) {
      setErr(e.message);
    }
  };

  const toggleCheck = async (index, done) => {
    setErr(null);
    try {
      const updated = await postSalesApi.toggleClpLetterChecklist(task.clpLetterTaskId, index, { done, by: actor });
      setChecklist(updated.checklist || []);
    } catch (e) {
      setErr(e.message);
    }
  };

  const fetchLog = useCallback(
    () => postSalesApi.getClpLetterTaskLog(task.clpLetterTaskId).then((r) => r.log),
    [task.clpLetterTaskId],
  );

  return (
    <div className="ps-task-drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="ps-task-drawer" onClick={(e) => e.stopPropagation()} aria-label="Edit task">
        <div className="ps-task-drawer-head">
          <div>
            <div className="ps-task-drawer-kicker">
              {isClp ? `CLP letter · Step ${task.stepNumber}` : `Step ${task.stepNumber}`} · {PHASES[task.pipelinePhase]?.label}
            </div>
            <h3>{isClp ? task.milestoneName || task.stepName : task.stepName}</h3>
          </div>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ps-task-drawer-meta">
          <span className="ps-badge" style={{ background: `${kind.color}22`, color: kind.color, border: `1px solid ${kind.color}55` }}>
            {kind.shortLabel}
          </span>
          <span className={`ps-badge ps-badge-${task.status === 'overdue' ? 'red' : task.status === 'in_progress' || task.status === 'completed' ? 'blue' : 'grey'}`}>
            {(isClp && status === 'complete' ? 'complete' : task.status).replace('_', ' ')}
          </span>
          {countdown && (
            <span className={`ps-badge ps-badge-${countdown.tone === 'danger' ? 'red' : countdown.tone === 'warning' ? 'amber' : 'grey'}`}>
              {countdown.label}
            </span>
          )}
        </div>

        <div className="ps-task-drawer-unit">
          <strong>{task.unitNumber}</strong> · {task.project}
          {[task.phase, task.building].filter(Boolean).length ? ` · ${[task.phase, task.building].filter(Boolean).join(' · ')}` : ''}
          <div className="ps-reports-muted">{task.customerName}</div>
        </div>

        {isClp ? (
          <div className="ps-task-drawer-form">
            <label>
              Activity status
              <select
                value={status === 'complete' ? 'complete' : 'in_progress'}
                disabled={busy}
                onChange={(e) => changeStatus(e.target.value)}
              >
                <option value="in_progress">In progress</option>
                <option value="complete" disabled={!canComplete}>Complete</option>
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label>
              Assigned to
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>
                ))}
              </select>
            </label>
            {checklistTotal > 0 && (
              <div className="ps-clp-queue-checklist">
                <strong>Checklist ({checklistDone}/{checklistTotal})</strong>
                {checklist.map((item, i) => (
                  <label key={i}>
                    <input
                      type="checkbox"
                      checked={!!item.done}
                      disabled={status === 'complete' || busy}
                      onChange={(e) => toggleCheck(i, e.target.checked)}
                    />
                    <span>{item.item}</span>
                  </label>
                ))}
              </div>
            )}
            <ActivityLogPanel title="Activity log" fetchLog={fetchLog} />
          </div>
        ) : (
          <div className="ps-task-drawer-form">
            <label>
              Next action
              <textarea rows={3} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="What needs to happen next?" />
            </label>
            <label>
              Next action date
              <input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
            </label>
            <label>
              Step due date
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label>
              Assigned to
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>
                ))}
              </select>
            </label>
            <div className="ps-reports-muted">SLA target: {task.slaTarget || '—'} · Due {formatDueDate(task.dueDate)}</div>
          </div>
        )}

        {err && <div className="ps-error">{err}</div>}

        <div className="ps-task-drawer-actions">
          <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save changes'}</button>
          {(isClp ? status !== 'complete' : true) && (
            <button type="button" className="ps-btn ps-btn-primary" disabled={busy || (isClp && !canComplete)} onClick={complete}>Mark complete</button>
          )}
          <Link to={pipelineLink} className="ps-btn">Open pipeline</Link>
        </div>
      </aside>
    </div>
  );
}
