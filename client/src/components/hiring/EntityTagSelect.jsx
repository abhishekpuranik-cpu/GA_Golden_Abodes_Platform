import { ENTITY_TAGS } from '../../lib/hiring/formatINR.js';

export default function EntityTagSelect({ value, onChange, label = 'Entity' }) {
  return (
    <div className="hr-form-row">
      <label>{label}</label>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Select entity…</option>
        {ENTITY_TAGS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}
