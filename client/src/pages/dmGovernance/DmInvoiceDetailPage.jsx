import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

export default function DmInvoiceDetailPage() {
  const { invoiceId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [comment, setComment] = useState('');

  function load() {
    dmGovernanceApi
      .getInvoice(invoiceId)
      .then(setData)
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, [invoiceId]);

  async function act(action) {
    setBusy(action);
    setErr('');
    setMsg('');
    try {
      if (action === 'pay') {
        await dmGovernanceApi.recordPayment(invoiceId, Number(payAmount), comment);
        setMsg('Payment recorded');
      } else {
        await dmGovernanceApi.transitionInvoice(invoiceId, action, comment);
        setMsg(`Status updated: ${action}`);
      }
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  if (!data) return <p className="dm-muted">Loading…</p>;
  const inv = data.invoice;

  const actions = [];
  if (inv.status === 'DRAFT') actions.push({ id: 'submit', label: 'Submit for finance review' });
  if (inv.status === 'FINANCE_REVIEW') actions.push({ id: 'approve_finance', label: 'Finance approve' });
  if (inv.status === 'PROJECT_REVIEW') actions.push({ id: 'approve_leadership', label: 'Leadership approve' });
  if (inv.status === 'LEADERSHIP_APPROVED') actions.push({ id: 'send', label: 'Send to SPV' });
  if (inv.status === 'SENT') actions.push({ id: 'accrue', label: 'Mark accrued (unpaid)' });
  if (['FINANCE_REVIEW', 'PROJECT_REVIEW'].includes(inv.status)) {
    actions.push({ id: 'reject', label: 'Reject' });
  }

  return (
    <div>
      <p>
        <Link to="/app/dm-governance/invoices">← Invoices</Link>
      </p>
      <h2 style={{ margin: '0 0 8px' }}>{inv.invoiceNo}</h2>
      <p className="dm-page-lead">
        {inv.projectId} · {inv.periodMonth} · <strong>{inv.status}</strong>
      </p>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}
      {inv.capBreach ? <div className="dm-err">Cap breach flagged — requires leadership approval.</div> : null}

      <div className="dm-kpi-grid">
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Taxable</div>
          <div className="dm-kpi-val">{formatCr(inv.taxableValue)}</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Inside cap</div>
          <div className="dm-kpi-val">{formatCr(inv.insideCapAmount)}</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">GST</div>
          <div className="dm-kpi-val">{formatCr(inv.gstAmount)}</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Total / Paid</div>
          <div className="dm-kpi-val">
            {formatCr(inv.totalAmount)} / {formatCr(inv.paidAmount)}
          </div>
        </div>
      </div>

      <div className="dm-panel">
        <h2>Line items</h2>
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
              {(inv.lineItems || []).map((l, i) => (
                <tr key={i}>
                  <td>{l.head}</td>
                  <td>{l.description}</td>
                  <td>{formatCr(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {inv.businessRationale ? (
          <p className="dm-page-lead" style={{ marginTop: 12 }}>
            <strong>Rationale:</strong> {inv.businessRationale}
          </p>
        ) : null}
      </div>

      {actions.length ? (
        <div className="dm-panel">
          <h2>Workflow</h2>
          <div className="dm-field" style={{ maxWidth: 400, marginBottom: 12 }}>
            <label>Comment</label>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional approval note" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`dm-btn ${a.id.includes('approve') || a.id === 'send' ? 'dm-btn-primary' : ''}`}
                disabled={!!busy}
                onClick={() => act(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {['SENT', 'ACCRUED', 'PART_PAID'].includes(inv.status) ? (
        <div className="dm-panel">
          <h2>Record payment</h2>
          <div className="dm-form-grid">
            <div className="dm-field">
              <label>Amount (₹)</label>
              <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
          </div>
          <button type="button" className="dm-btn dm-btn-primary" disabled={!!busy} onClick={() => act('pay')}>
            Record payment
          </button>
        </div>
      ) : null}

      {data.calculation?.formulaTrace ? (
        <div className="dm-panel">
          <h2>Source calculation</h2>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <tbody>
                {data.calculation.formulaTrace.map((f, i) => (
                  <tr key={i}>
                    <td>{f.step}</td>
                    <td>{f.formula}</td>
                    <td>{typeof f.value === 'number' ? formatCr(f.value) : f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(inv.approvalTrail || []).length ? (
        <div className="dm-panel">
          <h2>Approval history</h2>
          {(inv.approvalTrail || []).map((t, i) => (
            <div key={i} className="dm-muted" style={{ fontSize: 13, marginBottom: 8 }}>
              {new Date(t.at).toLocaleString('en-IN')} — {t.action} by {t.by}
              {t.comment ? ` — ${t.comment}` : ''}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
