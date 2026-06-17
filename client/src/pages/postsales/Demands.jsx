import { useState } from 'react';
import { useDemands } from '../../hooks/postsales/useDemands.js';
import { useMilestones } from '../../hooks/postsales/useMilestones.js';

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function payBadge(s) {
  const m = { paid: 'green', partial: 'amber', pending: 'grey', overdue: 'red' };
  return `ps-badge ps-badge-${m[s] || 'grey'}`;
}

export default function Demands() {
  const [tab, setTab] = useState('demands');
  const { demands, summary, loading, error, updateDemand } = useDemands({});
  const { milestones, loading: mLoading } = useMilestones({});
  const [payForm, setPayForm] = useState(null);

  const grouped = { pending: [], triggered: [], completed: [] };
  for (const m of milestones) grouped[m.demandTriggerStatus]?.push(m);

  const handlePay = async (id) => {
    await updateDemand(id, payForm);
    setPayForm(null);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>CLP Demands</h2>

      <div className="ps-card" style={{ background: 'var(--ps-accent-soft)', borderColor: '#bfdbfe', marginBottom: 16 }}>
        <strong>Demands are issued from CRM</strong>
        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--ps-text-muted)' }}>
          CLP demand letters are created in your CRM when engineering milestones complete. Use this tab to track payment status and outstanding amounts — not to generate new demands.
        </p>
      </div>

      <div className="ps-card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div><div className="ps-kpi-label">Total demanded</div><strong>{fmt(summary.totalDemanded)}</strong></div>
        <div><div className="ps-kpi-label">Collected</div><strong style={{ color: 'var(--ps-success)' }}>{fmt(summary.totalCollected)}</strong></div>
        <div><div className="ps-kpi-label">Outstanding</div><strong style={{ color: 'var(--ps-danger)' }}>{fmt(summary.totalOutstanding)}</strong></div>
      </div>

      <div className="ps-tabs">
        <button type="button" className={`ps-tab ${tab === 'demands' ? 'active' : ''}`} onClick={() => setTab('demands')}>Payment tracking</button>
        <button type="button" className={`ps-tab ${tab === 'milestones' ? 'active' : ''}`} onClick={() => setTab('milestones')}>Milestone status</button>
      </div>

      {error && <div className="ps-error">{error}</div>}

      {tab === 'demands' && (
        <>
          {loading && <div className="ps-empty">Loading…</div>}
          {demands.map((d) => (
            <div key={d._id} className="ps-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{d.project} · {d.unitNumber}</strong> — {d.milestoneName}
                  <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>{d.entity} · CLP {d.clpPercent}%</div>
                </div>
                <span className={payBadge(d.paymentStatus)}>{d.paymentStatus}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
                Base {fmt(d.demandAmount)} + GST {fmt(d.gstAmount)} = <strong>{fmt(d.totalAmount)}</strong>
              </div>
              <div className="ps-progress" style={{ marginTop: 8 }}>
                <div className="ps-progress-fill" style={{ width: `${d.totalAmount ? (d.paidAmount / d.totalAmount) * 100 : 0}%` }} />
              </div>
              <div style={{ fontSize: '0.8rem' }}>Paid: {fmt(d.paidAmount)}</div>
              {payForm?.id === d._id ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="number" placeholder="Paid amount" value={payForm.paidAmount} onChange={(e) => setPayForm((f) => ({ ...f, paidAmount: Number(e.target.value) }))} />
                  <input type="date" value={payForm.paidDate} onChange={(e) => setPayForm((f) => ({ ...f, paidDate: e.target.value }))} />
                  <input placeholder="Receipt #" value={payForm.receiptNumber} onChange={(e) => setPayForm((f) => ({ ...f, receiptNumber: e.target.value }))} />
                  <button type="button" className="ps-btn ps-btn-primary" onClick={() => handlePay(d._id)}>Save</button>
                  <button type="button" className="ps-btn" onClick={() => setPayForm(null)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="ps-btn" style={{ marginTop: 8 }} onClick={() => setPayForm({ id: d._id, paidAmount: d.paidAmount || 0, paidDate: new Date().toISOString().slice(0, 10), receiptNumber: '' })}>Record payment</button>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'milestones' && (
        <>
          {mLoading && <div className="ps-empty">Loading…</div>}
          <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>Read-only view of construction milestones synced for Step 12 visibility.</p>
          {['pending', 'triggered', 'completed'].map((status) => (
            <div key={status}>
              <h4 style={{ textTransform: 'capitalize' }}>{status} ({grouped[status]?.length || 0})</h4>
              {(grouped[status] || []).map((m) => (
                <div key={m._id} className="ps-card">
                  <strong>{m.project} · {m.tower}</strong> — {m.milestoneName} ({m.clpPercent}%)
                  <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>
                    Completed {m.completedDate ? new Date(m.completedDate).toLocaleDateString('en-IN') : '—'}
                    {status === 'triggered' ? ' · Demand issued via CRM' : ''}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
