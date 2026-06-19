import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDemands } from '../../hooks/postsales/useDemands.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { postSalesApi } from '../../lib/postSalesApi.js';

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(due, received) {
  if (!due) return 0;
  return Math.min(100, Math.round((received / due) * 100));
}

function payBadge(status) {
  const map = { paid: 'green', partial: 'amber', pending: 'grey', overdue: 'red' };
  return `ps-badge ps-badge-${map[status] || 'grey'}`;
}

function rowAmounts(d) {
  const due = d.dueAmount ?? d.totalAmount ?? 0;
  const received = d.receivedAmount ?? d.paidAmount ?? 0;
  const pending = d.pendingAmount ?? Math.max(0, due - received);
  return { due, received, pending };
}

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'partial', label: 'Partial' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
];

export default function Demands() {
  const [view, setView] = useState('units');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [payForm, setPayForm] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const fileRef = useRef(null);

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const { demands, summary, loading, error, updateDemand, refresh } = useDemands(query);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return demands.filter((d) => {
      if (statusFilter && d.paymentStatus !== statusFilter) return false;
      if (!q) return true;
      const hay = [d.project, d.unitNumber, d.milestoneName, d.customerName, d.entity, d.phase, d.building]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [demands, statusFilter, search]);

  const unitGroups = useMemo(() => {
    const map = new Map();
    for (const d of filtered) {
      const key = `${d.project}|${d.unitNumber}`;
      const { due, received, pending } = rowAmounts(d);
      if (!map.has(key)) {
        map.set(key, {
          key,
          unitId: d.unitId,
          project: d.project,
          unitNumber: d.unitNumber,
          customerName: d.customerName,
          location: [d.phase, d.building].filter(Boolean).join(' · '),
          entity: d.entity,
          due: 0,
          received: 0,
          pending: 0,
          milestones: [],
          worstStatus: d.paymentStatus,
        });
      }
      const g = map.get(key);
      g.due += due;
      g.received += received;
      g.pending += pending;
      g.milestones.push(d);
      if (d.paymentStatus === 'overdue') g.worstStatus = 'overdue';
      else if (d.paymentStatus === 'partial' && g.worstStatus !== 'overdue') g.worstStatus = 'partial';
      else if (d.paymentStatus === 'pending' && !['overdue', 'partial'].includes(g.worstStatus)) g.worstStatus = 'pending';
    }
    return [...map.values()].sort((a, b) => b.pending - a.pending || a.project.localeCompare(b.project));
  }, [filtered]);

  const counts = useMemo(() => ({
    all: demands.length,
    pending: demands.filter((d) => d.paymentStatus === 'pending').length,
    partial: demands.filter((d) => d.paymentStatus === 'partial').length,
    paid: demands.filter((d) => d.paymentStatus === 'paid').length,
    overdue: demands.filter((d) => d.paymentStatus === 'overdue').length,
  }), [demands]);

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePay = async (id) => {
    await updateDemand(id, payForm);
    setPayForm(null);
    setActionMsg('Payment updated.');
  };

  const handleExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    setActionMsg(null);
    try {
      const result = await postSalesApi.uploadDemandsExcel(file);
      setActionMsg(`Upload done: ${result.created} new, ${result.updated} updated.`);
      setShowUpload(false);
      await refresh();
    } catch (err) {
      setActionMsg(err.message);
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSyncV1 = async () => {
    setSyncBusy(true);
    setActionMsg(null);
    try {
      const result = await postSalesApi.syncDemandsFromV1({ project: project || undefined });
      setActionMsg(`Imported from Cashflow V1: ${result.created} new, ${result.updated} updated.`);
      await refresh();
    } catch (err) {
      setActionMsg(err.message);
    } finally {
      setSyncBusy(false);
    }
  };

  const totalDue = summary.totalDue ?? summary.totalDemanded ?? 0;
  const totalReceived = summary.totalReceived ?? summary.totalCollected ?? 0;
  const totalPending = summary.totalPending ?? summary.totalOutstanding ?? 0;
  const collectPct = fmtPct(totalDue, totalReceived);

  return (
    <div className="ps-demands-page">
      <div className="ps-demands-head">
        <div>
          <h2 style={{ margin: 0 }}>Demands &amp; collections</h2>
          <p className="ps-demands-sub">
            CLP milestone payments per unit — <strong>Due</strong>, <strong>Received</strong>, and <strong>Pending</strong> in one place.
          </p>
        </div>
        <div className="ps-demands-actions">
          <button type="button" className="ps-btn ps-btn-primary" onClick={() => setShowUpload((v) => !v)}>
            {showUpload ? 'Close upload' : 'Upload Excel'}
          </button>
          <button type="button" className="ps-btn" disabled={syncBusy} onClick={handleSyncV1}>
            {syncBusy ? 'Importing…' : 'Import from Cashflow V1'}
          </button>
        </div>
      </div>

      {showUpload && (
        <div className="ps-card ps-demands-upload">
          <strong>Upload collections spreadsheet</strong>
          <p style={{ margin: '8px 0 12px', fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>
            Columns: <code>Project</code>, <code>Unit</code>, <code>Milestone</code>, <code>Due</code>, <code>Received</code>
            (optional: Pending, CLP %, Due Date)
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={handleExcel} disabled={uploadBusy} />
        </div>
      )}

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
          <input
            type="search"
            placeholder="Search unit, customer, milestone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-demands-search"
            aria-label="Search demands"
          />
        )}
      />

      <div className="ps-kpi-grid">
        <div className="ps-kpi">
          <div className="ps-kpi-label">Milestone rows</div>
          <div className="ps-kpi-value">{filtered.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)' }}>{unitGroups.length} units in view</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Total due</div>
          <div className="ps-kpi-value">{fmt(totalDue)}</div>
        </div>
        <div className="ps-kpi" style={{ borderColor: '#a7f3d0', background: 'var(--ps-success-bg)' }}>
          <div className="ps-kpi-label">Received</div>
          <div className="ps-kpi-value" style={{ color: 'var(--ps-success)' }}>{fmt(totalReceived)}</div>
          <div className="ps-progress" style={{ marginTop: 8 }}>
            <div className="ps-progress-fill" style={{ width: `${collectPct}%` }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)' }}>{collectPct}% collected</div>
        </div>
        <div className={`ps-kpi ${totalPending > 0 ? 'danger' : ''}`}>
          <div className="ps-kpi-label">Pending</div>
          <div className="ps-kpi-value">{fmt(totalPending)}</div>
        </div>
      </div>

      <div className="ps-demands-toolbar">
        <div className="ps-status-chips">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.id || 'all'}
              type="button"
              className={`ps-status-chip ${statusFilter === s.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(s.id)}
            >
              {s.label}
              {s.id ? ` (${counts[s.id] ?? 0})` : ` (${counts.all})`}
            </button>
          ))}
        </div>
        <div className="ps-tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button type="button" className={`ps-tab ${view === 'units' ? 'active' : ''}`} onClick={() => setView('units')}>
            By unit
          </button>
          <button type="button" className={`ps-tab ${view === 'milestones' ? 'active' : ''}`} onClick={() => setView('milestones')}>
            All milestones
          </button>
        </div>
      </div>

      {actionMsg && <div className="ps-card" style={{ padding: '10px 14px', fontSize: '0.9rem', background: 'var(--ps-accent-soft)' }}>{actionMsg}</div>}
      {error && <div className="ps-error">{error}</div>}
      {loading && <div className="ps-empty">Loading collections…</div>}

      {!loading && !filtered.length && (
        <div className="ps-card ps-empty">
          <p>No collection data matches your filters.</p>
          <p style={{ fontSize: '0.9rem' }}>Upload Excel, import from Cashflow V1, or clear filters.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && view === 'units' && (
        <div className="ps-card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="ps-table ps-demands-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Unit</th>
                <th>Location</th>
                <th className="ps-num">Due</th>
                <th className="ps-num">Received</th>
                <th className="ps-num">Pending</th>
                <th>Status</th>
                <th>Collection</th>
              </tr>
            </thead>
            <tbody>
              {unitGroups.map((g) => {
                const open = expanded.has(g.key);
                const pct = fmtPct(g.due, g.received);
                return (
                  <Fragment key={g.key}>
                    <tr className="ps-demand-unit-row" onClick={() => toggleExpand(g.key)}>
                      <td>{open ? '▼' : '▶'}</td>
                      <td>
                        <strong>{g.unitNumber}</strong>
                        <div className="ps-demands-meta">{g.project} · {g.customerName || '—'}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>{g.location || '—'}</td>
                      <td className="ps-num"><strong>{fmt(g.due)}</strong></td>
                      <td className="ps-num" style={{ color: 'var(--ps-success)' }}>{fmt(g.received)}</td>
                      <td className="ps-num" style={{ color: g.pending > 0 ? 'var(--ps-danger)' : undefined }}>{fmt(g.pending)}</td>
                      <td><span className={payBadge(g.worstStatus)}>{g.worstStatus}</span></td>
                      <td style={{ minWidth: 120 }}>
                        <div className="ps-progress">
                          <div className="ps-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)' }}>{pct}% · {g.milestones.length} milestone{g.milestones.length !== 1 ? 's' : ''}</span>
                      </td>
                    </tr>
                    {open && g.milestones.map((d) => {
                      const { due, received, pending } = rowAmounts(d);
                      return (
                        <tr key={d._id} className="ps-demand-detail-row">
                          <td />
                          <td colSpan={2}>
                            <strong>{d.milestoneName}</strong>
                            <div className="ps-demands-meta">
                              CLP {d.clpPercent || '—'}%
                              {d.dueDate ? ` · due ${new Date(d.dueDate).toLocaleDateString('en-IN')}` : ''}
                            </div>
                          </td>
                          <td className="ps-num">{fmt(due)}</td>
                          <td className="ps-num">{fmt(received)}</td>
                          <td className="ps-num">{fmt(pending)}</td>
                          <td><span className={payBadge(d.paymentStatus)}>{d.paymentStatus}</span></td>
                          <td>
                            {payForm?.id === d._id ? (
                              <div className="ps-inline-form" onClick={(e) => e.stopPropagation()}>
                                <input type="number" value={payForm.paidAmount} onChange={(e) => setPayForm((f) => ({ ...f, paidAmount: Number(e.target.value) }))} />
                                <button type="button" className="ps-btn ps-btn-primary" onClick={() => handlePay(d._id)}>Save</button>
                                <button type="button" className="ps-btn" onClick={() => setPayForm(null)}>Cancel</button>
                              </div>
                            ) : (
                              <button type="button" className="ps-btn" style={{ fontSize: '0.8rem', padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setPayForm({ id: d._id, paidAmount: d.paidAmount || 0, paidDate: new Date().toISOString().slice(0, 10) }); }}>
                                Update received
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && view === 'milestones' && (
        <div className="ps-card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="ps-table ps-demands-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Milestone</th>
                <th className="ps-num">Due</th>
                <th className="ps-num">Received</th>
                <th className="ps-num">Pending</th>
                <th>Due date</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const { due, received, pending } = rowAmounts(d);
                return (
                  <tr key={d._id}>
                    <td>
                      <strong>{d.unitNumber}</strong>
                      <div className="ps-demands-meta">{d.project}{d.customerName ? ` · ${d.customerName}` : ''}</div>
                    </td>
                    <td>
                      {d.milestoneName}
                      <div className="ps-demands-meta">CLP {d.clpPercent || '—'}%</div>
                    </td>
                    <td className="ps-num">{fmt(due)}</td>
                    <td className="ps-num" style={{ color: 'var(--ps-success)' }}>{fmt(received)}</td>
                    <td className="ps-num" style={{ color: pending > 0 ? 'var(--ps-danger)' : undefined }}>{fmt(pending)}</td>
                    <td style={{ fontSize: '0.85rem' }}>{d.dueDate ? new Date(d.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td><span className={payBadge(d.paymentStatus)}>{d.paymentStatus}</span></td>
                    <td>
                      {payForm?.id === d._id ? (
                        <div className="ps-inline-form">
                          <input type="number" value={payForm.paidAmount} onChange={(e) => setPayForm((f) => ({ ...f, paidAmount: Number(e.target.value) }))} />
                          <button type="button" className="ps-btn ps-btn-primary" onClick={() => handlePay(d._id)}>Save</button>
                        </div>
                      ) : (
                        <button type="button" className="ps-btn" style={{ fontSize: '0.8rem' }} onClick={() => setPayForm({ id: d._id, paidAmount: d.paidAmount || 0, paidDate: new Date().toISOString().slice(0, 10) })}>
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)', marginTop: 16 }}>
        Tip: use <strong>By unit</strong> for a customer overview; expand a row to see each CLP milestone.
        {' '}<Link to="/app/post-sales/units">Sold units</Link> · <Link to="/app/post-sales/allocation">Allocation</Link>
      </p>
    </div>
  );
}
