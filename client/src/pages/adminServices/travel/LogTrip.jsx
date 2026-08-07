import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminServices } from '../AdminServicesLayout.jsx';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { formatKm, formatPaise, PURPOSES, VEHICLE_TYPES } from '../../../lib/adminServicesTabs.js';

export default function LogTrip() {
  const { entityTag, user, permissions, locations, locationsReady } = useAdminServices();
  const [stops, setStops] = useState(['', '']);
  const [roundTrip, setRoundTrip] = useState(true);
  const [vehicleType, setVehicleType] = useState('TWO_WHEELER');
  const [purpose, setPurpose] = useState('SITE_VISIT');
  const [purposeNote, setPurposeNote] = useState('');
  const [travelDate, setTravelDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [claimedKm, setClaimedKm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const routeIds = useMemo(() => stops.filter(Boolean), [stops]);

  useEffect(() => {
    if (routeIds.length < 2) { setPreview(null); return undefined; }
    let alive = true;
    setPreviewing(true);
    const t = setTimeout(() => {
      adminServicesApi.previewDistance({
        route: routeIds.join(','),
        roundTrip: String(roundTrip),
        entityTag
      })
        .then((p) => { if (alive) setPreview(p); })
        .catch(() => { if (alive) setPreview(null); })
        .finally(() => { if (alive) setPreviewing(false); });
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [routeIds.join(','), roundTrip, entityTag]);

  if (permissions && permissions.view && !permissions.claim && !permissions.staff) {
    return <Navigate to="/app/admin-services/travel/claims" replace />;
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
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
      confirmDuplicate: false
    };
    try {
      const res = await adminServicesApi.createTrip(body);
      setMsg(`Draft saved · ${formatKm(res.trip.claimedDistanceMetres)} · ${formatPaise(res.trip.totalClaimPaise)}`);
      setStops(['', '']);
      setIsOverride(false);
      setPreview(null);
    } catch (ex) {
      if (ex.data?.code === 'DUPLICATE_TRIP') {
        if (window.confirm(`${ex.message}\n\nConfirm duplicate?`)) {
          try {
            const res = await adminServicesApi.createTrip({ ...body, confirmDuplicate: true });
            setMsg(`Duplicate confirmed · ${formatPaise(res.trip.totalClaimPaise)}`);
            setStops(['', '']);
          } catch (e2) { setErr(e2.message); }
        } else setErr(ex.message);
      } else setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="as-card">
      <h2>Log a trip</h2>
      <p className="as-lede">
        Pick stops from the verified location list. Distance is locked on the server — never typed by hand.
      </p>

      <form onSubmit={submit}>
        <div className="as-row">
          <div className="as-field">
            <label>Date</label>
            <input type="date" value={travelDate} onChange={(e) => setTravelDate(e.target.value)} required />
          </div>
          <div className="as-field">
            <label>Vehicle</label>
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              {VEHICLE_TYPES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div className="as-field">
            <label>Purpose</label>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div className="as-field">
          <label>Note</label>
          <input value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} placeholder="Optional context" />
        </div>

        <div className="as-section-label">Route</div>
        {!locationsReady ? (
          <>
            <div className="as-skeleton" />
            <div className="as-skeleton" style={{ width: '70%' }} />
          </>
        ) : !(locations || []).length ? (
          <p className="as-error">
            No locations for entity {entityTag}. Ask an admin to add stops under Locations before logging trips.
          </p>
        ) : (
          <>
            {stops.map((s, i) => (
              <div className="as-stop-row" key={i}>
                <span className="as-stop-idx">{i + 1}</span>
                <select
                  value={s}
                  onChange={(e) => {
                    const nextStops = [...stops];
                    nextStops[i] = e.target.value;
                    setStops(nextStops);
                  }}
                  required
                >
                  <option value="">Select stop</option>
                  {(locations || []).map((l) => (
                    <option key={l._id} value={l._id}>{l.name}</option>
                  ))}
                </select>
                {stops.length > 2 && (
                  <button
                    type="button"
                    className="as-btn secondary"
                    aria-label="Remove stop"
                    onClick={() => setStops(stops.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="as-route-tools">
              <button type="button" className="as-btn secondary" onClick={() => setStops([...stops, ''])}>
                + Add stop
              </button>
              <label className="as-check">
                <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
                Return to start
              </label>
            </div>
          </>
        )}

        {(preview || previewing) && (
          <div className="as-preview">
            <strong>{previewing ? 'Calculating…' : 'Distance preview'}</strong>
            {preview?.legs?.map((leg, i) => (
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
            {preview && (
              <p className="as-preview-total">
                Claimable <strong>{formatKm(preview.claimableMetres)}</strong>
                <span className="as-muted"> · {preview.basis}</span>
              </p>
            )}
          </div>
        )}

        <label className="as-check" style={{ marginBottom: '0.75rem' }}>
          <input type="checkbox" checked={isOverride} onChange={(e) => setIsOverride(e.target.checked)} />
          Override distance (raises an exception)
        </label>
        {isOverride && (
          <div className="as-row as-row-2">
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

        <div className="as-actions-bar">
          <button className="as-btn block" type="submit" disabled={busy || routeIds.length < 2 || !locationsReady}>
            {busy ? 'Saving…' : 'Save draft trip'}
          </button>
        </div>
        {msg && <p className="as-ok">{msg}</p>}
        {err && <p className="as-error">{err}</p>}
        <p className="as-muted" style={{ marginTop: '0.85rem' }}>Claimant · {user?.email || 'you'}</p>
      </form>
    </div>
  );
}
