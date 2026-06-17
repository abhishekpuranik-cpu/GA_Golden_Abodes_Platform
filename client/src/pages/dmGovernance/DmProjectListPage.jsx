import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, formatCr, riskColor } from '../../lib/dmGovernanceApi.js';

export default function DmProjectListPage() {
  const [projects, setProjects] = useState([]);
  const [err, setErr] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  function load() {
    dmGovernanceApi
      .listProjects()
      .then((r) => setProjects(r.projects || []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function syncRegistry() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const r = await dmGovernanceApi.syncRegistry();
      setSyncMsg(`Synced: ${r.updated} updated, ${r.imported} imported from registry`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Project Master</h2>
        <button type="button" className="dm-btn" disabled={syncing} onClick={syncRegistry}>
          {syncing ? 'Syncing…' : 'Import from ga_rp_projects'}
        </button>
      </div>
      {err ? <div className="dm-err">{err}</div> : null}
      {syncMsg ? <p className="dm-msg-ok">{syncMsg}</p> : null}

      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Project</th>
              <th>Topline GDV</th>
              <th>Collections</th>
              <th>Revenue status</th>
              <th>Billing model</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p._id}>
                <td>
                  <Link to={`/app/dm-governance/projects/${p._id}`}>{p.projectCode}</Link>
                </td>
                <td>{p.name}</td>
                <td>{formatCr(p.toplineGdv)}</td>
                <td>{formatCr(p.collectionsTtd)}</td>
                <td>{(p.revenueStatus || '').replace(/_/g, ' ')}</td>
                <td>{p.billingModelType || '—'}</td>
                <td style={{ color: riskColor(p.riskStatus) }}>{p.riskStatus || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
