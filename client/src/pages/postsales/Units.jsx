import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnits } from '../../hooks/postsales/useUnits.js';
import { ENTITIES, PROJECTS } from '../../data/postsales/steps.js';
import NewUnitModal from '../../components/postsales/NewUnitModal.jsx';

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function dotClass(status) {
  if (status === 'completed') return 'completed';
  if (status === 'overdue') return 'overdue';
  if (status === 'in_progress') return 'in_progress';
  return 'pending';
}

export default function Units() {
  const [project, setProject] = useState('');
  const [entity, setEntity] = useState('');
  const [crmExecutive, setCrmExecutive] = useState('');
  const [status, setStatus] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filters = useMemo(() => {
    const f = {};
    if (project) f.project = project;
    if (entity) f.entity = entity;
    if (crmExecutive) f.crmExecutive = crmExecutive;
    if (status) f.status = status;
    return f;
  }, [project, entity, crmExecutive, status]);

  const { units, loading, error, createUnit } = useUnits(filters);

  const crmExecs = useMemo(() => [...new Set(units.map((u) => u.crmExecutive).filter(Boolean))], [units]);
  const breachCount = units.filter((u) => u.slaBreachCount > 0).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Sold Units</h2>
        <button type="button" className="ps-btn ps-btn-primary" onClick={() => setShowModal(true)}>+ New unit</button>
      </div>

      <div className="ps-filter-bar">
        <select value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">All projects</option>
          {PROJECTS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={crmExecutive} onChange={(e) => setCrmExecutive(e.target.value)}>
          <option value="">All CRM execs</option>
          {crmExecs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="possession_given">Possession given</option>
          <option value="on_hold">On hold</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
          {units.length} units · {breachCount} with breaches
        </span>
      </div>

      {error && <div className="ps-error">{error}</div>}
      {loading && <div className="ps-empty">Loading units…</div>}

      {!loading && !units.length && <div className="ps-empty">No units found. Create one to get started.</div>}

      <div className="ps-unit-grid">
        {units.map((u) => (
          <Link key={u._id} to={`/app/post-sales/units/${u._id}`} className="ps-unit-card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{u.project} · {u.unitNumber}</strong>
              {u.slaBreachCount > 0 && <span className="ps-badge ps-badge-red">{u.slaBreachCount} breach</span>}
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{u.customerName || u.customer?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)', marginTop: 4 }}>
              {u.entity} · {u.crmExecutive || '—'} · Step {u.currentStepNumber}/20
            </div>
            <div className="ps-pipeline-dots">
              {(u.steps || []).map((s) => (
                <span key={s.stepNumber} className={`ps-dot ${dotClass(s.status)}`} title={`Step ${s.stepNumber}: ${s.status}`} />
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 8, color: 'var(--ps-text-muted)' }}>
              Booked {u.bookingDate ? new Date(u.bookingDate).toLocaleDateString('en-IN') : '—'} · {fmt(u.totalCost)}
            </div>
          </Link>
        ))}
      </div>

      {showModal && (
        <NewUnitModal
          onClose={() => setShowModal(false)}
          onSubmit={async (customer, unit) => {
            await createUnit(customer, unit);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
