import { useState } from 'react';
import { useUnits } from '../../hooks/postsales/useUnits.js';
import { useLoans } from '../../hooks/postsales/useLoans.js';

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

const STAGES = ['applied', 'processing', 'valuation', 'sanctioned'];

export default function Loans() {
  const { units, loading: unitsLoading } = useUnits({});
  const [selectedUnit, setSelectedUnit] = useState('');
  const unitId = selectedUnit || units[0]?._id;
  const { loan, loading, error, upsertLoan } = useLoans(unitId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  const unit = units.find((u) => u._id === unitId);
  const fundingType = unit?.fundingType || unit?.customer?.fundingType;

  const startEdit = () => {
    setForm(loan || { bank: '', rmName: '', rmPhone: '', loanAmount: '', applicationStage: 'applied' });
    setEditing(true);
  };

  const save = async () => {
    await upsertLoan({ ...form, fundingType: fundingType || 'home_loan', loanAmount: Number(form.loanAmount) || 0 });
    setEditing(false);
  };

  const markPaid = async (index) => {
    const schedule = [...(loan?.ownContributionSchedule || [])];
    schedule[index] = { ...schedule[index], status: 'paid', paidDate: new Date() };
    await upsertLoan({ ownContributionSchedule: schedule, fundingType: 'self_funded' });
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Loan & funding tracker</h2>
      <div className="ps-split">
        <div>
          {unitsLoading && <div className="ps-empty">Loading…</div>}
          {units.map((u) => (
            <div key={u._id} className={`ps-list-item ${unitId === u._id ? 'active' : ''}`} onClick={() => setSelectedUnit(u._id)}>
              <strong>{u.unitNumber}</strong>
              <span className={`ps-badge ${u.fundingType === 'self_funded' ? 'ps-badge-amber' : 'ps-badge-blue'}`} style={{ marginLeft: 8 }}>
                {u.fundingType === 'self_funded' ? 'Self-funded' : 'Home loan'}
              </span>
              <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>{u.project}</div>
            </div>
          ))}
        </div>

        <div>
          {error && <div className="ps-error">{error}</div>}
          {loading && <div className="ps-empty">Loading…</div>}
          {!loading && unit && fundingType === 'home_loan' && (
            <div className="ps-card">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Home loan tracker</strong>
                <button type="button" className="ps-btn" onClick={startEdit}>Edit</button>
              </div>
              <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
                {STAGES.map((s, i) => {
                  const active = (loan?.applicationStage || 'applied') === s;
                  const past = STAGES.indexOf(loan?.applicationStage || 'applied') >= i;
                  return (
                    <div key={s} style={{ textAlign: 'center', opacity: past ? 1 : 0.4 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: active ? 'var(--ps-accent)' : past ? 'var(--ps-success)' : '#e2e8f0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                        {past && !active ? '✓' : i + 1}
                      </div>
                      <div style={{ fontSize: '0.7rem', marginTop: 4, textTransform: 'capitalize' }}>{s}</div>
                    </div>
                  );
                })}
              </div>
              {editing ? (
                <div>
                  <div className="ps-form-group"><label>Bank</label><input value={form.bank || ''} onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))} /></div>
                  <div className="ps-form-group"><label>RM name</label><input value={form.rmName || ''} onChange={(e) => setForm((f) => ({ ...f, rmName: e.target.value }))} /></div>
                  <div className="ps-form-group"><label>RM phone</label><input value={form.rmPhone || ''} onChange={(e) => setForm((f) => ({ ...f, rmPhone: e.target.value }))} /></div>
                  <div className="ps-form-group"><label>Loan amount</label><input type="number" value={form.loanAmount || ''} onChange={(e) => setForm((f) => ({ ...f, loanAmount: e.target.value }))} /></div>
                  <div className="ps-form-group">
                    <label>Stage</label>
                    <select value={form.applicationStage || 'applied'} onChange={(e) => setForm((f) => ({ ...f, applicationStage: e.target.value }))}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button type="button" className="ps-btn ps-btn-primary" onClick={save}>Save</button>
                  <button type="button" className="ps-btn" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              ) : loan ? (
                <>
                  <div><strong>{loan.bank}</strong> · RM: {loan.rmName} ({loan.rmPhone})</div>
                  <div>Sanction: {fmt(loan.sanctionAmount)} · Loan: {fmt(loan.loanAmount)}</div>
                  {loan.sanctionLetterLink && <a href={loan.sanctionLetterLink} target="_blank" rel="noreferrer">Sanction letter</a>}
                  <h4>Disbursements</h4>
                  {(loan.disbursements || []).map((d, i) => (
                    <div key={i} style={{ fontSize: '0.85rem' }}>Tranche {d.tranche}: {fmt(d.amount)} — {d.date ? new Date(d.date).toLocaleDateString('en-IN') : '—'}</div>
                  ))}
                  {!loan.disbursements?.length && <div className="ps-muted">No disbursements recorded</div>}
                </>
              ) : (
                <div className="ps-empty">No loan record — click Edit to add</div>
              )}
            </div>
          )}

          {!loading && unit && fundingType === 'self_funded' && (
            <div className="ps-card">
              <strong>Own contribution schedule</strong>
              <table style={{ width: '100%', marginTop: 12, fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--ps-border)' }}><th align="left">Milestone</th><th align="right">Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {(loan?.ownContributionSchedule || []).map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--ps-border)' }}>
                      <td>{row.milestone}</td>
                      <td align="right">{fmt(row.amount)}</td>
                      <td>{row.dueDate ? new Date(row.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                      <td><span className={`ps-badge ps-badge-${row.status === 'paid' ? 'green' : row.status === 'overdue' ? 'red' : 'grey'}`}>{row.status}</span></td>
                      <td>{row.status !== 'paid' && <button type="button" className="ps-btn" onClick={() => markPaid(i)}>Mark paid</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loan?.ownContributionSchedule?.length && <div className="ps-empty">No schedule — use Edit on a home loan unit or add via API</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
