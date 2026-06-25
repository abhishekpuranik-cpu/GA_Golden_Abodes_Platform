import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDueDate, slaCountdown } from '../../lib/postSalesSla.js';
import { PHASES } from '../../data/postsales/steps.js';
import { TASK_KINDS } from '../../data/postsales/taskKinds.js';

function toInputDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

export default function TaskEditDrawer({
  task,
  assignees = [],
  onClose,
  onSave,
  onComplete,
  busy,
}) {
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!task) return;
    setNextAction(task.nextAction || '');
    setNextActionDate(toInputDate(task.nextActionDate));
    setDueDate(toInputDate(task.dueDate));
    setAssignedTo(task.assignedTo || '');
    setErr(null);
  }, [task]);

  if (!task) return null;

  const kind = TASK_KINDS[task.taskKind] || TASK_KINDS.cx;
  const countdown = slaCountdown(task);

  const submit = async () => {
    setErr(null);
    try {
      await onSave({
        nextAction,
        nextActionDate: nextActionDate || undefined,
        dueDate: dueDate || undefined,
        assignedTo,
      });
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };

  const complete = async () => {
    setErr(null);
    try {
      await onComplete();
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="ps-task-drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="ps-task-drawer" onClick={(e) => e.stopPropagation()} aria-label="Edit task">
        <div className="ps-task-drawer-head">
          <div>
            <div className="ps-task-drawer-kicker">Step {task.stepNumber} · {PHASES[task.pipelinePhase]?.label}</div>
            <h3>{task.stepName}</h3>
          </div>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ps-task-drawer-meta">
          <span className="ps-badge" style={{ background: `${kind.color}22`, color: kind.color, border: `1px solid ${kind.color}55` }}>
            {kind.shortLabel}
          </span>
          <span className={`ps-badge ps-badge-${task.status === 'overdue' ? 'red' : task.status === 'in_progress' ? 'blue' : 'grey'}`}>
            {task.status.replace('_', ' ')}
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

        {err && <div className="ps-error">{err}</div>}

        <div className="ps-task-drawer-actions">
          <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save changes'}</button>
          <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={complete}>Mark complete</button>
          <Link to={`/app/post-sales/units/${task.unitId}?step=${task.stepNumber}`} className="ps-btn">Open pipeline</Link>
        </div>
      </aside>
    </div>
  );
}
