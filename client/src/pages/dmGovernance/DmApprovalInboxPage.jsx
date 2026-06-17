import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

export default function DmApprovalInboxPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    dmGovernanceApi
      .approvalInbox()
      .then((r) => setItems(r.items || []))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Approval Inbox</h2>
      {err ? <div className="dm-err">{err}</div> : null}
      <div className="dm-card-grid">
        {items.map((inv) => (
          <Link key={inv._id} to={`/app/dm-governance/invoices/${inv._id}`} className="dm-card">
            <h3>{inv.invoiceNo}</h3>
            <div className="dm-card-meta">
              <div>{inv.projectId} · {inv.periodMonth}</div>
              <div>{formatCr(inv.totalAmount)} · {inv.status}</div>
              {inv.requiresLeadershipApproval ? (
                <div className="dm-warning-text" style={{ marginTop: 6 }}>Leadership approval required</div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      {!items.length && !err ? <p className="dm-muted">No pending approvals.</p> : null}
    </div>
  );
}
