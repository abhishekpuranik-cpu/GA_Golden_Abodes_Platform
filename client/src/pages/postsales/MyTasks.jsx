import { Link } from 'react-router-dom';
import { useMyTasks } from '../../hooks/postsales/useMyTasks.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { formatDueDate, slaCountdown } from '../../lib/postSalesSla.js';
import { PHASES } from '../../data/postsales/steps.js';

function statusBadge(status) {
  const map = { in_progress: 'blue', overdue: 'red', pending: 'grey', completed: 'green' };
  return `ps-badge ps-badge-${map[status] || 'grey'}`;
}

export default function MyTasks() {
  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const { tasks, assignee, loading, error } = useMyTasks(query);

  const overdue = tasks.filter((t) => t.status === 'overdue' || t.slaBreach);
  const dueSoon = tasks.filter((t) => {
    if (t.status === 'overdue' || t.slaBreach) return false;
    const c = slaCountdown(t);
    return c?.tone === 'warning';
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>My Tasks</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--ps-text-muted)', fontSize: '0.9rem' }}>
            Open pipeline steps assigned to you across all projects, sorted by due date.
            {assignee ? ` · Matching: ${assignee}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {overdue.length > 0 && <span className="ps-badge ps-badge-red">{overdue.length} overdue</span>}
          {dueSoon.length > 0 && <span className="ps-badge ps-badge-amber">{dueSoon.length} due soon</span>}
          <span className="ps-badge ps-badge-blue">{tasks.length} open</span>
        </div>
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
          No open tasks are assigned to you. Assign yourself on a unit pipeline step, or ask your admin to match your login name/email to the assignee field.
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="ps-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ps-table">
            <thead>
              <tr>
                <th>Due date</th>
                <th>Step</th>
                <th>Unit / project</th>
                <th>SLA target</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const countdown = slaCountdown(t);
                return (
                  <tr key={t._id}>
                    <td>
                      <strong>{formatDueDate(t.dueDate)}</strong>
                      {countdown && (
                        <div style={{ fontSize: '0.75rem', color: countdown.tone === 'danger' ? 'var(--ps-danger)' : countdown.tone === 'warning' ? 'var(--ps-warning)' : 'var(--ps-text-muted)' }}>
                          {countdown.label}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ color: PHASES[t.pipelinePhase]?.color, fontSize: '0.75rem' }}>{PHASES[t.pipelinePhase]?.label}</div>
                      <strong>Step {t.stepNumber}</strong>
                      <div style={{ fontSize: '0.8rem' }}>{t.stepName}</div>
                    </td>
                    <td>
                      <strong>{t.unitNumber}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>
                        {t.project}
                        {[t.phase, t.building].filter(Boolean).length ? ` · ${[t.phase, t.building].filter(Boolean).join(' · ')}` : ''}
                        {' · '}{t.customerName}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{t.slaTarget || '—'}</td>
                    <td><span className={statusBadge(t.status)}>{t.status.replace('_', ' ')}</span></td>
                    <td>
                      <Link to={`/app/post-sales/units/${t.unitId}?step=${t.stepNumber}`} className="ps-btn ps-btn-primary">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
