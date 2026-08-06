import { useEffect, useState } from 'react';
import { useAdminServices } from '../AdminServicesLayout.jsx';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { formatKm, parseLatLng, LOCATION_CATEGORIES } from '../../../lib/adminServicesTabs.js';

export default function LocationsDistances() {
  const { entityTag, permissions } = useAdminServices();
  const [locations, setLocations] = useState([]);
  const [distances, setDistances] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'OFFICE', coords: '', address: '' });
  const [verifyId, setVerifyId] = useState('');
  const [verifyMetres, setVerifyMetres] = useState('');
  const [verifyReason, setVerifyReason] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const [l, d] = await Promise.all([
        adminServicesApi.listLocations({ entityTag, limit: 200 }),
        adminServicesApi.listDistances({ sort: 'usage' })
      ]);
      setLocations(l.locations || []);
      setDistances(d.distances || []);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, [entityTag]);

  async function addLocation(e) {
    e.preventDefault();
    setErr('');
    const parsed = parseLatLng(form.coords);
    if (!parsed) { setErr('Paste lat,lng or a Google Maps URL with @lat,lng'); return; }
    try {
      await adminServicesApi.createLocation({
        entityTag,
        name: form.name,
        category: form.category,
        lat: parsed.lat,
        lng: parsed.lng,
        address: form.address
      });
      setMsg('Location added');
      setForm({ name: '', category: 'OFFICE', coords: '', address: '' });
      load();
    } catch (ex) { setErr(ex.message); }
  }

  async function verifyPair(e) {
    e.preventDefault();
    try {
      await adminServicesApi.verifyDistance(verifyId, {
        distanceMetres: Math.round(Number(verifyMetres) * 1000),
        source: 'MANUAL',
        reason: verifyReason || 'verified'
      });
      setMsg('Distance verified');
      setVerifyId('');
      load();
    } catch (ex) { setErr(ex.message); }
  }

  return (
    <div>
      {permissions.admin && (
        <div className="as-card">
          <h2>Add location</h2>
          <form onSubmit={addLocation}>
            <div className="as-row">
              <div className="as-field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="as-field">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {LOCATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="as-field">
              <label>Coordinates (lat,lng or Maps URL)</label>
              <input value={form.coords} onChange={(e) => setForm({ ...form, coords: e.target.value })} required placeholder="18.6298, 73.7997" />
            </div>
            <div className="as-field">
              <label>Address (reference only)</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <button className="as-btn" type="submit">Save location</button>
          </form>
        </div>
      )}

      <div className="as-card">
        <h2>Locations — {entityTag}</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem' }}>
          <button type="button" className="as-btn secondary" onClick={() => adminServicesApi.downloadLocationsExport({ format: 'xlsx', entityTag }).catch((e) => setErr(e.message))}>Excel</button>
          <button type="button" className="as-btn secondary" onClick={() => adminServicesApi.downloadLocationsExport({ format: 'pdf', entityTag }).catch((e) => setErr(e.message))}>PDF</button>
        </div>
        <table className="as-table">
          <thead><tr><th>Name</th><th>Category</th><th>Lat</th><th>Lng</th></tr></thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l._id}>
                <td>{l.name}</td>
                <td>{l.category}</td>
                <td>{l.lat}</td>
                <td>{l.lng}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="as-card">
        <h2>Distance matrix (by usage)</h2>
        <p className="as-muted">Busiest pairs first — verify these before rare routes.</p>
        <table className="as-table">
          <thead>
            <tr><th>From</th><th>To</th><th>Straight</th><th>In use</th><th>Status</th><th>Claims</th></tr>
          </thead>
          <tbody>
            {distances.map((d) => (
              <tr key={d._id}>
                <td>{d.locationA?.name || String(d.locationAId).slice(-4)}</td>
                <td>{d.locationB?.name || String(d.locationBId).slice(-4)}</td>
                <td>{formatKm(d.straightLineMetres)}</td>
                <td>{formatKm(d.distanceMetres)}</td>
                <td>
                  <span className={`as-pill ${d.isVerified ? 'success' : 'warning'}`}>
                    {d.isVerified ? 'Verified' : 'Estimated'}
                  </span>
                </td>
                <td>{d.claimCount || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(permissions.admin || permissions.approve) && (
          <form onSubmit={verifyPair} style={{ marginTop: '1rem' }}>
            <h3>Verify pair</h3>
            <div className="as-row">
              <div className="as-field">
                <label>Pair</label>
                <select value={verifyId} onChange={(e) => setVerifyId(e.target.value)} required>
                  <option value="">Select</option>
                  {distances.map((d) => (
                    <option key={d._id} value={d._id}>
                      {(d.locationA?.name || '?')} → {(d.locationB?.name || '?')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="as-field">
                <label>Road km</label>
                <input type="number" step="0.1" value={verifyMetres} onChange={(e) => setVerifyMetres(e.target.value)} required />
              </div>
              <div className="as-field">
                <label>Reason</label>
                <input value={verifyReason} onChange={(e) => setVerifyReason(e.target.value)} />
              </div>
            </div>
            <button className="as-btn" type="submit">Verify</button>
          </form>
        )}
        {msg && <p className="as-muted">{msg}</p>}
        {err && <p className="as-error">{err}</p>}
      </div>
    </div>
  );
}
