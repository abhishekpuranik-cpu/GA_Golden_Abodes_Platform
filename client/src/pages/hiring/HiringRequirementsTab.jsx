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

export default function HiringRequirementsTab() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    hiringApi.requirementsReport(params)
      .then((d) => setRows(d.requirements || []))
      .catch((e) => setErr(e.message));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    setBusy('export');
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      await hiringApi.downloadRequirementsExport(params);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <div className="hr-toolbar" style={{ marginBottom: '1rem' }}>
        <button type="button" className="hr-btn hr-btn-gold" disabled={busy === 'export'} onClick={handleExport}>
          {busy === 'export' ? 'Exporting…' : 'Download Excel'}
        </button>
      </div>

      <div className="hr-card hr-filter-bar">
        <div className="hr-filter-grid">
          <label>
            Entity
            <input placeholder="e.g. GAPL" value={filters.entityTag} onChange={(e) => setFilters({ ...filters, entityTag: e.target.value })} />
          </label>
          <label>
            Location
            <input value={filters.location} onChange={(e) => setFilters({ ...filters, location: e.target.value })} />
          </label>
          <label>
            Project
            <input value={filters.projectName} onChange={(e) => setFilters({ ...filters, projectName: e.target.value })} />
          </label>
          <label>
            Department
            <input value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} />
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
        <button type="button" className="hr-btn hr-btn-outline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
      </div>

      {err && <p className="hr-error">{err}</p>}

      <div className="hr-table-wrap">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Position #</th>
              <th>Role</th>
              <th>Project</th>
              <th>Location</th>
              <th>Entity</th>
              <th>Band</th>
              <th>HC</th>
              <th>Hired</th>
              <th>Opened</th>
              <th>Status</th>
              <th>Fulfilled</th>
              <th>Days open</th>
              <th>Days in current stage</th>
              <th>Stage movements</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={14} className="hr-muted">No requirements match filters.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.requisitionId}>
                <td>
                  <Link to={`/app/hiring/req/${r.requisitionId}`}>{r.positionNumber}</Link>
                </td>
                <td>{r.role}</td>
                <td>{r.project || '—'}</td>
                <td>{r.location}</td>
                <td>{r.entityTag}</td>
                <td>{r.band || '—'}</td>
                <td>{r.headcount}</td>
                <td>{r.hired}</td>
                <td>{r.openedDisplay}</td>
                <td><span className="hr-badge">{r.status}</span></td>
                <td>{r.fulfilledDisplay || '—'}</td>
                <td>{r.daysOpen ?? '—'}</td>
                <td>{r.daysInCurrentStage ?? '—'}</td>
                <td className="hr-movement-cell">{r.movementSummary || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
