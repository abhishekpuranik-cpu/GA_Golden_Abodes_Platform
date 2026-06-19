import { useEffect, useMemo, useState } from 'react';
import { ENTITIES } from '../../data/postsales/steps.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

const empty = {
  name: '', phone: '', email: '', pan: '', fundingType: 'home_loan', hasCoApplicant: false,
  coApplicantName: '', coApplicantPhone: '',
  project: '', entity: 'GAPL', phase: '', building: '', tower: '', unitNumber: '', floor: '',
  carpetArea: '', saleableArea: '', bookingDate: '', bookingAmount: '', totalCost: '',
  paymentPlan: 'CLP', crmExecutive: '', cxExecutive: '', backendExecutive: '', salesExecutive: '',
};

export default function NewUnitModal({ onClose, onSubmit }) {
  const [form, setForm] = useState(empty);
  const [catalog, setCatalog] = useState({ projects: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    postSalesApi.getInventoryCatalog()
      .then((data) => {
        setCatalog(data);
        const first = data.projects?.[0];
        if (first) {
          setForm((f) => ({
            ...f,
            project: first.name,
            entity: first.entity || 'GAPL',
            phase: first.phases?.[0]?.name || '',
            building: first.phases?.[0]?.buildings?.[0]?.name || '',
          }));
        }
      })
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const projectRow = useMemo(
    () => (catalog.projects || []).find((p) => p.name === form.project),
    [catalog, form.project],
  );

  const phaseOptions = projectRow?.phases || [];
  const buildingOptions = useMemo(() => {
    const ph = phaseOptions.find((x) => x.name === form.phase);
    return ph?.buildings || [];
  }, [phaseOptions, form.phase]);

  const handleProject = (project) => {
    const p = (catalog.projects || []).find((x) => x.name === project);
    const phase = p?.phases?.[0]?.name || '';
    const building = p?.phases?.[0]?.buildings?.[0]?.name || '';
    setForm((f) => ({
      ...f,
      project,
      entity: p?.entity || f.entity,
      phase,
      building,
      tower: building,
    }));
  };

  const handlePhase = (phase) => {
    const ph = phaseOptions.find((x) => x.name === phase);
    const building = ph?.buildings?.[0]?.name || '';
    setForm((f) => ({ ...f, phase, building, tower: building }));
  };

  const handleBuilding = (building) => {
    setForm((f) => ({ ...f, building, tower: building }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const customer = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        pan: form.pan,
        fundingType: form.fundingType,
        coApplicant: form.hasCoApplicant ? { name: form.coApplicantName, phone: form.coApplicantPhone } : undefined,
      };
      const unit = {
        unitNumber: form.unitNumber,
        tower: form.building || form.tower,
        building: form.building || form.tower,
        phase: form.phase || undefined,
        floor: Number(form.floor) || undefined,
        carpetArea: Number(form.carpetArea) || undefined,
        saleableArea: Number(form.saleableArea) || undefined,
        project: form.project,
        entity: form.entity,
        bookingDate: form.bookingDate || new Date().toISOString(),
        bookingAmount: Number(form.bookingAmount) || 0,
        totalCost: Number(form.totalCost) || 0,
        paymentPlan: form.paymentPlan,
        crmExecutive: form.crmExecutive,
        cxExecutive: form.cxExecutive || form.crmExecutive,
        backendExecutive: form.backendExecutive || form.crmExecutive,
        salesExecutive: form.salesExecutive,
        gstApplicable: true,
      };
      await onSubmit(customer, unit);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const projects = catalog.projects?.length ? catalog.projects : [];

  return (
    <div className="ps-modal-overlay" onClick={onClose}>
      <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>New sold unit</h3>
        {error && <div className="ps-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <h4>Customer details</h4>
          <div className="ps-form-group"><label>Name *</label><input required value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="ps-form-group"><label>Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="ps-form-group"><label>Email</label><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="ps-form-group"><label>PAN</label><input value={form.pan} onChange={(e) => set('pan', e.target.value)} /></div>
          <div className="ps-form-group">
            <label>Funding type</label>
            <select value={form.fundingType} onChange={(e) => set('fundingType', e.target.value)}>
              <option value="home_loan">Home loan</option>
              <option value="self_funded">Self-funded</option>
            </select>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input type="checkbox" checked={form.hasCoApplicant} onChange={(e) => set('hasCoApplicant', e.target.checked)} />
            Co-applicant
          </label>
          {form.hasCoApplicant && (
            <>
              <div className="ps-form-group"><label>Co-applicant name</label><input value={form.coApplicantName} onChange={(e) => set('coApplicantName', e.target.value)} /></div>
              <div className="ps-form-group"><label>Co-applicant phone</label><input value={form.coApplicantPhone} onChange={(e) => set('coApplicantPhone', e.target.value)} /></div>
            </>
          )}

          <h4>Unit details</h4>
          <div className="ps-form-group">
            <label>Project</label>
            <select required value={form.project} onChange={(e) => handleProject(e.target.value)}>
              {!projects.length && <option value="">Add projects in Inventory setup</option>}
              {projects.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className="ps-grid-2">
            <div className="ps-form-group">
              <label>Phase</label>
              <select value={form.phase} onChange={(e) => handlePhase(e.target.value)}>
                <option value="">—</option>
                {phaseOptions.map((ph) => <option key={ph.name} value={ph.name}>{ph.name}</option>)}
              </select>
            </div>
            <div className="ps-form-group">
              <label>Building / tower</label>
              <select value={form.building} onChange={(e) => handleBuilding(e.target.value)}>
                <option value="">—</option>
                {buildingOptions.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-form-group">
            <label>Entity</label>
            <select value={form.entity} onChange={(e) => set('entity', e.target.value)}>
              {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="ps-form-group"><label>Unit number *</label><input required value={form.unitNumber} onChange={(e) => set('unitNumber', e.target.value)} /></div>
          <div className="ps-form-group"><label>Floor</label><input type="number" value={form.floor} onChange={(e) => set('floor', e.target.value)} /></div>
          <div className="ps-form-group"><label>Carpet area (sq ft)</label><input type="number" value={form.carpetArea} onChange={(e) => set('carpetArea', e.target.value)} /></div>
          <div className="ps-form-group"><label>Saleable area (sq ft)</label><input type="number" value={form.saleableArea} onChange={(e) => set('saleableArea', e.target.value)} /></div>
          <div className="ps-form-group"><label>Booking date</label><input type="date" value={form.bookingDate} onChange={(e) => set('bookingDate', e.target.value)} /></div>
          <div className="ps-form-group"><label>Booking amount</label><input type="number" value={form.bookingAmount} onChange={(e) => set('bookingAmount', e.target.value)} /></div>
          <div className="ps-form-group"><label>Total cost</label><input type="number" value={form.totalCost} onChange={(e) => set('totalCost', e.target.value)} /></div>
          <div className="ps-form-group">
            <label>Payment plan</label>
            <select value={form.paymentPlan} onChange={(e) => set('paymentPlan', e.target.value)}>
              <option value="CLP">CLP</option>
              <option value="Flexi">Flexi</option>
              <option value="Down Payment">Down Payment</option>
            </select>
          </div>
          <div className="ps-form-group"><label>CRM executive (fallback)</label><input value={form.crmExecutive} onChange={(e) => set('crmExecutive', e.target.value)} placeholder="Used when CX/Backend not set" /></div>
          <div className="ps-form-group"><label>CX executive (customer interaction)</label><input value={form.cxExecutive} onChange={(e) => set('cxExecutive', e.target.value)} placeholder="Welcome calls, agreements, possession…" /></div>
          <div className="ps-form-group"><label>Backend executive (coordination)</label><input value={form.backendExecutive} onChange={(e) => set('backendExecutive', e.target.value)} placeholder="Data entry, demands, CHS, helpdesk…" /></div>
          <div className="ps-form-group"><label>Sales executive</label><input value={form.salesExecutive} onChange={(e) => set('salesExecutive', e.target.value)} /></div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="ps-btn ps-btn-primary" disabled={saving || !form.project}>{saving ? 'Creating…' : 'Create unit'}</button>
            <button type="button" className="ps-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
