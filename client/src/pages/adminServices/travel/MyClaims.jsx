import { useEffect, useState } from 'react';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { formatKm, formatPaise } from '../../../lib/adminServicesTabs.js';

function periodNow() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function statusTone(s) {
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

  async function load() {
    try {
      const [t, c] = await Promise.all([
        adminServicesApi.listTrips({ period }),
        adminServicesApi.listClaims({})
      ]);
      setTrips(t.trips || []);
      setClaims(c.claims || []);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, [period]);

  const running = trips.reduce((s, t) => s + (t.totalClaimPaise || 0), 0);

  async function submitTrip(id) {
    try {
      await adminServicesApi.tripAction(id, 'submit');
      setMsg('Trip submitted');
      load();
    } catch (e) { setErr(e.message); }
  }

  async function generate() {
    try {
      const res = await adminServicesApi.generateClaim({ claimPeriod: period });
      setMsg(`Claim ${res.claim.claimPeriod} generated (${res.claim.tripCount} trips)`);
      load();
    } catch (e) { setErr(e.message); }
  }

  async function submitClaim(id) {
    try {
      await adminServicesApi.claimAction(id, 'submit');
      setMsg('Claim submitted for the month');
      load();
    } catch (e) { setErr(e.message); }
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
        <button type="button" className="as-btn" onClick={generate}>Generate monthly claim from VERIFIED trips</button>
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
                <td><span className={`as-pill ${statusTone(t.status)}`}>{t.status}</span></td>
                <td>{formatKm(t.claimedDistanceMetres)}</td>
                <td>{formatPaise(t.totalClaimPaise)}</td>
                <td>{(t.exceptionFlags || []).join(', ') || '—'}</td>
                <td>
                  {['DRAFT', 'RETURNED'].includes(t.status) && (
                    <button type="button" className="as-btn secondary" onClick={() => submitTrip(t._id)}>Submit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="as-card">
        <h2>Prior / open claims</h2>
        <table className="as-table">
          <thead>
            <tr>
              <th>Period</th><th>Status</th><th>Trips</th><th>Total</th><th>Payment</th><th />
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c._id}>
                <td>{c.claimPeriod}</td>
                <td><span className={`as-pill ${statusTone(c.status)}`}>{c.status}</span></td>
                <td>{c.tripCount}</td>
                <td>{formatPaise(c.grandTotalPaise)}</td>
                <td>{c.paymentReference || '—'}</td>
                <td>
                  {['OPEN', 'RETURNED'].includes(c.status) && (
                    <button type="button" className="as-btn" onClick={() => submitClaim(c._id)}>Submit month</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
