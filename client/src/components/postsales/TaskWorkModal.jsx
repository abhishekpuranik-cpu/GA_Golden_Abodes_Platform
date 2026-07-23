import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDueDate, slaCountdown } from '../../lib/postSalesSla.js';
import { PHASES } from '../../data/postsales/steps.js';
import { TASK_KINDS } from '../../data/postsales/taskKinds.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { dateKey, taskEffectiveDate } from '../../lib/postsales/taskAgenda.js';

function toInputDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

export default function TaskWorkModal({
  task,
  assignees = [],
  actor = '',
  onClose,
  onUpdated,
  onCompleted,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [markComplete, setMarkComplete] = useState(false);

  const isClp = task.taskType === 'clp_letter';

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (isClp) {
        const full = await postSalesApi.getClpLetterTask(task.clpLetterTaskId);
        setDetail(full);
        setNextAction(full.nextAction || task.nextAction || '');
        setNextActionDate(toInputDate(full.nextActionDate || task.nextActionDate));
        setAssignedTo(full.assignee || task.assignedTo || '');
      } else {
        const step = await postSalesApi.getStep(task.unitId, task.stepNumber);
        setDetail(step || null);
        setNextAction(step?.nextAction || task.nextAction || '');
        setNextActionDate(toInputDate(step?.nextActionDate || task.nextActionDate));
        setAssignedTo(step?.assignedTo || task.assignedTo || '');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [isClp, task]);

  useEffect(() => {
    loadDetail();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [loadDetail, onClose]);

  const checklist = detail?.checklist || [];
  const comments = detail?.comments || [];
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;
  const canComplete = !checklistTotal || checklistDone === checklistTotal;
  const frozen = isClp ? detail?.status === 'complete' : detail?.status === 'completed';

  const kind = TASK_KINDS[task.taskKind] || TASK_KINDS.cx;
  const countdown = slaCountdown(task);
  const phaseLabel = PHASES[task.pipelinePhase]?.label || task.pipelinePhase || 'Pipeline';

  const pipelineLink = isClp
    ? `/app/post-sales/units/${task.unitId}?step=12`
    : `/app/post-sales/units/${task.unitId}?step=${task.stepNumber}`;

  const toggleCheck = async (index, doneVal) => {
    setErr(null);
    try {
      if (isClp) {
        const updated = await postSalesApi.toggleClpLetterChecklist(task.clpLetterTaskId, index, { done: doneVal, by: actor });
        setDetail(updated);
      } else {
        const updated = await postSalesApi.toggleChecklist(task.unitId, task.stepNumber, index, { done: doneVal, by: actor });
        setDetail(updated);
      }
    } catch (e) {
      setErr(e.message);
    }
  };

  const completeAllChecklist = async () => {
    if (!isClp) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await postSalesApi.completeAllClpLetterChecklist(task.clpLetterTaskId, { by: actor });
      setDetail(updated);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    const text = commentText.trim();
    const action = nextAction.trim();
    const actionDate = nextActionDate;

    if (markComplete) {
      if (!text && !isClp) {
        setErr('Add a comment when marking complete.');
        return;
      }
    } else if (text && !actionDate) {
      setErr('Next action date is required when adding a comment.');
      return;
    }

    setBusy(true);
    try {
      if (isClp) {
        let updated = detail;
        if (text) {
          updated = await postSalesApi.addClpLetterTaskComment(task.clpLetterTaskId, {
            text,
            nextAction: action,
            nextActionDate: actionDate,
            by: actor,
          });
        } else if (action || actionDate || assignedTo !== (detail?.assignee || task.assignedTo || '')) {
          updated = await postSalesApi.updateClpLetterTask(task.clpLetterTaskId, {
            nextAction: action,
            nextActionDate: actionDate,
            assignee: assignedTo,
            by: actor,
          });
        }
        setDetail(updated);
        setCommentText('');
        onUpdated?.({ ...task, ...updated, nextAction: updated.nextAction, nextActionDate: updated.nextActionDate });

        if (markComplete) {
          if (!canComplete) throw new Error('Complete all checklist items first.');
          await postSalesApi.updateClpLetterTaskStatus(task.clpLetterTaskId, { status: 'complete', by: actor });
          onCompleted?.(task);
          onClose();
          return;
        }
      } else {
        let updated = detail;
        if (text) {
          updated = await postSalesApi.addStepComment(task.unitId, task.stepNumber, { text, by: actor });
        }
        updated = await postSalesApi.updateStep(task.unitId, task.stepNumber, {
          nextAction: action,
          nextActionDate: actionDate || undefined,
          assignedTo,
          by: actor,
        });
        setDetail(updated);
        setCommentText('');
        onUpdated?.({ ...task, ...updated, nextAction: updated.nextAction, nextActionDate: updated.nextActionDate });

        if (markComplete) {
          await postSalesApi.updateStep(task.unitId, task.stepNumber, { status: 'completed', by: actor });
          onCompleted?.(task);
          onClose();
          return;
        }
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!canComplete) {
      setErr('Complete all checklist items first.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (isClp) {
        await postSalesApi.updateClpLetterTaskStatus(task.clpLetterTaskId, { status: 'complete', by: actor });
      } else {
        await postSalesApi.updateStep(task.unitId, task.stepNumber, { status: 'completed', by: actor });
      }
      onCompleted?.(task);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const calendarHint = taskEffectiveDate(task)
    ? `Calendar: ${dateKey(taskEffectiveDate(task))}`
    : null;

  return (
    <div className="ps-task-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="ps-task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ps-task-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ps-task-modal-hero">
          <div className="ps-task-modal-hero-top">
            <div className="ps-task-modal-kicker">
              {isClp ? `CLP · Step ${task.stepNumber}` : `Step ${task.stepNumber}`} · {phaseLabel}
            </div>
            <button type="button" className="ps-task-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <h2 id="ps-task-modal-title" className="ps-task-modal-title">
            {isClp ? (task.milestoneName || task.stepName) : task.stepName}
          </h2>
          <div className="ps-task-modal-chips">
            <span className="ps-badge" style={{ background: `${kind.color}22`, color: kind.color, border: `1px solid ${kind.color}55` }}>
              {kind.shortLabel}
            </span>
            {countdown && (
              <span className={`ps-badge ps-badge-${countdown.tone === 'danger' ? 'red' : countdown.tone === 'warning' ? 'amber' : 'grey'}`}>
                {countdown.label}
              </span>
            )}
            {calendarHint && <span className="ps-badge ps-badge-grey">{calendarHint}</span>}
          </div>
          <div className="ps-task-modal-unit">
            <strong>{task.unitNumber}</strong> · {task.project}
            {[task.phase, task.building].filter(Boolean).length ? ` · ${[task.phase, task.building].filter(Boolean).join(' · ')}` : ''}
            <div className="ps-reports-muted">{task.customerName}</div>
            <div className="ps-reports-muted" style={{ fontSize: '0.72rem', marginTop: 4 }}>
              Due {formatDueDate(task.dueDate)} · SLA {task.slaTarget || '—'}
            </div>
          </div>
        </header>

        <div className="ps-task-modal-body">
          <section className="ps-task-modal-pane">
            <div className="ps-task-modal-pane-head">
              <h3>Comment history</h3>
              <span className="ps-reports-muted">{comments.length} entries</span>
            </div>
            <div className="ps-task-modal-scroll">
              {loading && <div className="ps-reports-muted">Loading…</div>}
              {!loading && !comments.length && (
                <p className="ps-reports-muted">No comments yet — add your first update on the right.</p>
              )}
              {[...comments].reverse().map((c, i) => (
                <div key={i} className="ps-task-modal-comment">
                  <div className="ps-task-modal-comment-meta">
                    {c.at ? new Date(c.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                    {c.by ? ` · ${c.by}` : ''}
                  </div>
                  <div>{c.text}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="ps-task-modal-pane">
            <div className="ps-task-modal-pane-head">
              <h3>Your update</h3>
              <span className="ps-reports-muted">Work here — no need to open Units</span>
            </div>
            <form className="ps-task-modal-form" onSubmit={handleSubmit}>
              <label>
                Comment
                <textarea
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  disabled={busy || frozen}
                  placeholder="Progress update, call notes, handoff…"
                />
              </label>
              {!markComplete && (
                <>
                  <label>
                    Next action
                    <input
                      type="text"
                      value={nextAction}
                      onChange={(e) => setNextAction(e.target.value)}
                      disabled={busy || frozen}
                      placeholder="What needs to happen next?"
                    />
                  </label>
                  <label>
                    Next action date
                    <input
                      type="date"
                      value={nextActionDate}
                      onChange={(e) => setNextActionDate(e.target.value)}
                      disabled={busy || frozen}
                    />
                  </label>
                </>
              )}
              <label>
                Assigned to
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={busy || frozen}>
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>
                  ))}
                </select>
              </label>
              {!frozen && (
                <label className="ps-task-modal-complete-opt">
                  <input type="checkbox" checked={markComplete} onChange={(e) => setMarkComplete(e.target.checked)} disabled={busy} />
                  <span>Mark activity complete on save</span>
                </label>
              )}
              {err && <div className="ps-error">{err}</div>}
              <button type="submit" className="ps-btn ps-btn-primary" disabled={busy || frozen}>
                {busy ? 'Saving…' : markComplete ? 'Save & complete' : 'Save update'}
              </button>
            </form>
          </section>
        </div>

        {checklistTotal > 0 && (
          <section className="ps-task-modal-checklist">
            <div className="ps-task-modal-pane-head">
              <h3>Checklist ({checklistDone}/{checklistTotal})</h3>
              {isClp && !frozen && checklistDone < checklistTotal && (
                <button type="button" className="ps-btn ps-reports-mini-btn" onClick={completeAllChecklist} disabled={busy}>
                  Complete all
                </button>
              )}
            </div>
            <div className="ps-task-modal-checklist-items">
              {checklist.map((item, i) => (
                <label key={i} className={`ps-clp-checklist-row ${item.done ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!item.done}
                    disabled={frozen || busy}
                    onChange={(e) => toggleCheck(i, e.target.checked)}
                  />
                  <span className="ps-clp-checklist-text">{item.item}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        <footer className="ps-task-modal-foot">
          <p className="ps-reports-muted" style={{ margin: 0, flex: 1, fontSize: '0.75rem' }}>
            Saving updates next action date and moves this task on the calendar.
          </p>
          <div className="ps-task-modal-foot-actions">
            {!frozen && (
              <button type="button" className="ps-btn ps-btn-primary" disabled={busy || !canComplete} onClick={handleMarkComplete}>
                Mark complete
              </button>
            )}
            <Link to={pipelineLink} className="ps-btn" onClick={onClose}>Open in pipeline</Link>
            <button type="button" className="ps-btn" onClick={onClose}>Done</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
