import { useEffect, useState } from 'react';
import { useAdminServices } from '../AdminServicesLayout.jsx';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { VEHICLE_TYPES, formatPaise } from '../../../lib/adminServicesTabs.js';

export default function Setup() {
  const { entityTag } = useAdminServices();
  const [policy, setPolicy] = useState(null);
  const [rates, setRates] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [rateForm, setRateForm] = useState({
    vehicleType: 'TWO_WHEELER',
    ratePerKmPaise: 400,
    effectiveFrom: new Date().toISOString().slice(0, 10)
  });

  async function load() {
    try {
      const [p, r] = await Promise.all([
        adminServicesApi.getPolicy(entityTag),
        adminServicesApi.listRates({ entityTag })
      ]);
      setPolicy(p.policy);
      setRates(r.rates || []);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, [entityTag]);

  async function savePolicy(e) {
    e.preventDefault();
    try {
      const body = {
        roadFactor: Number(policy.roadFactor),
        dailyCapKm: Number(policy.dailyCapKm),
        monthlyCapKm: Number(policy.monthlyCapKm),
        backdatingWindowDays: Number(policy.backdatingWindowDays),
        homeToOfficeClaimable: !!policy.homeToOfficeClaimable,
        requireReceiptAboveAncillaryPaise: Number(policy.requireReceiptAboveAncillaryPaise),
        finalApproverUserId: policy.finalApproverUserId || null,
        alternateApproverUserId: policy.alternateApproverUserId || null,
        verifierAssignments: policy.verifierAssignments || []
      };
      const res = await adminServicesApi.updatePolicy(entityTag, body);
      setPolicy(res.policy);
      setMsg('Policy saved');
    } catch (ex) { setErr(ex.message); }
  }

  async function addRate(e) {
    e.preventDefault();
    try {
      await adminServicesApi.createRate({
        entityTag,
        ...rateForm,
        ratePerKmPaise: Math.round(Number(rateForm.ratePerKmPaise))
      });
      setMsg('Rate card added');
      load();
    } catch (ex) { setErr(ex.message); }
  }

  if (!policy) return <div className="as-card"><p className="as-muted">Loading setup…</p>{err && <p className="as-error">{err}</p>}</div>;

  return (
    <div>
      <div className="as-card">
        <h2>Policy — {entityTag}</h2>
        <p className="as-muted">Nothing here is hardcoded in app code. Approver IDs are editable without a deploy.</p>
        <form onSubmit={savePolicy}>
          <div className="as-row">
            <div className="as-field"><label>Road factor</label>
              <input type="number" step="0.01" value={policy.roadFactor} onChange={(e) => setPolicy({ ...policy, roadFactor: e.target.value })} /></div>
            <div className="as-field"><label>Daily cap (km)</label>
              <input type="number" value={policy.dailyCapKm} onChange={(e) => setPolicy({ ...policy, dailyCapKm: e.target.value })} /></div>
            <div className="as-field"><label>Monthly cap (km)</label>
              <input type="number" value={policy.monthlyCapKm} onChange={(e) => setPolicy({ ...policy, monthlyCapKm: e.target.value })} /></div>
            <div className="as-field"><label>Backdating window (days)</label>
              <input type="number" value={policy.backdatingWindowDays} onChange={(e) => setPolicy({ ...policy, backdatingWindowDays: e.target.value })} /></div>
            <div className="as-field"><label>Receipt above (paise)</label>
              <input type="number" value={policy.requireReceiptAboveAncillaryPaise} onChange={(e) => setPolicy({ ...policy, requireReceiptAboveAncillaryPaise: e.target.value })} /></div>
          </div>
          <label className="as-muted">
            <input type="checkbox" checked={!!policy.homeToOfficeClaimable} onChange={(e) => setPolicy({ ...policy, homeToOfficeClaimable: e.target.checked })} />
            {' '}Home↔office claimable
          </label>
          <div className="as-row" style={{ marginTop: '0.75rem' }}>
            <div className="as-field"><label>Final approver user id</label>
              <input value={policy.finalApproverUserId || ''} onChange={(e) => setPolicy({ ...policy, finalApproverUserId: e.target.value || null })} /></div>
            <div className="as-field"><label>Alternate approver user id</label>
              <input value={policy.alternateApproverUserId || ''} onChange={(e) => setPolicy({ ...policy, alternateApproverUserId: e.target.value || null })} /></div>
          </div>
          <button className="as-btn" type="submit">Save policy</button>
        </form>
      </div>

      <div className="as-card">
        <h2>Rate cards</h2>
        <p className="as-muted">Placeholder rates show notes: PLACEHOLDER — confirm before go-live.</p>
        <table className="as-table">
          <thead><tr><th>Vehicle</th><th>₹/km</th><th>From</th><th>To</th><th>Notes</th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r._id}>
                <td>{r.vehicleType}</td>
                <td>{formatPaise(r.ratePerKmPaise)}/km</td>
                <td>{String(r.effectiveFrom).slice(0, 10)}</td>
                <td>{r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : 'current'}</td>
                <td>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addRate} style={{ marginTop: '1rem' }}>
          <div className="as-row">
            <div className="as-field">
              <label>Vehicle</label>
              <select value={rateForm.vehicleType} onChange={(e) => setRateForm({ ...rateForm, vehicleType: e.target.value })}>
                {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="as-field">
              <label>Rate (paise/km)</label>
              <input type="number" value={rateForm.ratePerKmPaise} onChange={(e) => setRateForm({ ...rateForm, ratePerKmPaise: e.target.value })} />
            </div>
            <div className="as-field">
              <label>Effective from</label>
              <input type="date" value={rateForm.effectiveFrom} onChange={(e) => setRateForm({ ...rateForm, effectiveFrom: e.target.value })} />
            </div>
          </div>
          <button className="as-btn" type="submit">Add rate card</button>
        </form>
        {msg && <p className="as-muted">{msg}</p>}
        {err && <p className="as-error">{err}</p>}
      </div>
    </div>
  );
}
