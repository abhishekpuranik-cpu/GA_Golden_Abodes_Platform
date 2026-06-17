import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

const STATUS_CLASS = {
  DRAFT: 'dm-status-draft',
  FINANCE_REVIEW: 'dm-status-review',
  PROJECT_REVIEW: 'dm-status-review',
  LEADERSHIP_APPROVED: 'dm-status-approved',
  SENT: 'dm-status-sent',
  ACCRUED: 'dm-warning-text',
  PAID: 'dm-status-approved',
  REJECTED: 'dm-status-rejected'
};

export default function DmInvoiceRegisterPage() {
  const [invoices, setInvoices] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    dmGovernanceApi
      .listInvoices()
      .then((r) => setInvoices(r.invoices || []))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Invoice Register</h2>
        <Link to="/app/dm-governance/billing-workspace" className="dm-btn">
          + New billing
        </Link>
      </div>
      {err ? <div className="dm-err">{err}</div> : null}
      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Project</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv._id}>
                <td>
                  <Link to={`/app/dm-governance/invoices/${inv._id}`}>{inv.invoiceNo}</Link>
                </td>
                <td>{inv.projectId}</td>
                <td>{inv.periodMonth}</td>
                <td>{formatCr(inv.totalAmount)}</td>
                <td>{formatCr(inv.paidAmount)}</td>
                <td className={STATUS_CLASS[inv.status] || 'dm-status-draft'}>{inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!invoices.length && !err ? <p className="dm-muted">No invoices yet.</p> : null}
    </div>
  );
}
