import { useEffect, useState } from 'react';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { formatKm, formatPaise, claimStatusLabel, claimStatusTone } from '../../../lib/adminServicesTabs.js';

function periodNow() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function tripStatusTone(s) {
  if (['APPROVED', 'PAID', 'VERIFIED'].includes(s)) return 'success';
  if (['RETURNED', 'OPEN'].includes(s) || s === 'SUBMITTED') return s === 'RETURNED' ? 'warning' : 'neutral';
  if (s === 'REJECTED') return 'danger';
  return 'neutral';
}

export default function MyClaims() {
  const [trips, setTrips] = useState([]);
  const [claims, setClaims] = useState([]);
  const [period, setPeriod] = useState(periodNow);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [t, c] = await Promise.all([
        adminServicesApi.listTrips({ period }),
        adminServicesApi.listClaims({})
      ]);
      setTrips(t.trips || []);
      setClaims(c.claims || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, [period]);

  const running = trips.reduce((s, t) => s + (t.totalClaimPaise || 0), 0);
  const draftCount = trips.filter((t) => ['DRAFT', 'RETURNED'].includes(t.status)).length;
  const readyCount = trips.filter((t) => ['SUBMITTED', 'VERIFIED'].includes(t.status) && !t.claimId).length;

  async function submitTrip(id) {
    try {
      setErr('');
      await adminServicesApi.tripAction(id, 'submit');
      setMsg('Trip submitted');
      load();
    } catch (e) { setErr(e.message); }
  }

  async function submitMonth() {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await adminServicesApi.submitMonthClaim({ claimPeriod: period });
      setMsg(res.message || `Claim ${res.claim?.claimPeriod} submitted — awaiting L1`);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function download(kind, format) {
    try {
      setErr('');
      if (kind === 'claims') await adminServicesApi.downloadClaimsExport({ format, period });
      else await adminServicesApi.downloadTripsExport({ format, period });
    } catch (e) { setErr(e.message); }
  }

  function chainProgress(c) {
    const snap = c.approvalChainSnapshot || [];
    if (!snap.length) return '—';
    const done = new Set((c.levelApprovals || []).map((a) => a.level));
    return snap.map((l) => {
      const mark = done.has(l.level) ? '✓' : (c.pendingApprovalLevel === l.level ? '…' : '○');
      return `${mark}${l.label || `L${l.level}`}`;
    }).join(' → ');
  }

  return (
    <div>
      <div className="as-card">
        <h2>My claims</h2>
        <div className="as-field" style={{ maxWidth: 180 }}>
          <label>Period</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <p>Running total (period trips): <strong>{formatPaise(running)}</strong></p>
        <p className="as-muted" style={{ marginTop: 0 }}>
          {readyCount} trip(s) ready · {draftCount ? `${draftCount} still draft (submit each first)` : 'all logged trips submitted'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" className="as-btn" disabled={busy} onClick={submitMonth}>
            {busy ? 'Submitting…' : 'Submit monthly claim for approval'}
          </button>
          <button type="button" className="as-btn secondary" onClick={() => download('trips', 'xlsx')}>Excel trips</button>
          <button type="button" className="as-btn secondary" onClick={() => download('trips', 'pdf')}>PDF trips</button>
          <button type="button" className="as-btn secondary" onClick={() => download('claims', 'xlsx')}>Excel claims</button>
          <button type="button" className="as-btn secondary" onClick={() => download('claims', 'pdf')}>PDF claims</button>
        </div>
        {msg && <p className="as-muted">{msg}</p>}
        {err && <p className="as-error">{err}</p>}
      </div>

      <div className="as-card">
        <h2>Trips — {period}</h2>
        <table className="as-table">
          <thead>
            <tr>
              <th>Date</th><th>Status</th><th>Distance</th><th>Amount</th><th>Flags</th><th />
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t._id}>
                <td>{String(t.travelDate).slice(0, 10)}</td>
                <td><span className={`as-pill ${tripStatusTone(t.status)}`}>{t.status}</span></td>
                <td>{formatKm(t.claimedDistanceMetres)}</td>
                <td>{formatPaise(t.totalClaimPaise)}</td>
                <td>{(t.exceptionFlags || []).join(', ') || '—'}</td>
                <td>
                  {['DRAFT', 'RETURNED'].includes(t.status) && (
                    <button type="button" className="as-btn secondary" onClick={() => submitTrip(t._id)}>Submit trip</button>
                  )}
                </td>
              </tr>
            ))}
            {!trips.length && (
              <tr><td colSpan={6} className="as-muted">No trips this period — log trips first.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="as-card">
        <h2>Prior / open claims</h2>
        <table className="as-table">
          <thead>
            <tr>
              <th>Period</th><th>Status</th><th>Approval</th><th>Trips</th><th>Total</th><th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c._id}>
                <td>{c.claimPeriod}</td>
                <td><span className={`as-pill ${claimStatusTone(c.status)}`}>{claimStatusLabel(c.status)}</span></td>
                <td className="as-muted" style={{ fontSize: 12 }}>{chainProgress(c)}</td>
                <td>{c.tripCount}</td>
                <td>{formatPaise(c.grandTotalPaise)}</td>
                <td>{c.paymentReference || '—'}</td>
              </tr>
            ))}
            {!claims.length && (
              <tr><td colSpan={6} className="as-muted">No claims yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
