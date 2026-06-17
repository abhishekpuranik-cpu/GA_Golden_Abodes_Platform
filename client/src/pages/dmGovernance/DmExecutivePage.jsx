import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

export default function DmExecutivePage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    dmGovernanceApi
      .executiveSummary()
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  async function printPack() {
    setExporting(true);
    try {
      const { html } = await dmGovernanceApi.exportReport('executive-pack');
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setExporting(false);
    }
  }

  if (err) return <div className="dm-err">{err}</div>;
  if (!data) return <p className="dm-muted">Loading executive analytics…</p>;

  const p = data.portfolio;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Executive analytics</h2>
        <button type="button" className="dm-btn dm-btn-primary" disabled={exporting} onClick={printPack}>
          {exporting ? 'Preparing…' : 'Print / PDF pack'}
        </button>
      </div>

      <div className="dm-kpi-grid">
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Portfolio topline</div>
          <div className="dm-kpi-val">{formatCr(p.totalTopline)}</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Collections rate</div>
          <div className="dm-kpi-val">{p.collectionRate.toFixed(1)}%</div>
          <div className="dm-kpi-sub">{formatCr(p.totalCollections)} collected</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">DM recovery</div>
          <div className="dm-kpi-val">{p.portfolioRecoveryRate.toFixed(1)}%</div>
          <div className="dm-kpi-sub">
            Billed {formatCr(p.totalBilled)} · Paid {formatCr(p.totalPaid)}
          </div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Weighted cap util</div>
          <div className="dm-kpi-val">{p.weightedCapUtilPct.toFixed(1)}%</div>
          <div className="dm-kpi-sub">Balance {formatCr(p.balanceEligible)}</div>
        </div>
      </div>

      <p className="dm-section-title">Revenue phase distribution</p>
      <div className="dm-card-grid">
        {Object.entries(data.phaseBreakdown || {}).map(([phase, count]) => (
          <div key={phase} className="dm-card">
            <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{phase.replace(/_/g, ' ')}</h3>
            <div className="dm-card-meta">{count} project(s)</div>
          </div>
        ))}
      </div>

      <p className="dm-section-title">Project performance</p>
      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Phase</th>
              <th>Collections %</th>
              <th>Cap util</th>
              <th>Recovery</th>
              <th>Construction</th>
              <th>Latest milestone</th>
            </tr>
          </thead>
          <tbody>
            {(data.projectRows || []).map((r) => (
              <tr key={r.projectId}>
                <td>
                  <Link to={`/app/dm-governance/projects/${r.projectId}`}>{r.name}</Link>
                </td>
                <td>{r.revenueStatus}</td>
                <td>{r.collectionsPct.toFixed(1)}%</td>
                <td>{r.capUtilPct}%</td>
                <td>{r.recoveryRate.toFixed(1)}%</td>
                <td>{r.constructionProgressPct}%</td>
                <td>{r.latestMilestone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(data.monthlyTrend || []).length ? (
        <>
          <p className="dm-section-title">Monthly billing trend</p>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Invoices</th>
                  <th>Billed</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyTrend.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{m.count}</td>
                    <td>{formatCr(m.billed)}</td>
                    <td>{formatCr(m.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
