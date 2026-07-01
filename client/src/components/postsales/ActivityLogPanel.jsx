import { useEffect, useState } from 'react';

function fmtAt(at) {
  if (!at) return '—';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ActivityLogPanel({ fetchLog, title = 'Activity log' }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLog()
      .then((rows) => { if (!cancelled) setLog(rows || []); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchLog]);

  return (
    <div className="ps-activity-log">
      <div className="ps-activity-log-head">
        <strong>{title}</strong>
        {loading && <span className="ps-reports-muted">Loading…</span>}
      </div>
      {error && <div className="ps-error">{error}</div>}
      {!loading && !log.length && !error && (
        <div className="ps-reports-muted">No activity recorded yet.</div>
      )}
      <ul className="ps-activity-log-list">
        {log.map((entry, i) => (
          <li key={i}>
            <span className="ps-activity-log-action">{entry.action?.replace(/_/g, ' ')}</span>
            <span className="ps-activity-log-detail">{entry.detail || '—'}</span>
            <span className="ps-activity-log-meta">{fmtAt(entry.at)}{entry.by ? ` · ${entry.by}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
