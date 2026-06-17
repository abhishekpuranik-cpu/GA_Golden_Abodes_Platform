import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, riskColor } from '../../lib/dmGovernanceApi.js';

export default function DmRiskPage() {
  const [risks, setRisks] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    Promise.all([dmGovernanceApi.listRisks(), dmGovernanceApi.listBillingTriggers()])
      .then(([r, t]) => {
        setRisks(r.risks || []);
        setTriggers(t.triggers || []);
      })
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function scan() {
    setBusy(true);
    try {
      await dmGovernanceApi.scanRisks();
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id) {
    await dmGovernanceApi.resolveRisk(id, 'resolved');
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Risk &amp; Exception Dashboard</h2>
        <button type="button" className="dm-btn dm-btn-primary" disabled={busy} onClick={scan}>
          Scan all projects
        </button>
      </div>
      {err ? <div className="dm-err">{err}</div> : null}

      {triggers.length ? (
        <>
          <p className="dm-section-title">Billing triggers</p>
          <div className="dm-card-grid">
            {triggers.map((t) => (
              <div key={t._id} className="dm-card" style={{ cursor: 'default' }}>
                <h3>{t.triggerType}</h3>
                <div className="dm-card-meta">
                  <div>{t.message}</div>
                  <div>
                    <Link to={`/app/dm-governance/projects/${t.projectId}`}>{t.projectId}</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <p className="dm-section-title">Open risks ({risks.length})</p>
      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Project</th>
              <th>Category</th>
              <th>Message</th>
              <th>Suggested action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r._id}>
                <td style={{ color: riskColor(r.severity), fontWeight: 700 }}>{r.severity}</td>
                <td>
                  <Link to={`/app/dm-governance/projects/${r.projectId}`}>{r.projectId}</Link>
                </td>
                <td>{r.riskCategory}</td>
                <td>{r.message}</td>
                <td className="dm-muted" style={{ fontSize: 12 }}>{r.suggestedAction}</td>
                <td>
                  <button type="button" className="dm-btn" onClick={() => resolve(r._id)}>
                    Resolve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!risks.length ? <p className="dm-muted">No open risks — run scan to detect.</p> : null}
    </div>
  );
}
