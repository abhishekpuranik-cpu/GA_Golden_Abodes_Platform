import { useState } from 'react';
import EntityTagSelect from './EntityTagSelect.jsx';
import MoneyInput from './MoneyInput.jsx';

const STATUSES = ['Draft', 'Sourcing', 'Shortlisting', 'Interviewing', 'Offer', 'Closed', 'Cancelled'];

export default function RequisitionEditForm({ initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState({
    entityTag: initial.entityTag || 'GAPL',
    role: initial.role || '',
    department: initial.department || '',
    projectName: initial.projectName || '',
    location: initial.location || 'Pune (PCMC)',
    brief: initial.brief || '',
    bandMinPaise: initial.bandMinPaise ?? null,
    bandMaxPaise: initial.bandMaxPaise ?? null,
    experienceMinYears: initial.experienceMinYears ?? null,
    experienceMaxYears: initial.experienceMaxYears ?? null,
    headcount: initial.headcount ?? 1,
    status: initial.status || 'Draft',
    pushToMetaview: !!initial.metaviewSearchId
  });
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.role.trim() || !form.brief.trim()) {
      setErr('Role and job brief are required');
      return;
    }
    try {
      await onSave({
        entityTag: form.entityTag,
        role: form.role.trim(),
        department: form.department.trim(),
        projectName: form.projectName.trim(),
        location: form.location,
        brief: form.brief.trim(),
        bandMinPaise: form.bandMinPaise,
        bandMaxPaise: form.bandMaxPaise,
        experienceMinYears: form.experienceMinYears,
        experienceMaxYears: form.experienceMaxYears,
        headcount: Number(form.headcount) || 1,
        status: form.status,
        pushToMetaview: form.pushToMetaview
      });
    } catch (e2) {
      setErr(e2.message || 'Save failed');
    }
  }

  return (
    <div className="hr-modal-backdrop" onClick={onCancel}>
      <div className="hr-modal hr-import-drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Edit requirements</h2>
        <p className="hr-muted">Update the job description Metaview uses for sourcing.</p>
        <form onSubmit={handleSubmit}>
          <EntityTagSelect value={form.entityTag} onChange={(v) => setForm({ ...form, entityTag: v })} />
          <div className="hr-form-row">
            <label>Role</label>
            <input required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>
          <div className="hr-form-row">
            <label>Department</label>
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div className="hr-form-row">
            <label>Project</label>
            <input value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} />
          </div>
          <div className="hr-form-row">
            <label>Location</label>
            <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
              <option>Pune (PCMC)</option>
              <option>Mumbai</option>
              <option>Goa</option>
            </select>
          </div>
          <MoneyInput
            label="Band min (₹/year)"
            valuePaise={form.bandMinPaise}
            onChangePaise={(v) => setForm({ ...form, bandMinPaise: v })}
          />
          <MoneyInput
            label="Band max (₹/year)"
            valuePaise={form.bandMaxPaise}
            onChangePaise={(v) => setForm({ ...form, bandMaxPaise: v })}
          />
          <div className="hr-form-row hr-form-row-inline">
            <label>Experience (years)</label>
            <input
              type="number"
              min="0"
              placeholder="Min"
              value={form.experienceMinYears ?? ''}
              onChange={(e) => setForm({ ...form, experienceMinYears: e.target.value ? Number(e.target.value) : null })}
            />
            <span>–</span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              value={form.experienceMaxYears ?? ''}
              onChange={(e) => setForm({ ...form, experienceMaxYears: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="hr-form-row">
            <label>Headcount</label>
            <input
              type="number"
              min="1"
              value={form.headcount}
              onChange={(e) => setForm({ ...form, headcount: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="hr-form-row">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="hr-form-row">
            <label>Job brief</label>
            <textarea
              required
              rows={6}
              value={form.brief}
              onChange={(e) => setForm({ ...form, brief: e.target.value })}
            />
          </div>
          {initial.metaviewSearchId && (
            <label className="hr-check-row">
              <input
                type="checkbox"
                checked={form.pushToMetaview}
                onChange={(e) => setForm({ ...form, pushToMetaview: e.target.checked })}
              />
              Also send updated requirements to Metaview agent
            </label>
          )}
          {err && <p className="hr-error">{err}</p>}
          <div className="hr-toolbar">
            <button type="submit" className="hr-btn hr-btn-gold" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="hr-btn hr-btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
