import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, riskColor } from '../../lib/dmGovernanceApi.js';

export default function DmAlertsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  function load() {
    dmGovernanceApi
      .alerts()
      .then(setData)
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function ack(id) {
    try {
      await dmGovernanceApi.ackAlert(id);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (err) return <div className="dm-err">{err}</div>;
  if (!data) return <p className="dm-muted">Loading alerts…</p>;

  const s = data.summary;

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Alerts &amp; notifications</h2>
      <div className="dm-kpi-grid">
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Total alerts</div>
          <div className="dm-kpi-val">{s.total}</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Critical / high</div>
          <div className="dm-kpi-val dm-risk-critical">
            {(s.critical || 0) + (s.high || 0)}
          </div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Pending approvals</div>
          <div className="dm-kpi-val">{s.pendingApprovals}</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Billing triggers</div>
          <div className="dm-kpi-val">{s.pendingTriggers}</div>
        </div>
      </div>

      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Type</th>
              <th>Project</th>
              <th>Alert</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(data.alerts || []).map((a) => (
              <tr key={a.id}>
                <td style={{ color: riskColor(a.severity), fontWeight: 600 }}>{a.severity}</td>
                <td>{a.type}</td>
                <td>{a.projectId || '—'}</td>
                <td>
                  <div>{a.title}</div>
                  {a.detail ? <div className="dm-muted" style={{ fontSize: 12 }}>{a.detail}</div> : null}
                </td>
                <td>
                  {a.href ? (
                    <Link to={a.href.startsWith('/app') ? a.href : `/app/dm-governance${a.href}`}>Open</Link>
                  ) : null}
                  {a.id.startsWith('ntf_') ? (
                    <>
                      {' · '}
                      <button type="button" className="dm-btn dm-btn-mini" onClick={() => ack(a.id)}>
                        Ack
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
