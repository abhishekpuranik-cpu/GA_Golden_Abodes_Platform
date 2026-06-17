import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

const DEFAULT_SLABS = [
  { fromPct: 0, toPct: 10, cumulativeDmPct: 0, label: 'Pre-revenue / retainer only' },
  { fromPct: 10, toPct: 30, cumulativeDmPct: 3.5, label: 'Early collections' },
  { fromPct: 30, toPct: 60, cumulativeDmPct: 6.5, label: 'Growth' },
  { fromPct: 60, toPct: 90, cumulativeDmPct: 8.5, label: 'Mature' },
  { fromPct: 90, toPct: 100, cumulativeDmPct: 10, label: 'Completion' }
];

export default function DmBillingConfigPage() {
  const { projectId } = useParams();
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(projectId || '');
  const [config, setConfig] = useState(null);
  const [slabs, setSlabs] = useState(DEFAULT_SLABS);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    dmGovernanceApi.listProjects().then((r) => setProjects(r.projects || []));
  }, []);

  useEffect(() => {
    if (projectId) setSelectedId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) return;
    dmGovernanceApi
      .getBillingConfig(selectedId)
      .then((r) => {
        if (r.active) {
          setConfig(r.active);
          setSlabs(r.slabs?.length ? r.slabs : DEFAULT_SLABS);
        } else {
          const p = projects.find((x) => x._id === selectedId);
          setConfig({
            modelType: 'HYBRID_GA',
            retainerMonthly: 800000,
            retainerAdjustsAgainstCap: true,
            markupPct: 10,
            markupCapPct: 12,
            gstRate: 18,
            dmCapPct: p?.dmCapPct ?? 10,
            eligibleBaseType: p?.eligibleBaseType || 'topline_gdv',
            dmSyncToCashflow: true
          });
          setSlabs(DEFAULT_SLABS);
        }
      })
      .catch((e) => setErr(e.message));
  }, [selectedId, projects]);

  async function save() {
    if (!selectedId || !config) return;
    setSaving(true);
    setMsg('');
    try {
      await dmGovernanceApi.saveBillingConfig(selectedId, { ...config, slabs });
      setMsg('Billing configuration saved (new version)');
      const r = await dmGovernanceApi.getBillingConfig(selectedId);
      setConfig(r.active);
      setSlabs(r.slabs || slabs);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  function updateSlab(i, field, value) {
    setSlabs((old) => old.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Billing Model Configuration</h2>
      <p className="dm-page-lead">
        Hybrid GA model: Phase 1 retainer + cost-plus → collection-linked slabs → 10% lifetime cap (default base: topline GDV).
      </p>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}

      <div className="dm-field" style={{ maxWidth: 360, marginBottom: 20 }}>
        <label>Project</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select project</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name} ({p.projectCode})
            </option>
          ))}
        </select>
      </div>

      {selectedId && config ? (
        <>
          <div className="dm-panel">
            <h2>Hybrid settings</h2>
            <div className="dm-form-grid">
              <div className="dm-field">
                <label>Model type</label>
                <select
                  value={config.modelType || 'HYBRID_GA'}
                  onChange={(e) => setConfig({ ...config, modelType: e.target.value })}
                >
                  <option value="HYBRID_GA">HYBRID_GA (recommended)</option>
                  <option value="RETAINER_SUCCESS">RETAINER_SUCCESS</option>
                  <option value="COST_PLUS">COST_PLUS</option>
                  <option value="MILESTONE">MILESTONE</option>
                  <option value="CUSTOM">CUSTOM</option>
                </select>
              </div>
              <div className="dm-field">
                <label>Monthly retainer (₹)</label>
                <input
                  type="number"
                  value={config.retainerMonthly || 0}
                  onChange={(e) => setConfig({ ...config, retainerMonthly: Number(e.target.value) })}
                />
              </div>
              <div className="dm-field">
                <label>Markup %</label>
                <input
                  type="number"
                  value={config.markupPct ?? 10}
                  onChange={(e) => setConfig({ ...config, markupPct: Number(e.target.value) })}
                />
              </div>
              <div className="dm-field">
                <label>Markup cap %</label>
                <input
                  type="number"
                  value={config.markupCapPct ?? 12}
                  onChange={(e) => setConfig({ ...config, markupCapPct: Number(e.target.value) })}
                />
              </div>
              <div className="dm-field">
                <label>DM cap %</label>
                <input
                  type="number"
                  value={config.dmCapPct ?? 10}
                  onChange={(e) => setConfig({ ...config, dmCapPct: Number(e.target.value) })}
                />
              </div>
              <div className="dm-field">
                <label>Eligible base</label>
                <select
                  value={config.eligibleBaseType || 'topline_gdv'}
                  onChange={(e) => setConfig({ ...config, eligibleBaseType: e.target.value })}
                >
                  <option value="topline_gdv">topline_gdv (default)</option>
                  <option value="agreement_value">agreement_value</option>
                  <option value="collections_ttd">collections_ttd</option>
                </select>
              </div>
              <div className="dm-field">
                <label>GST %</label>
                <input
                  type="number"
                  value={config.gstRate ?? 18}
                  onChange={(e) => setConfig({ ...config, gstRate: Number(e.target.value) })}
                />
              </div>
              <div className="dm-field">
                <label>DM sync to Cashflow V1</label>
                <select
                  value={config.dmSyncToCashflow !== false ? 'yes' : 'no'}
                  onChange={(e) => setConfig({ ...config, dmSyncToCashflow: e.target.value === 'yes' })}
                >
                  <option value="yes">Yes — replace ga schedule</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </div>

          <div className="dm-panel">
            <h2>Collection-linked slabs</h2>
            <div className="dm-table-wrap">
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>From %</th>
                    <th>To %</th>
                    <th>Cumulative DM %</th>
                    <th>Label</th>
                  </tr>
                </thead>
                <tbody>
                  {slabs.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="number"
                          value={s.fromPct}
                          onChange={(e) => updateSlab(i, 'fromPct', Number(e.target.value))}
                          style={{ width: 72 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={s.toPct}
                          onChange={(e) => updateSlab(i, 'toPct', Number(e.target.value))}
                          style={{ width: 72 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          value={s.cumulativeDmPct}
                          onChange={(e) => updateSlab(i, 'cumulativeDmPct', Number(e.target.value))}
                          style={{ width: 72 }}
                        />
                      </td>
                      <td>
                        <input value={s.label || ''} onChange={(e) => updateSlab(i, 'label', e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button type="button" className="dm-btn dm-btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save billing configuration'}
          </button>
          <p style={{ marginTop: 12 }}>
            <Link to={`/app/dm-governance/projects/${selectedId}`}>View project executive summary →</Link>
          </p>
        </>
      ) : null}
    </div>
  );
}
