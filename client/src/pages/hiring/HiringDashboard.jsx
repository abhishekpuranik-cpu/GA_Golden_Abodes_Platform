import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hiringApi } from '../../lib/hiringApi.js';

export default function HiringDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    hiringApi.dashboard()
      .then(setData)
      .catch((e) => setErr(e.message || 'Dashboard failed to load'));
  }, []);

  if (err) return <p className="hr-error">{err}</p>;
  if (!data) return <p className="hr-muted">Loading dashboard…</p>;

  return (
    <>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A' }}>Hiring dashboard</h2>

      <div className="hr-stat-row" style={{ marginBottom: '1.5rem' }}>
        <div className="hr-stat">
          <strong>{data.offerConversion?.accepted || 0}</strong>
          <span className="hr-muted">Offers accepted</span>
        </div>
        <div className="hr-stat">
          <strong>{data.offerConversion?.conversionRate || 0}%</strong>
          <span className="hr-muted">Offer conversion</span>
        </div>
        <div className="hr-stat">
          <strong>{data.offerConversion?.total || 0}</strong>
          <span className="hr-muted">Total offers</span>
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
          <p className="hr-muted">No candidates yet.</p>
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
          <p className="hr-muted">No requisitions.</p>
        ) : (
          data.funnelByRequisition.map((r) => (
            <div key={r.requisitionId} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
              <Link to={`/app/hiring/req/${r.requisitionId}`}><strong>{r.reqCode}</strong> — {r.role}</Link>
              <p className="hr-muted">Hired {r.hired}/{r.headcount} · Status {r.status}</p>
            </div>
          ))
        )}
      </div>
    </>
  );
}
