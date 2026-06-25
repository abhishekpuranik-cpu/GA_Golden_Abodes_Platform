import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMyTasks, useAssignees } from '../../hooks/postsales/useMyTasks.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import TaskAgendaCard from '../../components/postsales/TaskAgendaCard.jsx';
import TaskEditDrawer from '../../components/postsales/TaskEditDrawer.jsx';
import { postSalesApi } from '../../lib/postSalesApi.js';
import {
  countTasksInMonth,
  dateKey,
  formatDayLabel,
  formatMonthLabel,
  groupTasksByDay,
  horizonRange,
  shiftAnchor,
  splitTasksForView,
  startOfDay,
  taskAnchorDate,
  weekDays,
  yearMonths,
} from '../../lib/postsales/taskAgenda.js';

const HORIZONS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'yearly', label: 'Yearly' },
];

const KIND_TABS = [
  { id: '', label: 'All tasks' },
  { id: 'cx', label: 'CX' },
  { id: 'backend', label: 'Backend' },
];

export default function MyTasks() {
  const { user } = useOutletContext() || {};
  const actor = user?.name || user?.email || '';
  const [horizon, setHorizon] = useState('weekly');
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [taskKind, setTaskKind] = useState('');
  const [editTask, setEditTask] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [toast, setToast] = useState('');

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const filters = useMemo(() => ({ ...query, ...(taskKind ? { taskKind } : {}) }), [query, taskKind]);
  const { tasks, assignee, cxCount, backendCount, loading, error, refresh, setTasks } = useMyTasks(filters);
  const { assignees } = useAssignees();

  const range = useMemo(() => horizonRange(horizon, anchorDate), [horizon, anchorDate]);
  const { overdue, scheduled, unscheduled } = useMemo(
    () => splitTasksForView(tasks, horizon, anchorDate),
    [tasks, horizon, anchorDate],
  );

  const yearViewTasks = useMemo(() => {
    if (horizon !== 'yearly') return scheduled;
    const y = anchorDate.getFullYear();
    return scheduled.filter((t) => {
      const a = taskAnchorDate(t);
      return a && a.getFullYear() === y && a.getMonth() === selectedMonth;
    });
  }, [horizon, scheduled, anchorDate, selectedMonth]);

  const groupedDaily = useMemo(() => groupTasksByDay([...overdue, ...scheduled]), [overdue, scheduled]);
  const weekColumns = useMemo(() => {
    const days = weekDays(anchorDate);
    const byKey = new Map(groupTasksByDay(scheduled).map((g) => [g.key, g.tasks]));
    return days.map((day) => ({
      ...day,
      tasks: byKey.get(day.key) || [],
    }));
  }, [anchorDate, scheduled]);

  const stats = useMemo(() => {
    const inView = [...overdue, ...scheduled];
    const dueToday = inView.filter((t) => dateKey(taskAnchorDate(t) || 0) === dateKey(new Date())).length;
    return {
      total: inView.length,
      overdue: overdue.length,
      dueToday,
      unscheduled: unscheduled.length,
    };
  }, [overdue, scheduled, unscheduled]);

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

  const goToday = () => {
    const today = startOfDay(new Date());
    setAnchorDate(today);
    setSelectedMonth(today.getMonth());
  };

  return (
    <div className="ps-tasks-page">
      <div className="ps-reports-head">
        <div>
          <h2 style={{ margin: 0 }}>My Tasks</h2>
          <p className="ps-reports-sub">
            View, edit, and complete pipeline work by day, week, or year.
            {assignee ? ` · ${assignee}` : ''}
          </p>
        </div>
        <div className="ps-task-horizon-tabs">
          {HORIZONS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`ps-tab ${horizon === h.id ? 'active' : ''}`}
              onClick={() => setHorizon(h.id)}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-task-toolbar">
        <div className="ps-task-nav">
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => setAnchorDate(shiftAnchor(horizon, anchorDate, -1))}>◀</button>
          <div className="ps-task-nav-label">
            <strong>{range.label}</strong>
            {horizon === 'yearly' && <span className="ps-reports-muted"> · {formatMonthLabel(new Date(anchorDate.getFullYear(), selectedMonth, 1))}</span>}
          </div>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => setAnchorDate(shiftAnchor(horizon, anchorDate, 1))}>▶</button>
          <button type="button" className="ps-btn" onClick={goToday}>Today</button>
        </div>
        <div className="ps-task-stats">
          <span className="ps-badge ps-badge-blue">{stats.total} in view</span>
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

      {!loading && tasks.length > 0 && horizon === 'daily' && (
        <div className="ps-task-daily">
          {groupedDaily.length === 0 && (
            <div className="ps-card ps-empty">No tasks scheduled for {formatDayLabel(anchorDate)}.</div>
          )}
          {groupedDaily.map((group) => (
            <section key={group.key} className="ps-task-day-section">
              <h3 className="ps-task-day-title">
                {group.key === 'unscheduled' ? 'Unscheduled' : formatDayLabel(group.date)}
                <span className="ps-badge ps-badge-grey">{group.tasks.length}</span>
              </h3>
              <div className="ps-task-card-list">
                {group.tasks.map((t) => (
                  <TaskAgendaCard
                    key={t._id}
                    task={t}
                    onEdit={setEditTask}
                    onComplete={handleComplete}
                    completing={busyId === t._id}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && tasks.length > 0 && horizon === 'weekly' && (
        <>
          {overdue.length > 0 && (
            <section className="ps-task-overdue-strip">
              <h3 className="ps-task-day-title">Overdue <span className="ps-badge ps-badge-red">{overdue.length}</span></h3>
              <div className="ps-task-card-list horizontal">
                {overdue.map((t) => (
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
          )}
          <div className="ps-task-week-grid">
          {weekColumns.map((col) => (
            <div key={col.key} className={`ps-task-week-col ${col.isToday ? 'today' : ''}`}>
              <div className="ps-task-week-col-head">
                <strong>{col.label}</strong>
                <span className="ps-badge ps-badge-grey">{col.tasks.length}</span>
              </div>
              <div className="ps-task-week-col-body">
                {col.tasks.length === 0 && <div className="ps-task-week-empty">—</div>}
                {col.tasks.map((t) => (
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
            </div>
          ))}
          </div>
        </>
      )}

      {!loading && tasks.length > 0 && horizon === 'yearly' && (
        <div className="ps-task-year-wrap">
          <div className="ps-task-month-grid">
            {yearMonths(anchorDate).map((m) => {
              const count = countTasksInMonth(tasks, anchorDate.getFullYear(), m.month);
              const active = selectedMonth === m.month;
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`ps-task-month-chip ${active ? 'active' : ''}`}
                  onClick={() => setSelectedMonth(m.month)}
                >
                  <span>{m.label}</span>
                  <strong>{count || '—'}</strong>
                </button>
              );
            })}
          </div>
          <div className="ps-task-year-list">
            {yearViewTasks.length === 0 ? (
              <div className="ps-card ps-empty">No tasks in {formatMonthLabel(new Date(anchorDate.getFullYear(), selectedMonth, 1))}.</div>
            ) : (
              groupTasksByDay(yearViewTasks).map((group) => (
                <section key={group.key} className="ps-task-day-section">
                  <h3 className="ps-task-day-title">
                    {group.key === 'unscheduled' ? 'Unscheduled' : formatDayLabel(group.date)}
                    <span className="ps-badge ps-badge-grey">{group.tasks.length}</span>
                  </h3>
                  <div className="ps-task-card-list horizontal">
                    {group.tasks.map((t) => (
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
              ))
            )}
          </div>
        </div>
      )}

      {!loading && unscheduled.length > 0 && horizon !== 'daily' && (
        <section className="ps-task-unscheduled">
          <h3 className="ps-task-day-title">Unscheduled <span className="ps-badge ps-badge-grey">{unscheduled.length}</span></h3>
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
