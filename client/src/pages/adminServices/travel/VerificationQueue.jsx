import { useEffect, useState } from 'react';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { formatKm, formatPaise } from '../../../lib/adminServicesTabs.js';

export default function VerificationQueue() {
  const [trips, setTrips] = useState([]);
  const [err, setErr] = useState('');
  const [comment, setComment] = useState('');

  async function load() {
    try {
      const d = await adminServicesApi.listTrips({ status: 'SUBMITTED', limit: 100 });
      setTrips(d.trips || []);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function act(id, action) {
    try {
      if ((action === 'return' || action === 'reject') && !comment.trim()) {
        setErr('Comment required');
        return;
      }
      await adminServicesApi.tripAction(id, action, { comment });
      setComment('');
      load();
    } catch (e) { setErr(e.message); }
  }

  async function bulkVerify() {
    for (const t of trips) {
      try { await adminServicesApi.tripAction(t._id, 'verify'); } catch { /* continue */ }
    }
    load();
  }

  return (
    <div className="as-card">
      <h2>Verification queue</h2>
      <p className="as-muted">Trips awaiting department verification.</p>
      <div className="as-field">
        <label>Comment (required for return/reject)</label>
        <input value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button type="button" className="as-btn" onClick={bulkVerify}>Bulk verify all listed</button>
        <button type="button" className="as-btn secondary" onClick={() => adminServicesApi.downloadTripsExport({ format: 'xlsx', status: 'SUBMITTED' }).catch((e) => setErr(e.message))}>Excel</button>
        <button type="button" className="as-btn secondary" onClick={() => adminServicesApi.downloadTripsExport({ format: 'pdf', status: 'SUBMITTED' }).catch((e) => setErr(e.message))}>PDF</button>
      </div>
      {err && <p className="as-error">{err}</p>}
      <table className="as-table">
        <thead>
          <tr><th>Date</th><th>Employee</th><th>Distance</th><th>Amount</th><th>Flags</th><th /></tr>
        </thead>
        <tbody>
          {trips.map((t) => (
            <tr key={t._id}>
              <td>{String(t.travelDate).slice(0, 10)}</td>
              <td>{String(t.employeeId).slice(-6)}</td>
              <td>{formatKm(t.claimedDistanceMetres)}</td>
              <td>{formatPaise(t.totalClaimPaise)}</td>
              <td>{(t.exceptionFlags || []).join(', ') || '—'}</td>
              <td style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="as-btn" onClick={() => act(t._id, 'verify')}>Verify</button>
                <button type="button" className="as-btn warn" onClick={() => act(t._id, 'return')}>Return</button>
                <button type="button" className="as-btn danger" onClick={() => act(t._id, 'reject')}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
