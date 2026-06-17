import { DM_COLLECTIONS } from './collections.js';
import { sumProjectBillingTotals } from './calculationEngine.js';
import { buildExecutiveSummary } from './executiveAnalytics.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtCr(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Generate printable HTML report (browser print → PDF).
 * @param {import('mongodb').Db} db
 * @param {string} reportId
 * @param {object} user
 */
export async function buildReportHtml(db, reportId, user) {
  const generatedAt = new Date().toLocaleString('en-IN');
  let title = 'DM Governance Report';
  let body = '';

  if (reportId === 'dm-fee-summary') {
    title = 'SPV-wise DM Fee Summary';
    const projects = await db.collection(DM_COLLECTIONS.projects).find({}).toArray();
    const rows = await Promise.all(
      projects.map(async (p) => {
        const t = await sumProjectBillingTotals(db, p._id);
        return `<tr><td>${esc(p.name)}</td><td>${fmtCr(p.toplineGdv)}</td><td>${fmtCr(p.collectionsTtd)}</td><td>${fmtCr(t.dmFeeBilledTtd)}</td><td>${fmtCr(t.dmFeePaidTtd)}</td><td>${fmtCr(t.dmFeeAccrued)}</td></tr>`;
      })
    );
    body = `<table><thead><tr><th>Project</th><th>Topline</th><th>Collections</th><th>Billed</th><th>Paid</th><th>Accrued</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  } else if (reportId === 'executive-pack') {
    title = 'Executive Analytics Pack';
    const ex = await buildExecutiveSummary(db, user);
    const p = ex.portfolio;
    body = `
      <h2>Portfolio KPIs</h2>
      <ul>
        <li>Projects: ${p.projectCount} · SPVs: ${p.spvCount}</li>
        <li>Topline: ${fmtCr(p.totalTopline)} · Collections: ${fmtCr(p.totalCollections)} (${p.collectionRate.toFixed(1)}%)</li>
        <li>DM cap: ${fmtCr(p.totalDmCap)} · Billed: ${fmtCr(p.totalBilled)} · Paid: ${fmtCr(p.totalPaid)}</li>
        <li>Recovery rate: ${p.portfolioRecoveryRate.toFixed(1)}% · Weighted cap util: ${p.weightedCapUtilPct.toFixed(1)}%</li>
      </ul>
      <h2>Projects</h2>
      <table>
        <thead><tr><th>Project</th><th>Phase</th><th>Cap util</th><th>Billed</th><th>Milestone</th></tr></thead>
        <tbody>
          ${ex.projectRows
            .map(
              (r) =>
                `<tr><td>${esc(r.name)}</td><td>${esc(r.revenueStatus)}</td><td>${r.capUtilPct}%</td><td>${fmtCr(r.dmFeeBilled)}</td><td>${esc(r.latestMilestone)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } else if (reportId === 'auditor-pack') {
    title = 'Auditor Pack';
    const invoices = await db.collection(DM_COLLECTIONS.invoices).find({}).sort({ periodMonth: -1 }).limit(100).toArray();
    body = `<p>${invoices.length} invoices</p><table><thead><tr><th>Invoice</th><th>Period</th><th>Status</th><th>Total</th></tr></thead><tbody>${invoices
      .map(
        (i) =>
          `<tr><td>${esc(i.invoiceNo)}</td><td>${esc(i.periodMonth)}</td><td>${esc(i.status)}</td><td>${fmtCr(i.totalAmount)}</td></tr>`
      )
      .join('')}</tbody></table>`;
  } else {
    throw new Error('Unknown report for export');
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div class="meta">Golden Abodes DM–SPV Governance · Generated ${esc(generatedAt)}</div>
  ${body}
  <script>window.onload = () => { /* user prints to PDF */ };</script>
</body>
</html>`;

  return { html, filename: `${reportId}-${Date.now()}.html`, title };
}
