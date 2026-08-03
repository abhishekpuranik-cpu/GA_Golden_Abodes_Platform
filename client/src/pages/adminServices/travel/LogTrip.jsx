import { useEffect, useMemo, useState } from 'react';
import { useAdminServices } from '../AdminServicesLayout.jsx';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { formatKm, formatPaise, PURPOSES, VEHICLE_TYPES } from '../../../lib/adminServicesTabs.js';

export default function LogTrip() {
  const { entityTag, user } = useAdminServices();
  const [locations, setLocations] = useState([]);
  const [stops, setStops] = useState(['', '']);
  const [roundTrip, setRoundTrip] = useState(true);
  const [vehicleType, setVehicleType] = useState('TWO_WHEELER');
  const [purpose, setPurpose] = useState('SITE_VISIT');
  const [purposeNote, setPurposeNote] = useState('');
  const [travelDate, setTravelDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState(null);
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [claimedKm, setClaimedKm] = useState('');
  const [ancillary, setAncillary] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminServicesApi.listLocations({ entityTag, limit: 200 })
      .then((d) => setLocations(d.locations || []))
      .catch(() => setLocations([]));
  }, [entityTag]);

  const routeIds = useMemo(() => stops.filter(Boolean), [stops]);

  useEffect(() => {
    if (routeIds.length < 2) { setPreview(null); return; }
    const t = setTimeout(() => {
      adminServicesApi.previewDistance({
        route: routeIds.join(','),
        roundTrip: String(roundTrip),
        entityTag
      }).then(setPreview).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [routeIds.join(','), roundTrip, entityTag]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const body = {
        entityTag,
        travelDate,
        purpose,
        purposeNote,
        vehicleType,
        route: routeIds,
        isRoundTrip: roundTrip,
        isOverride,
        overrideReason: isOverride ? overrideReason : undefined,
        claimedDistanceMetres: isOverride ? Math.round(Number(claimedKm) * 1000) : undefined,
        ancillary,
        confirmDuplicate: false
      };
      const res = await adminServicesApi.createTrip(body);
      setMsg(`Trip saved as DRAFT · ${formatKm(res.trip.claimedDistanceMetres)} · ${formatPaise(res.trip.totalClaimPaise)}`);
      setStops(['', '']);
      setAncillary([]);
      setIsOverride(false);
    } catch (ex) {
      if (ex.data?.code === 'DUPLICATE_TRIP') {
        const ok = window.confirm(`${ex.message}\n\nConfirm duplicate?`);
        if (ok) {
          try {
            const res = await adminServicesApi.createTrip({
              entityTag, travelDate, purpose, purposeNote, vehicleType,
              route: routeIds, isRoundTrip: roundTrip, isOverride,
              overrideReason: isOverride ? overrideReason : undefined,
              claimedDistanceMetres: isOverride ? Math.round(Number(claimedKm) * 1000) : undefined,
              ancillary, confirmDuplicate: true
            });
            setMsg(`Duplicate confirmed · DRAFT · ${formatPaise(res.trip.totalClaimPaise)}`);
          } catch (e2) {
            setErr(e2.message);
          }
        } else setErr(ex.message);
      } else setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="as-card">
      <h2>Log a trip</h2>
      <p className="as-muted">Distance is computed from the verified matrix — never typed as free text.</p>
      <form onSubmit={submit}>
        <div className="as-row">
          <div className="as-field">
            <label>Date</label>
            <input type="date" value={travelDate} onChange={(e) => setTravelDate(e.target.value)} required />
          </div>
          <div className="as-field">
            <label>Vehicle</label>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="as-field">
            <label>Purpose</label>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="as-field">
          <label>Note</label>
          <input value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} placeholder="Optional" />
        </div>

        <h3 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Route</h3>
        {stops.map((s, i) => (
          <div className="as-stop-row" key={i}>
            <select value={s} onChange={(e) => {
              const next = [...stops];
              next[i] = e.target.value;
              setStops(next);
            }} required>
              <option value="">Stop {i + 1}</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>{l.name} ({l.category})</option>
              ))}
            </select>
            {stops.length > 2 && (
              <button type="button" className="as-btn secondary" onClick={() => setStops(stops.filter((_, j) => j !== i))}>Remove</button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button type="button" className="as-btn secondary" onClick={() => setStops([...stops, ''])}>Add stop</button>
          <label className="as-muted">
            <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} /> Return to start
          </label>
        </div>

        {preview && (
          <div className="as-card" style={{ background: 'var(--ga-canvas)' }}>
            <strong>Preview</strong>
            {preview.legs.map((leg, i) => (
              <div className="as-leg" key={i}>
                <span>{leg.fromName} → {leg.toName}</span>
                <span>
                  {formatKm(leg.distanceMetres)}{' '}
                  <span className={`as-pill ${leg.verified ? 'success' : 'warning'}`}>
                    {leg.verified ? 'Verified' : 'Estimated'}
                  </span>
                </span>
              </div>
            ))}
            <p style={{ marginTop: '0.75rem' }}>
              Claimable: <strong>{formatKm(preview.claimableMetres)}</strong>
              {' · '}Basis: {preview.basis}
            </p>
          </div>
        )}

        <label className="as-muted">
          <input type="checkbox" checked={isOverride} onChange={(e) => setIsOverride(e.target.checked)} />
          {' '}Override distance (raises exception)
        </label>
        {isOverride && (
          <div className="as-row">
            <div className="as-field">
              <label>Claimed km</label>
              <input type="number" step="0.1" value={claimedKm} onChange={(e) => setClaimedKm(e.target.value)} required />
            </div>
            <div className="as-field">
              <label>Reason (≥15 chars)</label>
              <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} required minLength={15} />
            </div>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <button className="as-btn" type="submit" disabled={busy || routeIds.length < 2}>
            {busy ? 'Saving…' : 'Save draft trip'}
          </button>
        </div>
        {msg && <p className="as-muted">{msg}</p>}
        {err && <p className="as-error">{err}</p>}
        <p className="as-muted" style={{ marginTop: '0.75rem' }}>Claimant: {user?.email}</p>
      </form>
    </div>
  );
}
