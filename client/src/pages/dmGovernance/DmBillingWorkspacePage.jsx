import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

const PILOT_ID = 'P004';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DmBillingWorkspacePage() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(PILOT_ID);
  const [periodMonth, setPeriodMonth] = useState(currentMonth());
  const [calc, setCalc] = useState(null);
  const [allocation, setAllocation] = useState(null);
  const [preRev, setPreRev] = useState({ directExpenses: 0, businessRationale: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    dmGovernanceApi.listProjects().then((r) => setProjects(r.projects || []));
  }, []);

  useEffect(() => {
    if (!projectId || !periodMonth) return;
    Promise.all([
      dmGovernanceApi.getPreRevenue(projectId, periodMonth),
      dmGovernanceApi.getCostAllocation(projectId, periodMonth)
    ])
      .then(([pr, ca]) => {
        if (pr.preRevenue) setPreRev(pr.preRevenue);
        setAllocation(ca.allocation);
        if (pr.latestCalculation?.outputs) setCalc(pr.latestCalculation);
      })
      .catch(() => {});
  }, [projectId, periodMonth]);

  async function run(action) {
    setBusy(action);
    setErr('');
    setMsg('');
    try {
      if (action === 'savePreRev') {
        await dmGovernanceApi.savePreRevenue(projectId, periodMonth, preRev);
        setMsg('Pre-revenue notes saved');
      }
      if (action === 'syncV2') {
        const r = await dmGovernanceApi.syncCostAllocation(projectId, periodMonth);
        setAllocation(r.allocation);
        setMsg(`V2 sync: ${formatCr(r.allocation?.totalAllocatedCost)} allocated`);
      }
      if (action === 'calculate') {
        await dmGovernanceApi.savePreRevenue(projectId, periodMonth, preRev);
        const r = await dmGovernanceApi.calculate(projectId, periodMonth);
        setCalc(r.calculation);
        setMsg('Calculation updated');
      }
      if (action === 'generate') {
        const r = await dmGovernanceApi.generateInvoice(projectId, { periodMonth });
        setMsg(`Draft invoice ${r.invoice.invoiceNo} created`);
        window.location.href = `/app/dm-governance/invoices/${r.invoice._id}`;
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const out = calc?.outputs;

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Monthly Billing Workspace</h2>
      <p className="dm-page-lead">
        Calculate DM fee, sync V2 costs, generate draft invoice. Golden HQ pilot: <strong>P004</strong>.
      </p>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}

      <div className="dm-panel">
        <div className="dm-form-grid">
          <div className="dm-field">
            <label>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.projectCode})
                </option>
              ))}
            </select>
          </div>
          <div className="dm-field">
            <label>Billing month</label>
            <input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="dm-panel">
        <h2>Pre-revenue inputs</h2>
        <div className="dm-form-grid">
          <div className="dm-field">
            <label>Direct expenses (pass-through ₹)</label>
            <input
              type="number"
              value={preRev.directExpenses || 0}
              onChange={(e) => setPreRev({ ...preRev, directExpenses: Number(e.target.value) })}
            />
          </div>
          <div className="dm-field" style={{ gridColumn: '1 / -1' }}>
            <label>Business rationale</label>
            <textarea
              rows={3}
              value={preRev.businessRationale || ''}
              onChange={(e) => setPreRev({ ...preRev, businessRationale: e.target.value })}
              placeholder="GA is providing active development management before revenue — planning, approvals, coordination, controls."
            />
          </div>
        </div>
        <button type="button" className="dm-btn" disabled={!!busy} onClick={() => run('savePreRev')}>
          Save notes
        </button>
      </div>

      <div className="dm-panel">
        <h2>Cost allocation (Resource Planner V2)</h2>
        <p className="dm-card-meta" style={{ marginBottom: 12 }}>
          Allocated: {allocation ? formatCr(allocation.totalAllocatedCost) : '—'} · Employees:{' '}
          {allocation?.employeeLines?.length || 0}
        </p>
        <button type="button" className="dm-btn dm-btn-primary" disabled={!!busy} onClick={() => run('syncV2')}>
          {busy === 'syncV2' ? 'Syncing…' : 'Sync from V2'}
        </button>
      </div>

      <div className="dm-panel">
        <h2>DM fee calculation</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <button type="button" className="dm-btn dm-btn-primary" disabled={!!busy} onClick={() => run('calculate')}>
            {busy === 'calculate' ? 'Calculating…' : 'Run calculation'}
          </button>
          <button type="button" className="dm-btn" disabled={!!busy || !out} onClick={() => run('generate')}>
            Generate draft invoice
          </button>
        </div>

        {out ? (
          <>
            <div className="dm-kpi-grid">
              <div className="dm-kpi">
                <div className="dm-kpi-lbl">Inside cap</div>
                <div className="dm-kpi-val">{formatCr(out.insideCapAmount)}</div>
              </div>
              <div className="dm-kpi">
                <div className="dm-kpi-lbl">GST</div>
                <div className="dm-kpi-val">{formatCr(out.gstAmount)}</div>
              </div>
              <div className="dm-kpi">
                <div className="dm-kpi-lbl">Total invoice</div>
                <div className="dm-kpi-val">{formatCr(out.totalInvoiceAmount)}</div>
              </div>
              <div className="dm-kpi">
                <div className="dm-kpi-lbl">Balance eligible</div>
                <div className="dm-kpi-val">{formatCr(out.balanceEligible)}</div>
              </div>
            </div>
            {out.capBreach ? (
              <div className="dm-err">Cap breach — leadership approval required before billing outside cap.</div>
            ) : null}
            <p className="dm-section-title">Formula trace</p>
            <div className="dm-table-wrap">
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Formula</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(calc.formulaTrace || []).map((f, i) => (
                    <tr key={i}>
                      <td>{f.step}</td>
                      <td>{f.formula}</td>
                      <td>{typeof f.value === 'number' ? formatCr(f.value) : f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="dm-section-title">Line items</p>
            <div className="dm-table-wrap">
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>Head</th>
                    <th>Description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(calc.lineItems || []).map((l, i) => (
                    <tr key={i}>
                      <td>{l.head}</td>
                      <td>{l.description}</td>
                      <td>{formatCr(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="dm-muted">Run calculation to preview monthly billing.</p>
        )}
      </div>
    </div>
  );
}
