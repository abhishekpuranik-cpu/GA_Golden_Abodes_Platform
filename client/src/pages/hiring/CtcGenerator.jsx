import { Fragment, useMemo, useState } from 'react';
import {
  MODE_OPTIONS,
  calculateCtc,
  formatInr,
  loadCtcStructure,
  newComponentId,
  resetCtcStructure,
  saveCtcStructure
} from '../../lib/hiring/ctcStructure.js';

export default function CtcGenerator() {
  const [structure, setStructure] = useState(() => loadCtcStructure());
  const [inputMode, setInputMode] = useState('annual');
  const [inputValue, setInputValue] = useState(1200000);
  const [msg, setMsg] = useState('');
  const [editStructure, setEditStructure] = useState(false);

  const annualCtc = inputMode === 'monthly' ? (Number(inputValue) || 0) * 12 : (Number(inputValue) || 0);
  const result = useMemo(() => calculateCtc(annualCtc, structure), [annualCtc, structure]);

  function updateStructure(next) {
    setStructure(next);
    saveCtcStructure(next);
    setMsg('Structure saved locally.');
  }

  function patchComponent(id, patch) {
    updateStructure({
      ...structure,
      components: structure.components.map((c) => (c.id === id ? { ...c, ...patch } : c))
    });
  }

  function addComponent() {
    updateStructure({
      ...structure,
      components: [
        ...structure.components,
        {
          id: newComponentId(),
          label: 'New component',
          mode: 'fixed_monthly',
          pct: 0,
          amount: 0,
          includeInCtc: true,
          group: 'Allowances'
        }
      ]
    });
  }

  function removeComponent(id) {
    if (structure.components.length <= 1) return;
    updateStructure({
      ...structure,
      components: structure.components.filter((c) => c.id !== id)
    });
  }

  function handleReset() {
    if (!window.confirm('Reset CTC structure to GA default?')) return;
    setStructure(resetCtcStructure());
    setMsg('Reset to default structure.');
  }

  function exportCsv() {
    const lines = [
      ['Component', 'Group', 'Rule', 'Monthly (₹)', 'Annual (₹)'],
      ...result.rows.map((r) => [
        r.label,
        r.group || '',
        r.mode === 'balancing' ? 'Balancing'
          : r.mode === 'pct_of_ctc' ? `${r.pct}% of CTC`
            : r.mode === 'pct_of_basic' ? `${r.pct}% of Basic`
              : r.mode === 'fixed_monthly' ? `₹${r.amount}/mo`
                : `₹${r.amount}/yr`,
        r.monthly,
        r.annual
      ]),
      [],
      ['Target CTC (annual)', '', '', '', result.annualCtc],
      ['Total (annual)', '', '', '', result.totalAnnual],
      ['Variance', '', '', '', result.variance]
    ];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GA_CTC_${result.annualCtc}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copySummary() {
    const text = [
      `GA CTC breakdown — Target ${formatInr(result.annualCtc)} / year`,
      ...result.rows.filter((r) => r.includeInCtc).map((r) => `${r.label}: ${formatInr(r.monthly)}/mo · ${formatInr(r.annual)}/yr`),
      `Total: ${formatInr(result.totalMonthly)}/mo · ${formatInr(result.totalAnnual)}/yr`,
      result.variance ? `Variance vs target: ${formatInr(result.variance)}` : 'Balances to target CTC'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copied breakdown to clipboard.');
    } catch {
      setMsg('Could not copy — select and copy manually.');
    }
  }

  const groups = [...new Set(result.rows.map((r) => r.group || 'Other'))];

  return (
    <>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A', marginBottom: '0.35rem' }}>
        CTC Generator
      </h2>
      <p className="hr-muted" style={{ marginTop: 0, marginBottom: '1rem' }}>
        Calculate offer CTC from an editable structure ({structure.name}). Rules are subjective — change % / amounts to match HR policy.
      </p>

      <div className="hr-card hr-filter-bar">
        <div className="hr-filter-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <label>
            Input
            <select value={inputMode} onChange={(e) => {
              const next = e.target.value;
              if (next === 'monthly' && inputMode === 'annual') setInputValue(Math.round((Number(inputValue) || 0) / 12));
              if (next === 'annual' && inputMode === 'monthly') setInputValue(Math.round((Number(inputValue) || 0) * 12));
              setInputMode(next);
            }}
            >
              <option value="annual">Annual CTC (₹)</option>
              <option value="monthly">Monthly CTC (₹)</option>
            </select>
          </label>
          <label>
            Target CTC
            <input
              type="number"
              min="0"
              step="1000"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
        </div>
        <div className="hr-toolbar" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="hr-btn hr-btn-outline" onClick={() => setEditStructure((v) => !v)}>
            {editStructure ? 'Hide structure editor' : 'Edit structure'}
          </button>
          <button type="button" className="hr-btn hr-btn-outline" onClick={handleReset}>Reset structure</button>
          <button type="button" className="hr-btn" onClick={copySummary}>Copy summary</button>
          <button type="button" className="hr-btn hr-btn-gold" onClick={exportCsv}>Download CSV</button>
        </div>
        {msg && <p className="hr-muted" style={{ marginBottom: 0 }}>{msg}</p>}
      </div>

      <div className="hr-stat-row" style={{ marginBottom: '1.25rem' }}>
        <div className="hr-stat">
          <strong>{formatInr(result.annualCtc)}</strong>
          <span className="hr-muted">Target annual CTC</span>
        </div>
        <div className="hr-stat">
          <strong>{formatInr(result.totalMonthly)}</strong>
          <span className="hr-muted">Total monthly</span>
        </div>
        <div className="hr-stat">
          <strong>{formatInr(result.fixedCashAnnual)}</strong>
          <span className="hr-muted">Fixed cash / year</span>
        </div>
        <div className="hr-stat">
          <strong style={{ color: result.variance === 0 ? '#1A7244' : '#A07800' }}>{formatInr(result.variance)}</strong>
          <span className="hr-muted">Variance vs target</span>
        </div>
      </div>

      {editStructure && (
        <div className="hr-card" style={{ marginBottom: '1.25rem' }}>
          <div className="hr-toolbar" style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#1B2A4A' }}>Structure rules</h3>
            <button type="button" className="hr-btn hr-btn-gold" onClick={addComponent}>+ Add component</button>
          </div>
          <div className="hr-form-row">
            <label>Structure name</label>
            <input
              value={structure.name || ''}
              onChange={(e) => updateStructure({ ...structure, name: e.target.value })}
            />
          </div>
          <div className="hr-form-row">
            <label>Notes</label>
            <textarea
              rows={2}
              value={structure.notes || ''}
              onChange={(e) => updateStructure({ ...structure, notes: e.target.value })}
            />
          </div>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Group</th>
                  <th>Rule</th>
                  <th>% / Amount</th>
                  <th>In CTC</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {structure.components.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        value={c.label}
                        onChange={(e) => patchComponent(c.id, { label: e.target.value })}
                        style={{ width: '100%', minWidth: 120 }}
                      />
                    </td>
                    <td>
                      <input
                        value={c.group || ''}
                        onChange={(e) => patchComponent(c.id, { group: e.target.value })}
                        style={{ width: '100%', minWidth: 100 }}
                      />
                    </td>
                    <td>
                      <select
                        value={c.mode}
                        onChange={(e) => patchComponent(c.id, { mode: e.target.value })}
                      >
                        {MODE_OPTIONS.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {c.mode === 'balancing' ? (
                        <span className="hr-muted">auto</span>
                      ) : c.mode.startsWith('pct_') ? (
                        <input
                          type="number"
                          step="0.01"
                          value={c.pct}
                          onChange={(e) => patchComponent(c.id, { pct: Number(e.target.value) })}
                          style={{ width: 80 }}
                        />
                      ) : (
                        <input
                          type="number"
                          step="1"
                          value={c.amount}
                          onChange={(e) => patchComponent(c.id, { amount: Number(e.target.value) })}
                          style={{ width: 100 }}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!c.includeInCtc}
                        onChange={(e) => patchComponent(c.id, { includeInCtc: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button type="button" className="hr-btn hr-btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => removeComponent(c.id)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hr-muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
            Tip: keep one <em>Balancing</em> line (e.g. Special allowance) so the sheet always totals to target CTC.
            Default mirrors a common GA-style mix (Basic 40% of CTC, HRA 40% of Basic, PF 12% of Basic, Gratuity 4.81%, Variable 10%).
          </p>
        </div>
      )}

      <div className="hr-table-wrap">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Rule</th>
              <th>Monthly</th>
              <th>Annual</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={`g-${g}`}>
                <tr>
                  <td colSpan={4} style={{ background: '#f8fafc', fontWeight: 700, color: '#1B2A4A' }}>{g}</td>
                </tr>
                {result.rows.filter((r) => (r.group || 'Other') === g).map((r) => (
                  <tr key={r.id} style={{ opacity: r.includeInCtc ? 1 : 0.45 }}>
                    <td>{r.label}</td>
                    <td className="hr-muted">
                      {r.mode === 'balancing' && 'Balancing residual'}
                      {r.mode === 'pct_of_ctc' && `${r.pct}% of CTC`}
                      {r.mode === 'pct_of_basic' && `${r.pct}% of Basic`}
                      {r.mode === 'fixed_monthly' && `${formatInr(r.amount)} / month`}
                      {r.mode === 'fixed_annual' && `${formatInr(r.amount)} / year`}
                    </td>
                    <td>{formatInr(r.monthly)}</td>
                    <td><strong>{formatInr(r.annual)}</strong></td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr>
              <td colSpan={2} style={{ fontWeight: 800, background: '#0F1F3D', color: '#fff' }}>Total CTC</td>
              <td style={{ fontWeight: 800, background: '#F8F2DC' }}>{formatInr(result.totalMonthly)}</td>
              <td style={{ fontWeight: 800, background: '#F8F2DC' }}>{formatInr(result.totalAnnual)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
