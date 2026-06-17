import { useEffect, useState } from 'react';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

const PILOT = 'P004';

function defaultFy() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export default function DmReconciliationPage() {
  const [projectId, setProjectId] = useState(PILOT);
  const [fy, setFy] = useState(defaultFy());
  const [projects, setProjects] = useState([]);
  const [recon, setRecon] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dmGovernanceApi.listProjects().then((r) => setProjects(r.projects || []));
  }, []);

  useEffect(() => {
    if (!projectId || !fy) return;
    dmGovernanceApi
      .getReconciliation(projectId, fy)
      .then((r) => setRecon(r.reconciliation))
      .catch((e) => setErr(e.message));
  }, [projectId, fy, msg]);

  async function build() {
    setBusy(true);
    setErr('');
    try {
      const r = await dmGovernanceApi.buildReconciliation(projectId, fy);
      setRecon(r.reconciliation);
      setMsg('Reconciliation built');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    setBusy(true);
    try {
      await dmGovernanceApi.lockReconciliation(projectId, fy);
      setMsg('Reconciliation locked');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const rows = recon
    ? [
        ['Project topline', recon.projectTopline],
        ['Collections till date', recon.collectionsTtd],
        ['Maximum DM fee entitlement (10%)', recon.maxDmFeeEntitlement],
        ['Opening unpaid GA invoices', recon.openingUnpaidGaInvoices],
        ['Monthly retainers billed', recon.monthlyRetainersBilled],
        ['Cost-plus billed', recon.costPlusBilled],
        ['Reimbursements billed', recon.reimbursementsBilled],
        ['Collection-linked DM fee', recon.collectionLinkedDmFee],
        ['Total GA billing', recon.totalGaBilling],
        ['Amount adjusted against cap', recon.amountAdjustedAgainstCap],
        ['Amount outside cap', recon.amountOutsideCap],
        ['Amount paid by SPV', recon.amountPaidBySpv],
        ['Amount accrued / payable', recon.amountAccruedPayable],
        ['Balance DM fee eligible', recon.balanceDmFeeEligible],
        ['Excess billed', recon.excessBilled],
        ['Credit adjustment required', recon.creditAdjustmentRequired]
      ]
    : [];

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Annual Reconciliation</h2>
      <p className="dm-page-lead">True-up against 10% DM fee cap — India FY (Apr–Mar).</p>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}
      <div className="dm-panel">
        <div className="dm-form-grid">
          <div className="dm-field">
            <label>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="dm-field">
            <label>Financial year</label>
            <input value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2025-26" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="dm-btn dm-btn-primary" disabled={busy} onClick={build}>
            Build reconciliation
          </button>
          {recon && !recon.locked ? (
            <button type="button" className="dm-btn" disabled={busy} onClick={lock}>
              Lock (leadership)
            </button>
          ) : null}
        </div>
      </div>
      {recon ? (
        <div className="dm-panel">
          <h2>
            FY {recon.financialYear} {recon.locked ? '· Locked' : '· Draft'}
          </h2>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <tbody>
                {rows.map(([label, val]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCr(val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recon.excessBilled > 0 ? (
            <div className="dm-err" style={{ marginTop: 12 }}>
              Over-billing detected — credit note or adjustment required: {formatCr(recon.creditAdjustmentRequired)}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="dm-muted">Build reconciliation to generate statement.</p>
      )}
    </div>
  );
}
