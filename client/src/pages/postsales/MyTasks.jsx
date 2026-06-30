import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMyTasks, useAssignees } from '../../hooks/postsales/useMyTasks.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import ActivityCalendarShell from '../../components/postsales/ActivityCalendarShell.jsx';
import TaskAgendaCard from '../../components/postsales/TaskAgendaCard.jsx';
import TaskEditDrawer from '../../components/postsales/TaskEditDrawer.jsx';
import { TASK_KINDS } from '../../data/postsales/taskKinds.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { parseYmd, todayYmd } from '../../lib/postsales/activityCalendarUtils.js';
import {
  calendarDateLabel,
  dateKey,
  formatDayLabel,
  isOverdueTask,
  startOfDay,
  taskAnchorDate,
  taskCalendarDates,
  taskMatchesCalendarDay,
} from '../../lib/postsales/taskAgenda.js';

const KIND_TABS = [
  { id: '', label: 'All tasks' },
  { id: 'cx', label: 'CX' },
  { id: 'backend', label: 'Backend' },
];

const LEGEND = [
  { label: 'Overdue', color: '#B32E1E' },
  { label: 'CX', color: TASK_KINDS.cx.color },
  { label: 'Backend', color: TASK_KINDS.backend.color },
];

function taskTitle(task) {
  return `Step ${task.stepNumber} · ${task.unitNumber} · ${task.stepName}`;
}

function taskColor(task) {
  if (isOverdueTask(task)) return '#B32E1E';
  return TASK_KINDS[task.taskKind]?.color || '#185FA5';
}

export default function MyTasks() {
  const { user } = useOutletContext() || {};
  const actor = user?.name || user?.email || '';
  const [view, setView] = useState('month');
  const [cursorDate, setCursorDate] = useState(() => startOfDay(new Date()));
  const [selectedYmd, setSelectedYmd] = useState(todayYmd());
  const [taskKind, setTaskKind] = useState('');
  const [editTask, setEditTask] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [toast, setToast] = useState('');

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const filters = useMemo(() => ({ ...query, ...(taskKind ? { taskKind } : {}) }), [query, taskKind]);
  const { tasks, assignee, cxCount, backendCount, loading, error, refresh, setTasks } = useMyTasks(filters);
  const { assignees } = useAssignees();

  const scheduled = useMemo(
    () => tasks.filter((t) => taskCalendarDates(t).length > 0),
    [tasks],
  );
  const unscheduled = useMemo(
    () => tasks.filter((t) => !taskCalendarDates(t).length),
    [tasks],
  );

  const stats = useMemo(() => {
    const today = dateKey(new Date());
    const overdue = scheduled.filter((t) => isOverdueTask(t));
    const dueToday = scheduled.filter((t) => taskCalendarDates(t).includes(today)).length;
    return {
      total: tasks.length,
      overdue: overdue.length,
      dueToday,
      unscheduled: unscheduled.length,
    };
  }, [tasks, scheduled, unscheduled]);

  const selectedDayTasks = useMemo(() => {
    if (!selectedYmd) return [];
    return scheduled.filter((t) => taskMatchesCalendarDay(t, selectedYmd));
  }, [scheduled, selectedYmd]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleComplete = async (task) => {
    setBusyId(task._id);
    try {
      await postSalesApi.updateStep(task.unitId, task.stepNumber, { status: 'completed', by: actor });
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
      showToast(`Step ${task.stepNumber} marked complete.`);
    } catch (e) {
      showToast(e.message);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (body) => {
    if (!editTask) return;
    setDrawerBusy(true);
    try {
      const updated = await postSalesApi.updateStep(editTask.unitId, editTask.stepNumber, { ...body, by: actor });
      setTasks((prev) => prev.map((t) => (t._id === editTask._id ? { ...t, ...updated, ...body } : t)));
      showToast('Task updated.');
    } catch (e) {
      showToast(e.message);
      await refresh();
    } finally {
      setDrawerBusy(false);
    }
  };

  const handleDrawerComplete = async () => {
    if (!editTask) return;
    setDrawerBusy(true);
    try {
      await postSalesApi.updateStep(editTask.unitId, editTask.stepNumber, { status: 'completed', by: actor });
      setTasks((prev) => prev.filter((t) => t._id !== editTask._id));
      showToast(`Step ${editTask.stepNumber} marked complete.`);
    } catch (e) {
      showToast(e.message);
      await refresh();
    } finally {
      setDrawerBusy(false);
    }
  };

  return (
    <div className="ps-tasks-page">
      <div className="ps-reports-head">
        <div>
          <h2 style={{ margin: 0 }}>My Tasks</h2>
          <p className="ps-reports-sub">
            Calendar view — click a task to edit or complete pipeline steps.
            {assignee ? ` · ${assignee}` : ''}
          </p>
        </div>
        <div className="ps-task-stats">
          <span className="ps-badge ps-badge-blue">{stats.total} open</span>
          {stats.overdue > 0 && <span className="ps-badge ps-badge-red">{stats.overdue} overdue</span>}
          {stats.dueToday > 0 && <span className="ps-badge ps-badge-amber">{stats.dueToday} due today</span>}
          {stats.unscheduled > 0 && <span className="ps-badge ps-badge-grey">{stats.unscheduled} unscheduled</span>}
        </div>
      </div>

      <div className="ps-tabs" style={{ marginBottom: 12 }}>
        {KIND_TABS.map((tab) => (
          <button
            key={tab.id || 'all'}
            type="button"
            className={`ps-tab ${taskKind === tab.id ? 'active' : ''}`}
            onClick={() => setTaskKind(tab.id)}
          >
            {tab.label}
            {!loading && tab.id === '' && tasks.length > 0 && ` (${tasks.length})`}
            {!loading && tab.id === 'cx' && cxCount != null && ` (${cxCount})`}
            {!loading && tab.id === 'backend' && backendCount != null && ` (${backendCount})`}
          </button>
        ))}
      </div>

      <PostSalesFilterBar
        project={project}
        phase={phase}
        building={building}
        onProjectChange={setProject}
        onPhaseChange={setPhase}
        onBuildingChange={setBuilding}
        options={options}
        onClear={clear}
      />

      {error && <div className="ps-error">{error}</div>}
      {loading && <div className="ps-empty">Loading your tasks…</div>}

      {!loading && !tasks.length && (
        <div className="ps-card ps-empty">
          No open tasks assigned to you in this filter. Assign executives on units or pick yourself on a pipeline step.
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <>
          <ActivityCalendarShell
            eyebrow="My Tasks"
            view={view}
            cursorDate={cursorDate}
            selectedYmd={selectedYmd}
            tasks={scheduled}
            getTaskYmd={(t) => taskCalendarDates(t)}
            getTaskId={(t) => t._id}
            getTaskTitle={taskTitle}
            getTaskColor={taskColor}
            onViewChange={setView}
            onCursorChange={setCursorDate}
            onToday={() => {
              const t = startOfDay(new Date());
              setCursorDate(t);
              setSelectedYmd(todayYmd());
            }}
            onSelectDay={(ymd) => {
              setSelectedYmd(ymd);
              const d = parseYmd(ymd);
              if (d) setCursorDate(d);
            }}
            onTaskClick={setEditTask}
            legend={LEGEND}
          />

          {selectedYmd && view !== 'day' ? (
            <section className="ps-card ps-cal-day-panel">
              <h3 className="ps-task-day-title">
                {formatDayLabel(parseYmd(selectedYmd) || new Date())}
                <span className="ps-badge ps-badge-grey">{selectedDayTasks.length}</span>
              </h3>
              {selectedDayTasks.length === 0 ? (
                <p className="ps-reports-muted" style={{ margin: 0 }}>No tasks on this date.</p>
              ) : (
                <div className="ps-task-card-list">
                  {selectedDayTasks.map((t) => (
                    <TaskAgendaCard
                      key={t._id}
                      task={t}
                      dateHint={calendarDateLabel(t, selectedYmd)}
                      onEdit={setEditTask}
                      onComplete={handleComplete}
                      completing={busyId === t._id}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {unscheduled.length > 0 ? (
            <section className="ps-task-unscheduled">
              <h3 className="ps-task-day-title">
                Unscheduled
                <span className="ps-badge ps-badge-grey">{unscheduled.length}</span>
              </h3>
              <div className="ps-task-card-list horizontal">
                {unscheduled.map((t) => (
                  <TaskAgendaCard
                    key={t._id}
                    task={t}
                    compact
                    onEdit={setEditTask}
                    onComplete={handleComplete}
                    completing={busyId === t._id}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <TaskEditDrawer
        task={editTask}
        assignees={assignees}
        onClose={() => setEditTask(null)}
        onSave={handleSave}
        onComplete={handleDrawerComplete}
        busy={drawerBusy}
      />

      {toast && <div className="ps-toast">{toast}</div>}
    </div>
  );
}
