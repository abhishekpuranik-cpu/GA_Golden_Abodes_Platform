import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hiringApi } from '../../lib/hiringApi.js';

const EMPTY_FILTERS = {
  entityTag: '',
  location: '',
  projectName: '',
  department: '',
  status: ''
};

export default function HiringKpisTab() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    hiringApi.dashboard(params)
      .then(setData)
      .catch((e) => setErr(e.message || 'Dashboard failed to load'));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  if (err) return <p className="hr-error">{err}</p>;
  if (!data) return <p className="hr-muted">Loading KPIs…</p>;

  const k = data.kpis || {};
  const opts = data.filterOptions || {};

  return (
    <>
      <div className="hr-card hr-filter-bar">
        <div className="hr-filter-grid">
          <label>
            Entity
            <select value={filters.entityTag} onChange={(e) => setFilters({ ...filters, entityTag: e.target.value })}>
              <option value="">All</option>
              {(opts.entityTags || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Location
            <select value={filters.location} onChange={(e) => setFilters({ ...filters, location: e.target.value })}>
              <option value="">All</option>
              {(opts.locations || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Project
            <select value={filters.projectName} onChange={(e) => setFilters({ ...filters, projectName: e.target.value })}>
              <option value="">All</option>
              {(opts.projects || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Department
            <select value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
              <option value="">All</option>
              {(opts.departments || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              {['Draft', 'Sourcing', 'Shortlisting', 'Interviewing', 'Offer', 'Hiring Fulfilled', 'Closed', 'Cancelled'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="hr-btn hr-btn-outline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
        <p className="hr-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>KPIs refresh every 60s · last load just now</p>
      </div>

      <div className="hr-stat-row" style={{ marginBottom: '1.5rem' }}>
        <div className="hr-stat">
          <strong>{k.openRequisitions ?? 0}</strong>
          <span className="hr-muted">Open requisitions</span>
        </div>
        <div className="hr-stat">
          <strong>{k.fulfilledRequisitions ?? 0}</strong>
          <span className="hr-muted">Hiring fulfilled</span>
        </div>
        <div className="hr-stat">
          <strong>{k.totalHired ?? 0}/{k.totalHeadcount ?? 0}</strong>
          <span className="hr-muted">Hired / headcount</span>
        </div>
        <div className="hr-stat">
          <strong>{k.fillRate ?? 0}%</strong>
          <span className="hr-muted">Fill rate</span>
        </div>
        <div className="hr-stat">
          <strong>{k.activeCandidates ?? 0}</strong>
          <span className="hr-muted">Active candidates</span>
        </div>
        <div className="hr-stat">
          <strong>{k.upcomingInterviews ?? 0}</strong>
          <span className="hr-muted">Upcoming interviews</span>
        </div>
        <div className="hr-stat">
          <strong>{k.shortlistedToHiredRate ?? 0}%</strong>
          <span className="hr-muted">Shortlisted → Hired</span>
        </div>
        <div className="hr-stat">
          <strong>{k.hiredFromShortlist ?? 0}/{k.shortlistedEver ?? 0}</strong>
          <span className="hr-muted">Hired of shortlisted (screening)</span>
        </div>
        <div className="hr-stat">
          <strong>{data.offerConversion?.accepted || 0}</strong>
          <span className="hr-muted">Offers accepted</span>
        </div>
        <div className="hr-stat">
          <strong>{data.offerConversion?.conversionRate || 0}%</strong>
          <span className="hr-muted">Offer conversion</span>
        </div>
      </div>

      <div className="hr-card">
        <h2>Time in stage (avg days)</h2>
        <div className="hr-grid">
          {Object.values(data.timeInStage || {}).map((s) => (
            <div key={s.label}>
              <strong>{s.avgDays}</strong>
              <span className="hr-muted"> {s.label} ({s.count})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hr-card">
        <h2>Source mix</h2>
        {!data.sourceMix?.length ? (
          <p className="hr-muted">No candidates in filter scope.</p>
        ) : (
          <ul>
            {data.sourceMix.map((r) => (
              <li key={r.source}>{r.source}: {r.count}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="hr-card">
        <h2>Funnel by requisition</h2>
        {!data.funnelByRequisition?.length ? (
          <p className="hr-muted">No requisitions match filters.</p>
        ) : (
          data.funnelByRequisition.map((r) => (
            <div key={r.requisitionId} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
              <Link to={`/app/hiring/req/${r.requisitionId}`}><strong>{r.reqCode}</strong> — {r.role}</Link>
              <p className="hr-muted">
                {r.location}{r.projectName ? ` · ${r.projectName}` : ''} · {r.entityTag}
              </p>
              <p className="hr-muted">
                Hired {r.hired}/{r.headcount} · Status {r.status}
                {r.fulfilled && <span className="hr-badge hr-badge-gold" style={{ marginLeft: '0.5rem' }}>Fulfilled</span>}
              </p>
            </div>
          ))
        )}
      </div>
    </>
  );
}
