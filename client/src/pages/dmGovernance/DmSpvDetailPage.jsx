import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dmGovernanceApi } from '../../lib/dmGovernanceApi.js';

export default function DmSpvDetailPage() {
  const { spvId } = useParams();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    dmGovernanceApi
      .getSpv(spvId)
      .then((r) => {
        setData(r);
        setForm({ ...r.spv });
      })
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, [spvId]);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await dmGovernanceApi.saveSpv(spvId, form);
      setMsg('Saved');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p className="dm-muted">Loading…</p>;

  return (
    <div>
      <p>
        <Link to="/app/dm-governance/spvs">← SPVs</Link>
      </p>
      <h2 style={{ margin: '0 0 16px' }}>{form.spvName}</h2>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}

      <div className="dm-panel">
        <div className="dm-form-grid">
          <div className="dm-field">
            <label>SPV code</label>
            <input value={form.spvCode || ''} onChange={(e) => setForm({ ...form, spvCode: e.target.value })} />
          </div>
          <div className="dm-field">
            <label>Legal entity</label>
            <input
              value={form.legalEntityName || ''}
              onChange={(e) => setForm({ ...form, legalEntityName: e.target.value })}
            />
          </div>
          <div className="dm-field">
            <label>PAN</label>
            <input value={form.pan || ''} onChange={(e) => setForm({ ...form, pan: e.target.value })} />
          </div>
          <div className="dm-field">
            <label>GSTIN</label>
            <input value={form.gstin || ''} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          </div>
          <div className="dm-field">
            <label>Billing status</label>
            <select
              value={form.billingStatus || 'active'}
              onChange={(e) => setForm({ ...form, billingStatus: e.target.value })}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="archived">archived</option>
            </select>
          </div>
          <div className="dm-field">
            <label>Agreement status</label>
            <select
              value={form.agreementStatus || 'not_started'}
              onChange={(e) => setForm({ ...form, agreementStatus: e.target.value })}
            >
              <option value="not_started">not_started</option>
              <option value="draft">draft</option>
              <option value="signed">signed</option>
              <option value="expired">expired</option>
            </select>
          </div>
          <div className="dm-field" style={{ gridColumn: '1 / -1' }}>
            <label>Registered address</label>
            <textarea
              rows={2}
              value={form.registeredAddress || ''}
              onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })}
            />
          </div>
          <div className="dm-field" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <button type="button" className="dm-btn dm-btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save SPV'}
        </button>
      </div>

      <p className="dm-section-title">Linked projects</p>
      <div className="dm-card-grid">
        {(data?.projects || []).map((p) => (
          <Link key={p._id} to={`/app/dm-governance/projects/${p._id}`} className="dm-card">
            <h3>{p.name}</h3>
            <div className="dm-card-meta">{p.projectCode} · {p.revenueStatus}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
