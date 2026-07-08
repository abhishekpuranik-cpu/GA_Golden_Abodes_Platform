import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { hiringApi } from '../../lib/hiringApi.js';
import { formatLpaBand } from '../../lib/hiring/formatINR.js';
import EntityTagSelect from '../../components/hiring/EntityTagSelect.jsx';
import MoneyInput from '../../components/hiring/MoneyInput.jsx';
import EmptyState from '../../components/hiring/EmptyState.jsx';

const STATUSES = ['Draft', 'Sourcing', 'Shortlisting', 'Interviewing', 'Offer', 'Closed', 'Cancelled'];

export default function RequisitionBoard() {
  const { canWrite } = useOutletContext();
  const navigate = useNavigate();
  const [data, setData] = useState({ requisitions: [] });
  const [filter, setFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    entityTag: 'GAPL',
    role: '',
    department: '',
    projectName: '',
    location: 'Pune (PCMC)',
    brief: '',
    bandMinPaise: null,
    bandMaxPaise: null,
    experienceMinYears: null,
    experienceMaxYears: null,
    headcount: 1
  });
  const [err, setErr] = useState('');

  function load() {
    const params = filter ? { status: filter } : {};
    hiringApi.listRequisitions(params).then(setData).catch((e) => setErr(e.message));
  }

  useEffect(() => { load(); }, [filter]);

  async function handleCreate(e) {
    e.preventDefault();
    setErr('');
    try {
      const doc = await hiringApi.createRequisition(form);
      setShowNew(false);
      navigate(`/app/hiring/req/${doc._id}`);
    } catch (e) {
      setErr(e.message);
    }
  }

  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s] = data.requisitions.filter((r) => r.status === s);
    return acc;
  }, {});

  return (
    <>
      <div className="hr-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {canWrite && (
          <button type="button" className="hr-btn hr-btn-gold" onClick={() => setShowNew(true)}>
            + New requisition
          </button>
        )}
      </div>

      {err && <p className="hr-muted" style={{ color: '#b91c1c' }}>{err}</p>}

      {!data.requisitions.length ? (
        <EmptyState
          title="No requisitions yet"
          hint="Create a requisition to start sourcing candidates."
          action={canWrite && (
            <button type="button" className="hr-btn" onClick={() => setShowNew(true)}>+ New requisition</button>
          )}
        />
      ) : (
        <div className="hr-grid">
          {data.requisitions.map((r) => (
            <div
              key={r._id}
              className="hr-card hr-req-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/app/hiring/req/${r._id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/app/hiring/req/${r._id}`)}
            >
              <div className="hr-toolbar" style={{ marginBottom: '0.5rem' }}>
                <span className="hr-badge">{r.reqCode}</span>
                <span className="hr-badge hr-badge-gold">{r.status}</span>
              </div>
              <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.35rem' }}>{r.role}</h2>
              <p className="hr-muted">{r.location} · {r.entityTag}</p>
              <p className="hr-muted">{formatLpaBand(r.bandMinPaise, r.bandMaxPaise)}</p>
              {byStatus[r.status]?.length > 0 && (
                <p className="hr-muted" style={{ marginTop: '0.5rem' }}>
                  {STATUSES.indexOf(r.status) + 1} / {STATUSES.length} pipeline phase
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="hr-modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>New requisition</h2>
            <form onSubmit={handleCreate}>
              <EntityTagSelect value={form.entityTag} onChange={(v) => setForm({ ...form, entityTag: v })} />
              <div className="hr-form-row">
                <label>Role</label>
                <input required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <label>Department</label>
                <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Post Sales" />
              </div>
              <div className="hr-form-row">
                <label>Project</label>
                <input value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} placeholder="e.g. Group (HQ)" />
              </div>
              <div className="hr-form-row">
                <label>Location</label>
                <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                  <option>Pune (PCMC)</option>
                  <option>Mumbai</option>
                  <option>Goa</option>
                </select>
              </div>
              <MoneyInput
                label="Band min (₹/year)"
                valuePaise={form.bandMinPaise}
                onChangePaise={(v) => setForm({ ...form, bandMinPaise: v })}
              />
              <MoneyInput
                label="Band max (₹/year)"
                valuePaise={form.bandMaxPaise}
                onChangePaise={(v) => setForm({ ...form, bandMaxPaise: v })}
              />
              <div className="hr-form-row hr-form-row-inline">
                <label>Experience (years)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={form.experienceMinYears ?? ''}
                  onChange={(e) => setForm({ ...form, experienceMinYears: e.target.value ? Number(e.target.value) : null })}
                />
                <span>–</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={form.experienceMaxYears ?? ''}
                  onChange={(e) => setForm({ ...form, experienceMaxYears: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="hr-form-row">
                <label>Job brief (sent to Metaview)</label>
                <textarea required rows={5} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder="Describe responsibilities, must-have skills, and context for sourcing…" />
              </div>
              <div className="hr-toolbar">
                <button type="submit" className="hr-btn hr-btn-gold">Create</button>
                <button type="button" className="hr-btn hr-btn-outline" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
