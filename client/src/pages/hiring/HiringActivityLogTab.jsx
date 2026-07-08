import { useCallback, useEffect, useState } from 'react';
import { hiringApi } from '../../lib/hiringApi.js';

export default function HiringActivityLogTab() {
  const [activities, setActivities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ refType: '', action: '', from: '', to: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    const params = { page, limit: 50, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
    hiringApi.activityLog(params)
      .then((d) => {
        setActivities(d.activities || []);
        setTotal(d.total || 0);
      })
      .catch((e) => setErr(e.message));
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    setBusy('export');
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      await hiringApi.downloadActivityExport(params);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const pages = Math.max(1, Math.ceil(total / 50));

  return (
    <>
      <div className="hr-toolbar" style={{ marginBottom: '1rem' }}>
        <button type="button" className="hr-btn hr-btn-gold" disabled={busy === 'export'} onClick={handleExport}>
          {busy === 'export' ? 'Exporting…' : 'Download Excel'}
        </button>
        <span className="hr-muted">{total} activities</span>
      </div>

      <div className="hr-card hr-filter-bar">
        <div className="hr-filter-grid">
          <label>
            Entity type
            <select value={filters.refType} onChange={(e) => { setPage(1); setFilters({ ...filters, refType: e.target.value }); }}>
              <option value="">All</option>
              {['requisition', 'candidate', 'offer', 'interview'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Action
            <input
              placeholder="e.g. stage_change"
              value={filters.action}
              onChange={(e) => { setPage(1); setFilters({ ...filters, action: e.target.value }); }}
            />
          </label>
          <label>
            From
            <input type="date" value={filters.from} onChange={(e) => { setPage(1); setFilters({ ...filters, from: e.target.value }); }} />
          </label>
          <label>
            To
            <input type="date" value={filters.to} onChange={(e) => { setPage(1); setFilters({ ...filters, to: e.target.value }); }} />
          </label>
        </div>
      </div>

      {err && <p className="hr-error">{err}</p>}

      <div className="hr-table-wrap">
        <table className="hr-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Context</th>
              <th>Action</th>
              <th>Detail</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {!activities.length ? (
              <tr><td colSpan={6} className="hr-muted">No activities.</td></tr>
            ) : activities.map((a) => (
              <tr key={a.id}>
                <td>{a.atDisplay}</td>
                <td>{a.refType}</td>
                <td>{a.context || '—'}</td>
                <td>{a.actionLabel}</td>
                <td>{a.detail || '—'}</td>
                <td>{a.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="hr-toolbar" style={{ marginTop: '1rem' }}>
          <button type="button" className="hr-btn hr-btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="hr-muted">Page {page} of {pages}</span>
          <button type="button" className="hr-btn hr-btn-outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
