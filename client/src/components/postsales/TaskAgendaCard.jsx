import { formatDueDate, slaCountdown } from '../../lib/postSalesSla.js';
import { PHASES } from '../../data/postsales/steps.js';
import { TASK_KINDS } from '../../data/postsales/taskKinds.js';
import { isOverdueTask } from '../../lib/postsales/taskAgenda.js';

function kindStyle(taskKind) {
  const kind = TASK_KINDS[taskKind] || TASK_KINDS.cx;
  return { background: `${kind.color}18`, color: kind.color, borderColor: `${kind.color}44` };
}

export default function TaskAgendaCard({ task, compact = false, dateHint = '', onEdit, onComplete, completing }) {
  const countdown = slaCountdown(task);
  const overdue = isOverdueTask(task);

  return (
    <article className={`ps-task-card ${overdue ? 'overdue' : ''} ${compact ? 'compact' : ''}`}>
      <div className="ps-task-card-top">
        <span className="ps-task-card-step">Step {task.stepNumber}</span>
        <span className="ps-task-card-kind" style={kindStyle(task.taskKind)}>{TASK_KINDS[task.taskKind]?.shortLabel || task.taskKind}</span>
      </div>
      <div className="ps-task-card-title">{task.stepName}</div>
      {!compact && (
        <div className="ps-task-card-unit">
          <strong>{task.unitNumber}</strong> · {task.project} · {task.customerName}
        </div>
      )}
      <div className="ps-task-card-action">{task.nextAction || 'No next action set'}</div>
      <div className="ps-task-card-dates">
        <span>{formatDueDate(task.nextActionDate || task.dueDate)}</span>
        {dateHint ? <span className="ps-reports-muted"> · {dateHint}</span> : null}
        {countdown && (
          <span className={`ps-task-card-sla ps-task-card-sla-${countdown.tone}`}>{countdown.label}</span>
        )}
        {!compact && (
          <span className="ps-reports-muted">{PHASES[task.pipelinePhase]?.label}</span>
        )}
      </div>
      <div className="ps-task-card-actions">
        <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => onEdit(task)}>Edit</button>
        <button
          type="button"
          className="ps-btn ps-reports-mini-btn ps-task-card-done"
          disabled={completing}
          onClick={() => onComplete(task)}
        >
          {completing ? '…' : 'Done'}
        </button>
      </div>
    </article>
  );
}
