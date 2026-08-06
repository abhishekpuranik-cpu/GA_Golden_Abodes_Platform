import { useEffect, useState } from 'react';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { formatKm, formatPaise, claimStatusLabel, claimStatusTone } from '../../../lib/adminServicesTabs.js';

function isAwaiting(status) {
  return /^AWAITING_L\d+$/.test(String(status || ''));
}

export default function ApprovalsPage() {
  const [claims, setClaims] = useState([]);
  const [exceptions, setExceptions] = useState({});
  const [view, setView] = useState('claims');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);

  async function load() {
    try {
      const p = await adminServicesApi.pendingApprovals();
      setClaims(p.claims || []);
      try {
        const e = await adminServicesApi.exceptions();
        setExceptions(e.exceptions || {});
      } catch {
        setExceptions({});
      }
      setErr('');
    } catch (ex) { setErr(ex.message); }
  }

  useEffect(() => { load(); }, []);

  async function claimAct(id, action) {
    try {
      if ((action === 'return' || action === 'reject') && !comment.trim()) {
        setErr('Comment required');
        return;
      }
      const body = action === 'pay'
        ? { paymentReference: comment || `PAY-${Date.now()}` }
        : { comment };
      await adminServicesApi.claimAction(id, action, body);
      setComment('');
      setErr('');
      load();
    } catch (ex) { setErr(ex.message); }
  }

  async function openDetail(id) {
    try {
      setDetail(await adminServicesApi.getClaim(id));
    } catch (ex) { setErr(ex.message); }
  }

  async function excAct(tripId, action) {
    try {
      if (!comment.trim()) { setErr('Comment required'); return; }
      await adminServicesApi.exceptionAction(tripId, action, { comment });
      setComment('');
      load();
    } catch (ex) { setErr(ex.message); }
  }

  const excCount = Object.values(exceptions).reduce((s, arr) => s + (arr?.length || 0), 0);

  function chainHint(c) {
    const level = c.pendingApprovalLevel;
    const step = (c.approvalChainSnapshot || []).find((l) => l.level === level);
    if (!step) return '—';
    return `${step.label || `L${level}`}`;
  }

  return (
    <div>
      <div className="as-card">
        <h2>Approvals</h2>
        <p className="as-muted">Multi-level: L1 then L2 (and beyond). You only see claims waiting on your level.</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className={`as-btn ${view === 'claims' ? '' : 'secondary'}`} onClick={() => setView('claims')}>Claims</button>
          <button type="button" className={`as-btn ${view === 'exceptions' ? '' : 'secondary'}`} onClick={() => setView('exceptions')}>
            Exceptions{excCount ? ` (${excCount})` : ''}
          </button>
          <button type="button" className="as-btn secondary" onClick={() => adminServicesApi.downloadApprovalsExport({ format: 'xlsx' }).catch((e) => setErr(e.message))}>Excel</button>
          <button type="button" className="as-btn secondary" onClick={() => adminServicesApi.downloadApprovalsExport({ format: 'pdf' }).catch((e) => setErr(e.message))}>PDF</button>
        </div>
        <div className="as-field">
          <label>Comment / payment reference</label>
          <input value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {err && <p className="as-error">{err}</p>}
      </div>

      {view === 'claims' && (
        <div className="as-card">
          <table className="as-table">
            <thead>
              <tr>
                <th>Period</th><th>Status</th><th>Level</th><th>Trips</th><th>Km</th><th>Verified %</th><th>Exceptions</th><th>Amount</th><th />
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c._id}>
                  <td>{c.claimPeriod}</td>
                  <td><span className={`as-pill ${claimStatusTone(c.status)}`}>{claimStatusLabel(c.status)}</span></td>
                  <td>{chainHint(c)}</td>
                  <td>{c.tripCount}</td>
                  <td>{formatKm(c.totalDistanceMetres)}</td>
                  <td>{c.verifiedPercent}%</td>
                  <td>{c.exceptionCount}</td>
                  <td>{formatPaise(c.grandTotalPaise)}</td>
                  <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button type="button" className="as-btn secondary" onClick={() => openDetail(c._id)}>Detail</button>
                    {c.status === 'SUBMITTED' && <button type="button" className="as-btn" onClick={() => claimAct(c._id, 'verify')}>Verify</button>}
                    {isAwaiting(c.status) && (
                      <button type="button" className="as-btn" onClick={() => claimAct(c._id, 'approve')}>
                        Approve {c.pendingApprovalLevel ? `L${c.pendingApprovalLevel}` : ''}
                      </button>
                    )}
                    {c.status === 'APPROVED' && <button type="button" className="as-btn" onClick={() => claimAct(c._id, 'pay')}>Mark paid</button>}
                    {(isAwaiting(c.status) || ['SUBMITTED', 'VERIFIED'].includes(c.status)) && (
                      <>
                        <button type="button" className="as-btn warn" onClick={() => claimAct(c._id, 'return')}>Return</button>
                        <button type="button" className="as-btn danger" onClick={() => claimAct(c._id, 'reject')}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!claims.length && (
                <tr><td colSpan={9} className="as-muted">No claims waiting on you.</td></tr>
              )}
            </tbody>
          </table>
          {detail && (
            <div style={{ marginTop: '1rem' }}>
              <h3>Claim detail</h3>
              <p className="as-muted">
                Chain: {(detail.claim?.approvalChainSnapshot || []).map((l) => `${l.label || `L${l.level}`}`).join(' → ') || '—'}
              </p>
              <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(detail, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {view === 'exceptions' && (
        <div className="as-card">
          {Object.entries(exceptions).map(([flag, list]) => (
            <div key={flag} style={{ marginBottom: '1rem' }}>
              <h3><span className="as-pill warning">{flag}</span></h3>
              <table className="as-table">
                <thead><tr><th>Date</th><th>Distance</th><th>Amount</th><th /></tr></thead>
                <tbody>
                  {(list || []).map((t) => (
                    <tr key={t._id}>
                      <td>{String(t.travelDate).slice(0, 10)}</td>
                      <td>{formatKm(t.claimedDistanceMetres)}</td>
                      <td>{formatPaise(t.totalClaimPaise)}</td>
                      <td>
                        <button type="button" className="as-btn" onClick={() => excAct(t._id, 'accept')}>Accept</button>{' '}
                        <button type="button" className="as-btn danger" onClick={() => excAct(t._id, 'reject')}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {!excCount && <p className="as-muted">No open exceptions.</p>}
        </div>
      )}
    </div>
  );
}
