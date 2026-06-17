import { useEffect, useState } from 'react';
import { dmGovernanceApi } from '../../lib/dmGovernanceApi.js';

const SPV_PILOT = 'SPV_GOLDEN_HQ';
const STATUSES = ['not_started', 'draft', 'under_review', 'signed', 'expired'];

export default function DmCompliancePage() {
  const [spvId, setSpvId] = useState(SPV_PILOT);
  const [spvs, setSpvs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    dmGovernanceApi
      .getCompliance(spvId)
      .then((r) => {
        setDocs(r.documents || []);
        setReadiness(r.readiness);
      })
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    dmGovernanceApi.listSpvs().then((r) => setSpvs(r.spvs || []));
  }, []);

  useEffect(() => {
    if (spvId) load();
  }, [spvId, msg]);

  async function updateDoc(docId, patch) {
    try {
      const r = await dmGovernanceApi.saveComplianceDoc(docId, patch);
      setReadiness(r.readiness);
      setMsg('Updated');
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Compliance &amp; Documentation Matrix</h2>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}
      <div className="dm-panel">
        <div className="dm-field" style={{ maxWidth: 360 }}>
          <label>SPV</label>
          <select value={spvId} onChange={(e) => setSpvId(e.target.value)}>
            {spvs.map((s) => (
              <option key={s._id} value={s._id}>
                {s.spvName}
              </option>
            ))}
          </select>
        </div>
        {readiness ? (
          <div className="dm-kpi-grid" style={{ marginTop: 12 }}>
            <div className="dm-kpi">
              <div className="dm-kpi-lbl">Audit readiness</div>
              <div className="dm-kpi-val">{readiness.score}%</div>
              <div className="dm-kpi-sub">
                {readiness.signed}/{readiness.required} required docs signed
              </div>
            </div>
            <div className="dm-kpi">
              <div className="dm-kpi-lbl">Missing</div>
              <div className="dm-kpi-val">{readiness.missing}</div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Required</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d._id}>
                <td>{d.documentName}</td>
                <td>{d.required ? 'Yes' : 'No'}</td>
                <td>
                  <select
                    value={d.status}
                    onChange={(e) => updateDoc(d._id, { status: e.target.value })}
                    style={{ background: '#020617', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6 }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={d.owner || ''}
                    onChange={(e) => updateDoc(d._id, { owner: e.target.value })}
                    style={{ width: 120, background: '#020617', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6 }}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={d.dueDate || ''}
                    onChange={(e) => updateDoc(d._id, { dueDate: e.target.value })}
                    style={{ background: '#020617', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
