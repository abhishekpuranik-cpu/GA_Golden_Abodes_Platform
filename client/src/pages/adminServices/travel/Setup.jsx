import { useEffect, useState } from 'react';
import { useAdminServices } from '../AdminServicesLayout.jsx';
import { adminServicesApi } from '../../../lib/adminServicesApi.js';
import { VEHICLE_TYPES, formatPaise } from '../../../lib/adminServicesTabs.js';

function personLabel(u) {
  if (!u) return '—';
  return u.name ? `${u.name} (${u.email})` : (u.email || u.id || '—');
}

export default function Setup() {
  const { entityTag } = useAdminServices();
  const [policy, setPolicy] = useState(null);
  const [rates, setRates] = useState([]);
  const [chains, setChains] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [rateForm, setRateForm] = useState({
    vehicleType: 'TWO_WHEELER',
    ratePerKmPaise: 400,
    effectiveFrom: new Date().toISOString().slice(0, 10)
  });
  const [chainForm, setChainForm] = useState({
    employeeQuery: '',
    employeeUserId: '',
    employeeLabel: '',
    l1Query: '',
    l1UserId: '',
    l1Label: '',
    l2Query: '',
    l2UserId: '',
    l2Label: '',
    notes: ''
  });
  const [lookups, setLookups] = useState({ employee: [], l1: [], l2: [] });

  async function load() {
    try {
      const [p, r, c] = await Promise.all([
        adminServicesApi.getPolicy(entityTag),
        adminServicesApi.listRates({ entityTag }),
        adminServicesApi.listChains()
      ]);
      setPolicy(p.policy);
      setRates(r.rates || []);
      setChains(c.chains || []);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, [entityTag]);

  async function searchUsers(field, qStr) {
    try {
      const res = await adminServicesApi.usersLookup(qStr);
      setLookups((prev) => ({ ...prev, [field]: res.users || [] }));
    } catch (e) { setErr(e.message); }
  }

  function pickUser(field, u) {
    if (field === 'employee') {
      setChainForm((f) => ({
        ...f,
        employeeUserId: u.id,
        employeeLabel: personLabel(u),
        employeeQuery: u.email || u.name
      }));
      setLookups((p) => ({ ...p, employee: [] }));
    } else if (field === 'l1') {
      setChainForm((f) => ({
        ...f,
        l1UserId: u.id,
        l1Label: personLabel(u),
        l1Query: u.email || u.name
      }));
      setLookups((p) => ({ ...p, l1: [] }));
    } else if (field === 'l2') {
      setChainForm((f) => ({
        ...f,
        l2UserId: u.id,
        l2Label: personLabel(u),
        l2Query: u.email || u.name
      }));
      setLookups((p) => ({ ...p, l2: [] }));
    }
  }

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

  async function saveChain(e) {
    e.preventDefault();
    setErr('');
    try {
      if (!chainForm.employeeUserId || !chainForm.l1UserId) {
        setErr('Employee and L1 approver are required');
        return;
      }
      const levels = [
        { level: 1, label: 'L1', approverUserId: chainForm.l1UserId }
      ];
      if (chainForm.l2UserId) {
        levels.push({ level: 2, label: 'L2', approverUserId: chainForm.l2UserId });
      }
      await adminServicesApi.upsertChain({
        employeeUserId: chainForm.employeeUserId,
        levels,
        entityTag: '',
        notes: chainForm.notes || 'Configured in Setup'
      });
      setMsg('Approval chain saved');
      setChainForm({
        employeeQuery: '',
        employeeUserId: '',
        employeeLabel: '',
        l1Query: '',
        l1UserId: '',
        l1Label: '',
        l2Query: '',
        l2UserId: '',
        l2Label: '',
        notes: ''
      });
      load();
    } catch (ex) { setErr(ex.message); }
  }

  if (!policy) return <div className="as-card"><p className="as-muted">Loading setup…</p>{err && <p className="as-error">{err}</p>}</div>;

  return (
    <div>
      <div className="as-card">
        <h2>Approval chains</h2>
        <p className="as-muted">
          Standard pattern: employee → L1 manager → L2 director. Add more people the same way — no code change needed.
          Example: Mahesh → Akash (L1) → you (L2).
        </p>
        <table className="as-table">
          <thead>
            <tr><th>Employee</th><th>L1</th><th>L2+</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr key={c._id}>
                <td>{personLabel(c.employee)}</td>
                <td>{personLabel(c.levels?.find((l) => l.level === 1)?.approver)}</td>
                <td>
                  {(c.levels || [])
                    .filter((l) => l.level > 1)
                    .map((l) => `L${l.level}: ${personLabel(l.approver)}`)
                    .join(' · ') || '—'}
                </td>
                <td>{c.notes || '—'}</td>
              </tr>
            ))}
            {!chains.length && (
              <tr><td colSpan={4} className="as-muted">No chains yet — seed on boot or add below.</td></tr>
            )}
          </tbody>
        </table>

        <form onSubmit={saveChain} style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Add / update chain</h3>
          <div className="as-row">
            <div className="as-field" style={{ flex: 1, position: 'relative' }}>
              <label>Employee</label>
              <input
                value={chainForm.employeeQuery}
                placeholder="Search name or email"
                onChange={(e) => {
                  const v = e.target.value;
                  setChainForm((f) => ({ ...f, employeeQuery: v, employeeUserId: '', employeeLabel: '' }));
                  if (v.trim().length >= 2) searchUsers('employee', v);
                }}
              />
              {chainForm.employeeLabel && <p className="as-muted" style={{ margin: '0.25rem 0 0' }}>{chainForm.employeeLabel}</p>}
              {lookups.employee.length > 0 && (
                <ul className="as-lookup">
                  {lookups.employee.map((u) => (
                    <li key={u.id}><button type="button" onClick={() => pickUser('employee', u)}>{personLabel(u)}</button></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="as-field" style={{ flex: 1, position: 'relative' }}>
              <label>L1 approver</label>
              <input
                value={chainForm.l1Query}
                placeholder="Search name or email"
                onChange={(e) => {
                  const v = e.target.value;
                  setChainForm((f) => ({ ...f, l1Query: v, l1UserId: '', l1Label: '' }));
                  if (v.trim().length >= 2) searchUsers('l1', v);
                }}
              />
              {chainForm.l1Label && <p className="as-muted" style={{ margin: '0.25rem 0 0' }}>{chainForm.l1Label}</p>}
              {lookups.l1.length > 0 && (
                <ul className="as-lookup">
                  {lookups.l1.map((u) => (
                    <li key={u.id}><button type="button" onClick={() => pickUser('l1', u)}>{personLabel(u)}</button></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="as-field" style={{ flex: 1, position: 'relative' }}>
              <label>L2 approver (optional)</label>
              <input
                value={chainForm.l2Query}
                placeholder="Search name or email"
                onChange={(e) => {
                  const v = e.target.value;
                  setChainForm((f) => ({ ...f, l2Query: v, l2UserId: '', l2Label: '' }));
                  if (v.trim().length >= 2) searchUsers('l2', v);
                }}
              />
              {chainForm.l2Label && <p className="as-muted" style={{ margin: '0.25rem 0 0' }}>{chainForm.l2Label}</p>}
              {lookups.l2.length > 0 && (
                <ul className="as-lookup">
                  {lookups.l2.map((u) => (
                    <li key={u.id}><button type="button" onClick={() => pickUser('l2', u)}>{personLabel(u)}</button></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="as-field">
            <label>Notes</label>
            <input value={chainForm.notes} onChange={(e) => setChainForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <button className="as-btn" type="submit">Save approval chain</button>
        </form>
      </div>

      <div className="as-card">
        <h2>Policy — {entityTag}</h2>
        <p className="as-muted">
          Fallback when an employee has no chain: uses final approver as single L1.
          Prefer per-employee chains above for scalable L1 → L2.
        </p>
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
            <div className="as-field"><label>Final approver user id (fallback L1)</label>
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
                {VEHICLE_TYPES.map((v) => <option key={v.id || v} value={v.id || v}>{v.label || v}</option>)}
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
