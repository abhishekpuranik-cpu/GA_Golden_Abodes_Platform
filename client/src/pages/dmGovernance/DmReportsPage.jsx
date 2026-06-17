import { useState } from 'react';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

const REPORTS = [
  { id: 'dm-fee-summary', label: 'SPV-wise DM fee summary' },
  { id: 'gst-billing', label: 'GST billing report' },
  { id: 'executive-pack', label: 'Executive analytics pack' },
  { id: 'auditor-pack', label: 'Auditor pack (invoices + recon + compliance)' }
];

export default function DmReportsPage() {
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(reportId) {
    setBusy(true);
    setErr('');
    setActive(reportId);
    if (reportId === 'executive-pack') {
      setData({ pack: true });
      setBusy(false);
      return;
    }
    try {
      const r = await dmGovernanceApi.getReport(reportId);
      setData(r);
    } catch (e) {
      setErr(e.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  function downloadJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${active}-${Date.now()}.json`;
    a.click();
  }

  async function printPdf() {
    if (!active) return;
    setBusy(true);
    try {
      const { html } = await dmGovernanceApi.exportReport(active);
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
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Reports Center</h2>
      {err ? <div className="dm-err">{err}</div> : null}
      <div className="dm-card-grid">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="dm-card"
            style={{ textAlign: 'left', cursor: 'pointer', border: active === r.id ? '1px solid rgba(45,212,191,0.5)' : undefined }}
            onClick={() => load(r.id)}
          >
            <h3 style={{ margin: 0 }}>{r.label}</h3>
          </button>
        ))}
      </div>
      {busy ? <p className="dm-muted">Loading…</p> : null}
      {data && active === 'dm-fee-summary' ? (
        <div className="dm-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <h2>DM fee summary</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="dm-btn" onClick={downloadJson}>
                Export JSON
              </button>
              <button type="button" className="dm-btn dm-btn-primary" onClick={printPdf}>
                Print / PDF
              </button>
            </div>
          </div>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Topline</th>
                  <th>Collections</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Accrued</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((row) => (
                  <tr key={row.projectId}>
                    <td>{row.name}</td>
                    <td>{formatCr(row.topline)}</td>
                    <td>{formatCr(row.collections)}</td>
                    <td>{formatCr(row.billed)}</td>
                    <td>{formatCr(row.paid)}</td>
                    <td>{formatCr(row.accrued)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {data && active === 'gst-billing' ? (
        <div className="dm-panel">
          <h2>GST billing</h2>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Period</th>
                  <th>Taxable</th>
                  <th>GST</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((row, i) => (
                  <tr key={i}>
                    <td>{row.invoiceNo}</td>
                    <td>{row.periodMonth}</td>
                    <td>{formatCr(row.taxable)}</td>
                    <td>{formatCr(row.gst)}</td>
                    <td>{formatCr(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {data && active === 'auditor-pack' ? (
        <div className="dm-panel">
          <h2>Auditor pack</h2>
          <p className="dm-page-lead">
            {data.invoices?.length || 0} invoices · {data.reconciliations?.length || 0} reconciliations ·{' '}
            {data.compliance?.length || 0} compliance docs
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="dm-btn dm-btn-primary" onClick={downloadJson}>
              Download auditor pack (JSON)
            </button>
            <button type="button" className="dm-btn" onClick={printPdf}>
              Print / PDF
            </button>
          </div>
        </div>
      ) : null}
      {data && active === 'executive-pack' ? (
        <div className="dm-panel">
          <h2>Executive pack</h2>
          <p className="dm-page-lead">Portfolio KPIs, project performance, billing trend.</p>
          <button type="button" className="dm-btn dm-btn-primary" onClick={printPdf}>
            Print / PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
