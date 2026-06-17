import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

export default function DmSpvListPage() {
  const [spvs, setSpvs] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    dmGovernanceApi
      .listSpvs()
      .then((r) => setSpvs(r.spvs || []))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>SPV Master</h2>
      </div>
      {err ? <div className="dm-err">{err}</div> : null}
      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Legal entity</th>
              <th>GSTIN</th>
              <th>Billing</th>
              <th>DMA status</th>
              <th>Related party</th>
            </tr>
          </thead>
          <tbody>
            {spvs.map((s) => (
              <tr key={s._id}>
                <td>
                  <Link to={`/app/dm-governance/spvs/${s._id}`}>{s.spvCode}</Link>
                </td>
                <td>{s.spvName}</td>
                <td>{s.legalEntityName}</td>
                <td>{s.gstin || '—'}</td>
                <td>{s.billingStatus}</td>
                <td>{s.agreementStatus}</td>
                <td>{s.relatedPartyFlag ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!spvs.length && !err ? <p className="dm-muted">No SPVs yet.</p> : null}
    </div>
  );
}
