import { useState } from 'react';

import { useDemands } from '../../hooks/postsales/useDemands.js';

import { useMilestones } from '../../hooks/postsales/useMilestones.js';

import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';

import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';

import { postSalesApi } from '../../lib/postSalesApi.js';



function fmt(n) {

  if (n == null) return '—';

  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

}



function payBadge(s) {

  const m = { paid: 'green', partial: 'amber', pending: 'grey', overdue: 'red' };

  return `ps-badge ps-badge-${m[s] || 'grey'}`;

}



const IMPORT_SAMPLE = `[
  {
    "project": "Golden HQ",
    "unitNumber": "A-1203",
    "milestoneName": "Slab completion",
    "clpPercent": 10,
    "dueAmount": 850000,
    "receivedAmount": 892500,
    "dueDate": "2025-02-15"
  }
]`;



export default function Demands() {

  const [tab, setTab] = useState('demands');

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();

  const { demands, summary, loading, error, updateDemand, refresh } = useDemands(query);

  const { milestones, loading: mLoading } = useMilestones({});

  const [payForm, setPayForm] = useState(null);

  const [importText, setImportText] = useState('');

  const [importBusy, setImportBusy] = useState(false);

  const [importMsg, setImportMsg] = useState(null);



  const grouped = { pending: [], triggered: [], completed: [] };

  for (const m of milestones) grouped[m.demandTriggerStatus]?.push(m);



  const handlePay = async (id) => {

    await updateDemand(id, payForm);

    setPayForm(null);

  };



  const handleImport = async () => {

    setImportBusy(true);

    setImportMsg(null);

    try {

      const rows = JSON.parse(importText);

      const result = await postSalesApi.importDemands(rows);

      setImportMsg(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);

      setImportText('');

      await refresh();

    } catch (e) {

      setImportMsg(e.message);

    } finally {

      setImportBusy(false);

    }

  };



  return (

    <div>

      <h2 style={{ marginTop: 0 }}>CLP Demands</h2>



      <div className="ps-card" style={{ background: 'var(--ps-accent-soft)', borderColor: '#bfdbfe', marginBottom: 16 }}>

        <strong>Source of truth for CLP payment data</strong>

        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--ps-text-muted)' }}>

          Upload milestone rows with due, received, and pending amounts. The Work allocation panel and dashboards read these totals per unit.

        </p>

      </div>



      <PostSalesFilterBar

        project={project}

        phase={phase}

        building={building}

        onProjectChange={setProject}

        onPhaseChange={setPhase}

        onBuildingChange={setBuilding}

        options={options}

        onClear={clear}

      />



      <div className="ps-card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 16 }}>

        <div><div className="ps-kpi-label">Total due</div><strong>{fmt(summary.totalDue ?? summary.totalDemanded)}</strong></div>

        <div><div className="ps-kpi-label">Received</div><strong style={{ color: 'var(--ps-success)' }}>{fmt(summary.totalReceived ?? summary.totalCollected)}</strong></div>

        <div><div className="ps-kpi-label">Pending</div><strong style={{ color: 'var(--ps-danger)' }}>{fmt(summary.totalPending ?? summary.totalOutstanding)}</strong></div>

      </div>



      <div className="ps-tabs">

        <button type="button" className={`ps-tab ${tab === 'demands' ? 'active' : ''}`} onClick={() => setTab('demands')}>Payment tracking</button>

        <button type="button" className={`ps-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>Upload CLP data</button>

        <button type="button" className={`ps-tab ${tab === 'milestones' ? 'active' : ''}`} onClick={() => setTab('milestones')}>Milestone status</button>

      </div>



      {error && <div className="ps-error">{error}</div>}



      {tab === 'demands' && (

        <>

          {loading && <div className="ps-empty">Loading…</div>}

          {!loading && !demands.length && (

            <div className="ps-card ps-empty">No demand records for this filter. Upload CLP data or record payments below.</div>

          )}

          {demands.map((d) => (

            <div key={d._id} className="ps-card">

              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>

                <div>

                  <strong>{d.project} · {d.unitNumber}</strong> — {d.milestoneName}

                  <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>

                    {d.entity} · CLP {d.clpPercent}%

                    {[d.phase, d.building].filter(Boolean).length ? ` · ${[d.phase, d.building].filter(Boolean).join(' · ')}` : ''}

                  </div>

                </div>

                <span className={payBadge(d.paymentStatus)}>{d.paymentStatus}</span>

              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12, fontSize: '0.85rem' }}>

                <div><div className="ps-kpi-label">Due</div><strong>{fmt(d.dueAmount ?? d.totalAmount)}</strong></div>

                <div><div className="ps-kpi-label">Received</div><strong style={{ color: 'var(--ps-success)' }}>{fmt(d.receivedAmount ?? d.paidAmount)}</strong></div>

                <div><div className="ps-kpi-label">Pending</div><strong style={{ color: 'var(--ps-danger)' }}>{fmt(d.pendingAmount ?? ((d.totalAmount || 0) - (d.paidAmount || 0)))}</strong></div>

                <div><div className="ps-kpi-label">Due date</div>{d.dueDate ? new Date(d.dueDate).toLocaleDateString('en-IN') : '—'}</div>

              </div>

              <div className="ps-progress" style={{ marginTop: 8 }}>

                <div className="ps-progress-fill" style={{ width: `${d.totalAmount ? ((d.paidAmount || 0) / d.totalAmount) * 100 : 0}%` }} />

              </div>

              {payForm?.id === d._id ? (

                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>

                  <input type="number" placeholder="Received amount" value={payForm.paidAmount} onChange={(e) => setPayForm((f) => ({ ...f, paidAmount: Number(e.target.value) }))} />

                  <input type="date" value={payForm.paidDate} onChange={(e) => setPayForm((f) => ({ ...f, paidDate: e.target.value }))} />

                  <input placeholder="Receipt #" value={payForm.receiptNumber} onChange={(e) => setPayForm((f) => ({ ...f, receiptNumber: e.target.value }))} />

                  <button type="button" className="ps-btn ps-btn-primary" onClick={() => handlePay(d._id)}>Save</button>

                  <button type="button" className="ps-btn" onClick={() => setPayForm(null)}>Cancel</button>

                </div>

              ) : (

                <button type="button" className="ps-btn" style={{ marginTop: 8 }} onClick={() => setPayForm({ id: d._id, paidAmount: d.paidAmount || 0, paidDate: new Date().toISOString().slice(0, 10), receiptNumber: '' })}>Update received amount</button>

              )}

            </div>

          ))}

        </>

      )}



      {tab === 'import' && (

        <div className="ps-card">

          <h3 style={{ marginTop: 0 }}>Upload CLP milestone data</h3>

          <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>

            Paste JSON rows with <code>project</code>, <code>unitNumber</code>, <code>milestoneName</code>, <code>dueAmount</code>, <code>receivedAmount</code>, optional <code>clpPercent</code> and <code>dueDate</code>. Existing rows for the same unit + milestone are updated.

          </p>

          <textarea

            rows={12}

            value={importText}

            onChange={(e) => setImportText(e.target.value)}

            placeholder={IMPORT_SAMPLE}

            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}

          />

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>

            <button type="button" className="ps-btn ps-btn-primary" disabled={importBusy || !importText.trim()} onClick={handleImport}>

              {importBusy ? 'Importing…' : 'Import rows'}

            </button>

            <button type="button" className="ps-btn" onClick={() => setImportText(IMPORT_SAMPLE)}>Load sample</button>

          </div>

          {importMsg && <div style={{ marginTop: 12, fontSize: '0.9rem' }}>{importMsg}</div>}

        </div>

      )}



      {tab === 'milestones' && (

        <>

          {mLoading && <div className="ps-empty">Loading…</div>}

          <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>Construction milestones for Step 12 visibility.</p>

          {['pending', 'triggered', 'completed'].map((status) => (

            <div key={status}>

              <h4 style={{ textTransform: 'capitalize' }}>{status} ({grouped[status]?.length || 0})</h4>

              {(grouped[status] || []).map((m) => (

                <div key={m._id} className="ps-card">

                  <strong>{m.project} · {m.tower}</strong> — {m.milestoneName} ({m.clpPercent}%)

                  <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>

                    Completed {m.completedDate ? new Date(m.completedDate).toLocaleDateString('en-IN') : '—'}

                    {status === 'triggered' ? ' · Demand issued' : ''}

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
