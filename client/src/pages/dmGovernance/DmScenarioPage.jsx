import { useEffect, useState } from 'react';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

const PILOT = 'P004';

export default function DmScenarioPage() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(PILOT);
  const [assumptions, setAssumptions] = useState({
    label: 'Collections +10%',
    collectionsTtd: null,
    retainerMonthly: null,
    revenueStatus: ''
  });
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dmGovernanceApi.listProjects().then((r) => setProjects(r.projects || []));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    dmGovernanceApi.listScenarios(projectId).then((r) => setHistory(r.scenarios || [])).catch(() => {});
  }, [projectId, result]);

  async function run() {
    setBusy(true);
    setErr('');
    try {
      const payload = { label: assumptions.label };
      if (assumptions.collectionsTtd != null && assumptions.collectionsTtd !== '')
        payload.collectionsTtd = Number(assumptions.collectionsTtd);
      if (assumptions.retainerMonthly != null && assumptions.retainerMonthly !== '')
        payload.retainerMonthly = Number(assumptions.retainerMonthly);
      if (assumptions.revenueStatus) payload.revenueStatus = assumptions.revenueStatus;
      const r = await dmGovernanceApi.runScenario(projectId, payload);
      setResult(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Billing scenario simulator</h2>
      <p className="dm-page-lead">
        What-if analysis — collections, retainer, revenue phase. Does not change live billing.
      </p>
      {err ? <div className="dm-err">{err}</div> : null}

      <div className="dm-panel">
        <div className="dm-form-grid">
          <div className="dm-field">
            <label>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p._id})
                </option>
              ))}
            </select>
          </div>
          <div className="dm-field">
            <label>Scenario label</label>
            <input
              value={assumptions.label}
              onChange={(e) => setAssumptions({ ...assumptions, label: e.target.value })}
            />
          </div>
          <div className="dm-field">
            <label>Collections TTD override (₹)</label>
            <input
              type="number"
              placeholder="Leave blank = current"
              value={assumptions.collectionsTtd ?? ''}
              onChange={(e) =>
                setAssumptions({ ...assumptions, collectionsTtd: e.target.value === '' ? null : e.target.value })
              }
            />
          </div>
          <div className="dm-field">
            <label>Retainer / month override (₹)</label>
            <input
              type="number"
              placeholder="Leave blank = config"
              value={assumptions.retainerMonthly ?? ''}
              onChange={(e) =>
                setAssumptions({ ...assumptions, retainerMonthly: e.target.value === '' ? null : e.target.value })
              }
            />
          </div>
          <div className="dm-field">
            <label>Revenue status override</label>
            <select
              value={assumptions.revenueStatus}
              onChange={(e) => setAssumptions({ ...assumptions, revenueStatus: e.target.value })}
            >
              <option value="">— current —</option>
              <option value="pre_revenue">pre_revenue</option>
              <option value="collection_active">collection_active</option>
              <option value="mature">mature</option>
            </select>
          </div>
        </div>
        <button type="button" className="dm-btn dm-btn-primary" disabled={busy} onClick={run}>
          {busy ? 'Running…' : 'Run scenario'}
        </button>
      </div>

      {result ? (
        <div className="dm-panel">
          <h2>Results — {assumptions.label}</h2>
          <div className="dm-kpi-grid">
            <div className="dm-kpi">
              <div className="dm-kpi-lbl">Baseline invoice</div>
              <div className="dm-kpi-val">{formatCr(result.baseline?.totalInvoiceAmount)}</div>
            </div>
            <div className="dm-kpi">
              <div className="dm-kpi-lbl">Scenario invoice</div>
              <div className="dm-kpi-val">{formatCr(result.scenario?.totalInvoiceAmount)}</div>
              <div className={`dm-kpi-sub ${result.delta?.invoiceAmount >= 0 ? 'dm-warning-text' : 'dm-success-text'}`}>
                Δ {formatCr(result.delta?.invoiceAmount)}
              </div>
            </div>
            <div className="dm-kpi">
              <div className="dm-kpi-lbl">Cap util after</div>
              <div className="dm-kpi-val">{Math.round(result.scenario?.capUtilAfter || 0)}%</div>
            </div>
            <div className="dm-kpi">
              <div className="dm-kpi-lbl">Phase</div>
              <div className="dm-kpi-val" style={{ fontSize: 14 }}>
                {result.scenario?.phase}
              </div>
              {result.scenario?.capBreach ? (
                <div className="dm-kpi-sub dm-risk-critical">
                  Cap breach
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {history.length ? (
        <div className="dm-panel">
          <h2>Saved scenarios</h2>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Label</th>
                  <th>Scenario total</th>
                  <th>Δ vs baseline</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s._id}>
                    <td>{s.createdAt ? new Date(s.createdAt).toLocaleString('en-IN') : '—'}</td>
                    <td>{s.label}</td>
                    <td>{formatCr(s.scenario?.totalInvoiceAmount)}</td>
                    <td>{formatCr(s.delta?.invoiceAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
