import { useRef, useState } from 'react';
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

export default function Demands() {
  const [tab, setTab] = useState('demands');
  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const { demands, summary, loading, error, updateDemand, refresh } = useDemands(query);
  const { milestones, loading: mLoading } = useMilestones({});
  const [payForm, setPayForm] = useState(null);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const fileRef = useRef(null);

  const grouped = { pending: [], triggered: [], completed: [] };
  for (const m of milestones) grouped[m.demandTriggerStatus]?.push(m);

  const handlePay = async (id) => {
    await updateDemand(id, payForm);
    setPayForm(null);
  };

  const handleExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    setUploadMsg(null);
    try {
      const result = await postSalesApi.uploadDemandsExcel(file);
      setUploadMsg(`Uploaded: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);
      await refresh();
    } catch (err) {
      setUploadMsg(err.message);
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSyncV1 = async () => {
    setSyncBusy(true);
    setUploadMsg(null);
    try {
      const result = await postSalesApi.syncDemandsFromV1({ project: project || undefined });
      setUploadMsg(`Imported from Cashflow V1: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped (uploads kept).`);
      await refresh();
    } catch (err) {
      setUploadMsg(err.message);
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Collections &amp; CLP Demands</h2>

      <div className="ps-card" style={{ background: 'var(--ps-accent-soft)', borderColor: '#bfdbfe', marginBottom: 16 }}>
        <strong>Post Sales is your master for collections data</strong>
        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--ps-text-muted)' }}>
          Upload Due / Received / Pending here. Allocation, dashboard, and Cashflow V1 all read from this tab.
          Opening Post Sales auto-links sold units and refreshes any legacy Cashflow data (your Excel uploads win).
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
        extra={(
          <button type="button" className="ps-btn" disabled={syncBusy} onClick={handleSyncV1}>
            {syncBusy ? 'Importing…' : 'Import from Cashflow V1'}
          </button>
        )}
      />

      <div className="ps-card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 16 }}>
        <div><div className="ps-kpi-label">Total due</div><strong>{fmt(summary.totalDue ?? summary.totalDemanded)}</strong></div>
        <div><div className="ps-kpi-label">Received</div><strong style={{ color: 'var(--ps-success)' }}>{fmt(summary.totalReceived ?? summary.totalCollected)}</strong></div>
        <div><div className="ps-kpi-label">Pending</div><strong style={{ color: 'var(--ps-danger)' }}>{fmt(summary.totalPending ?? summary.totalOutstanding)}</strong></div>
      </div>

      <div className="ps-tabs">
        <button type="button" className={`ps-tab ${tab === 'demands' ? 'active' : ''}`} onClick={() => setTab('demands')}>All demands</button>
        <button type="button" className={`ps-tab ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')}>Upload Excel</button>
        <button type="button" className={`ps-tab ${tab === 'milestones' ? 'active' : ''}`} onClick={() => setTab('milestones')}>Construction milestones</button>
      </div>

      {uploadMsg && <div className="ps-card" style={{ marginTop: 12, fontSize: '0.9rem' }}>{uploadMsg}</div>}
      {error && <div className="ps-error">{error}</div>}

      {tab === 'upload' && (
        <div className="ps-card">
          <h3 style={{ marginTop: 0 }}>Upload CLP / collections (Excel)</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>
            First row = headers. Required columns: <strong>Project</strong>, <strong>Unit</strong> (or unitNumber), <strong>Milestone</strong>,
            <strong> Due</strong>, <strong>Received</strong>, optional <strong>Pending</strong>, <strong>CLP %</strong>, <strong>Due Date</strong>.
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={handleExcel} disabled={uploadBusy} />
          {uploadBusy && <div style={{ marginTop: 8 }}>Uploading…</div>}
        </div>
      )}

      {tab === 'demands' && (
        <>
          {loading && <div className="ps-empty">Loading…</div>}
          {!loading && !demands.length && (
            <div className="ps-card ps-empty">No demands yet. Upload Excel or use Import from Cashflow V1.</div>
          )}
          {demands.map((d) => (
            <div key={d._id} className="ps-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{d.project} · {d.unitNumber}</strong> — {d.milestoneName}
                  <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>
                    {d.entity} · CLP {d.clpPercent || '—'}%
                    {d.source ? ` · ${d.source}` : ''}
                  </div>
                </div>
                <span className={payBadge(d.paymentStatus)}>{d.paymentStatus}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12, fontSize: '0.85rem' }}>
                <div><div className="ps-kpi-label">Due</div><strong>{fmt(d.dueAmount ?? d.totalAmount)}</strong></div>
                <div><div className="ps-kpi-label">Received</div><strong style={{ color: 'var(--ps-success)' }}>{fmt(d.receivedAmount ?? d.paidAmount)}</strong></div>
                <div><div className="ps-kpi-label">Pending</div><strong style={{ color: 'var(--ps-danger)' }}>{fmt(d.pendingAmount ?? ((d.totalAmount || 0) - (d.paidAmount || 0)))}</strong></div>
              </div>
              {payForm?.id === d._id ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="number" placeholder="Received amount" value={payForm.paidAmount} onChange={(e) => setPayForm((f) => ({ ...f, paidAmount: Number(e.target.value) }))} />
                  <input type="date" value={payForm.paidDate} onChange={(e) => setPayForm((f) => ({ ...f, paidDate: e.target.value }))} />
                  <button type="button" className="ps-btn ps-btn-primary" onClick={() => handlePay(d._id)}>Save</button>
                  <button type="button" className="ps-btn" onClick={() => setPayForm(null)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="ps-btn" style={{ marginTop: 8 }} onClick={() => setPayForm({ id: d._id, paidAmount: d.paidAmount || 0, paidDate: new Date().toISOString().slice(0, 10) })}>
                  Update received
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'milestones' && (
        <>
          {mLoading && <div className="ps-empty">Loading…</div>}
          <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>Engineering milestones (Step 12 visibility).</p>
          {['pending', 'triggered', 'completed'].map((status) => (
            <div key={status}>
              <h4 style={{ textTransform: 'capitalize' }}>{status} ({grouped[status]?.length || 0})</h4>
              {(grouped[status] || []).map((m) => (
                <div key={m._id} className="ps-card">
                  <strong>{m.project} · {m.tower}</strong> — {m.milestoneName} ({m.clpPercent}%)
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
