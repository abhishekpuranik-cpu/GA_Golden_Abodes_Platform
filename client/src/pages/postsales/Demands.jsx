import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDemands } from '../../hooks/postsales/useDemands.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { formatMilestoneLabel } from '../../lib/postsales/milestoneLabels.js';
import { sortDemandsByClpChronology, toIsoDateInput } from '../../lib/postsales/clpMilestoneOrder.js';
import {
  computeUnitCumulative,
  computeCrmReportTotals,
  isGstDemand,
  milestoneRowDisplay,
  sumCumulativeSummary,
  sumCrmReportSummary,
} from '../../lib/postsales/demandAmounts.js';

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

function letterBadge(status) {
  if (status === 'complete') return 'green';
  if (status === 'delayed') return 'red';
  if (status === 'in_progress' || status === 'open') return 'blue';
  return 'grey';
}

function letterLabel(d) {
  if (d.clpLetterStatus === 'complete') return 'Complete';
  if (d.clpLetterStatus === 'delayed') return 'Delayed';
  if (d.clpLetterStatus === 'in_progress' || d.clpLetterStatus === 'open') return 'In progress';
  if (d.actualDate) return 'Pending';
  return '—';
}

const AS_OF_TODAY = new Date();

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
  const [dateBusy, setDateBusy] = useState(null);
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

  /** All milestones per unit for totals — status chip must not drop GST / post-stage rows. */
  const scopedDemands = useMemo(() => {
    const q = search.trim().toLowerCase();
    return demands.filter((d) => {
      if (!q) return true;
      const hay = [d.project, d.unitNumber, d.milestoneName, d.milestoneNameRaw, d.customerName, d.entity, d.phase, d.building]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [demands, search]);

  const sortedMilestones = useMemo(() => sortDemandsByClpChronology(filtered), [filtered]);

  const unitGroups = useMemo(() => {
    const map = new Map();
    for (const d of scopedDemands) {
      const key = `${d.project}|${d.unitNumber}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          unitId: d.unitId,
          project: d.project,
          unitNumber: d.unitNumber,
          customerName: d.customerName,
          location: [d.phase, d.building].filter(Boolean).join(' · '),
          entity: d.entity,
          milestones: [],
          worstStatus: d.paymentStatus,
        });
      }
      map.get(key).milestones.push(d);
      const g = map.get(key);
      if (d.paymentStatus === 'overdue') g.worstStatus = 'overdue';
      else if (d.paymentStatus === 'partial' && g.worstStatus !== 'overdue') g.worstStatus = 'partial';
      else if (d.paymentStatus === 'pending' && !['overdue', 'partial'].includes(g.worstStatus)) g.worstStatus = 'pending';
    }
    for (const g of map.values()) {
      g.milestones = sortDemandsByClpChronology(g.milestones);
      Object.assign(g, computeUnitCumulative(g.milestones, AS_OF_TODAY));
      const crm = computeCrmReportTotals(g.milestones);
      g.crmAgreementDue = crm.agreementDue;
      g.crmAgreementReceived = crm.agreementReceived;
      g.crmAgreementPending = crm.agreementPending;
      g.crmGstDue = crm.gstDue;
      g.crmGstReceived = crm.gstReceived;
      g.crmGstPending = crm.gstPending;
      g.crmPostStageDue = crm.postStageDue;
      g.crmPostStageReceived = crm.postStageReceived;
      g.crmPostStagePending = crm.postStagePending;
      g.crmTotalDue = crm.totalDue;
      g.crmTotalReceived = crm.totalReceived;
      g.crmTotalPending = crm.totalPending;
    }
    let groups = [...map.values()];
    if (statusFilter) {
      groups = groups.filter(
        (g) => g.worstStatus === statusFilter || g.milestones.some((m) => m.paymentStatus === statusFilter),
      );
    }
    return groups.sort((a, b) => b.agreementPending + b.gstPending - (a.agreementPending + a.gstPending) || a.project.localeCompare(b.project));
  }, [scopedDemands, statusFilter]);

  const pageTotals = useMemo(() => sumCrmReportSummary(unitGroups), [unitGroups]);
  const dueAsOfToday = useMemo(() => sumCumulativeSummary(unitGroups), [unitGroups]);

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
    await updateDemand(id, payForm, { silent: true });
    setPayForm(null);
    setActionMsg('Payment updated.');
  };

  const handleMilestoneDate = async (demand, field, value) => {
    const key = `${demand._id}:${field}`;
    setDateBusy(key);
    setActionMsg(null);
    try {
      const body = { [field]: value || null, source: 'milestone' };
      const updated = await updateDemand(demand._id, body, { silent: true });
      void updated;
    } catch (err) {
      setActionMsg(err.message);
    } finally {
      setDateBusy(null);
    }
  };

  const milestoneLabel = (d) => d.milestoneName || formatMilestoneLabel(d.milestoneNameRaw);

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

  const dueTodayDue = dueAsOfToday.agreementDue + dueAsOfToday.gstDue;
  const dueTodayReceived = dueAsOfToday.agreementReceived + dueAsOfToday.gstReceived;
  const dueTodayPending = dueAsOfToday.agreementPending + dueAsOfToday.gstPending;
  const crmScheduleTotal = pageTotals.totalDue;
  const collectPct = fmtPct(dueTodayDue, dueTodayReceived);

  return (
    <div className="ps-demands-page">
      <div className="ps-demands-head">
        <div>
          <h2 style={{ margin: 0 }}>Demands &amp; collections</h2>
          <p className="ps-demands-sub">
            <strong>Due as of today</strong> — agreement due only for CLP stages (or instalments) whose target date is on or before today; token/booking counts when no date is set. GST from the CRM GST column.
            <strong> CRM schedule total</strong> (all Amount Due columns) shown for reconciliation.
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
          <div className="ps-kpi-label">Due as of today</div>
          <div className="ps-kpi-value">{fmt(dueTodayDue)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)' }}>
            CLP met · CRM schedule {fmt(crmScheduleTotal)}
          </div>
        </div>
        <div className="ps-kpi" style={{ borderColor: '#a7f3d0', background: 'var(--ps-success-bg)' }}>
          <div className="ps-kpi-label">Received <span className="ps-th-note">today</span></div>
          <div className="ps-kpi-value" style={{ color: 'var(--ps-success)' }}>{fmt(dueTodayReceived)}</div>
          <div className="ps-progress" style={{ marginTop: 8 }}>
            <div className="ps-progress-fill" style={{ width: `${collectPct}%` }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)' }}>{collectPct}% of due-as-today collected</div>
        </div>
        <div className={`ps-kpi ${dueTodayPending > 0 ? 'danger' : ''}`}>
          <div className="ps-kpi-label">Pending <span className="ps-th-note">today</span></div>
          <div className="ps-kpi-value">{fmt(dueTodayPending)}</div>
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
        <div className="ps-card ps-demands-scroll" style={{ padding: 0 }}>
          <table className="ps-table ps-demands-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Unit</th>
                <th>Location</th>
                <th className="ps-num">Agreement due <span className="ps-th-note">today</span></th>
                <th className="ps-num">Agreement recd <span className="ps-th-note">today</span></th>
                <th className="ps-num">Agreement pending</th>
                <th className="ps-num">GST due</th>
                <th className="ps-num">GST recd</th>
                <th className="ps-num">GST pending</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {unitGroups.map((g) => {
                const open = expanded.has(g.key);
                const totalDue = g.agreementDue + g.gstDue;
                const totalReceived = g.agreementReceived + g.gstReceived;
                const pct = fmtPct(totalDue, totalReceived);
                return (
                  <Fragment key={g.key}>
                    <tr className="ps-demand-unit-row" onClick={() => toggleExpand(g.key)}>
                      <td>{open ? '▼' : '▶'}</td>
                      <td>
                        <strong>{g.unitNumber}</strong>
                        <div className="ps-demands-meta">{g.project} · {g.customerName || '—'}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>{g.location || '—'}</td>
                      <td className="ps-num"><strong>{fmt(g.agreementDue)}</strong></td>
                      <td className="ps-num" style={{ color: 'var(--ps-success)' }}>{fmt(g.agreementReceived)}</td>
                      <td className="ps-num" style={{ color: g.agreementPending > 0 ? 'var(--ps-danger)' : undefined }}>{fmt(g.agreementPending)}</td>
                      <td className="ps-num"><strong>{fmt(g.gstDue)}</strong></td>
                      <td className="ps-num" style={{ color: 'var(--ps-success)' }}>{fmt(g.gstReceived)}</td>
                      <td className="ps-num" style={{ color: g.gstPending > 0 ? 'var(--ps-danger)' : undefined }}>{fmt(g.gstPending)}</td>
                      <td><span className={payBadge(g.worstStatus)}>{g.worstStatus}</span></td>
                    </tr>
                    {open && (
                      <tr className="ps-demand-expand-row">
                        <td colSpan={10} style={{ padding: '4px 8px 8px 28px' }}>
                          <table className="ps-clp-subtable">
                            <thead>
                              <tr>
                                <th>Milestone</th>
                                <th className="ps-num">CLP %</th>
                                <th>Target date</th>
                                <th className="ps-num">Agmt due</th>
                                <th className="ps-num">Agmt rcvd</th>
                                <th className="ps-num">Agmt pend</th>
                                <th className="ps-num">GST due</th>
                                <th className="ps-num">GST rcvd</th>
                                <th className="ps-num">GST pend</th>
                                <th>Status</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {g.milestones.filter((d) => !isGstDemand(d)).map((d) => {
                                const a = milestoneRowDisplay(d, AS_OF_TODAY);
                                const future = !a.agreementDue && !a.gstDue && (d.targetDate || d.dueDate);
                                return (
                                  <tr key={d._id} className={future ? 'ps-clp-future-row' : ''}>
                                    <td className="ps-clp-ms-name">{milestoneLabel(d)}</td>
                                    <td className="ps-num">{d.clpPercent || '—'}</td>
                                    <td>
                                      <input
                                        type="date"
                                        className="ps-clp-date"
                                        value={toIsoDateInput(d.targetDate || d.dueDate)}
                                        disabled={dateBusy === `${d._id}:targetDate`}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleMilestoneDate(d, 'targetDate', e.target.value)}
                                      />
                                    </td>
                                    <td className="ps-num">{fmt(a.agreementDue)}</td>
                                    <td className="ps-num">{fmt(a.agreementReceived)}</td>
                                    <td className="ps-num">{fmt(a.agreementPending)}</td>
                                    <td className="ps-num">{fmt(a.gstDue)}</td>
                                    <td className="ps-num">{fmt(a.gstReceived)}</td>
                                    <td className="ps-num">{fmt(a.gstPending)}</td>
                                    <td><span className={payBadge(d.paymentStatus)}>{d.paymentStatus}</span></td>
                                    <td>
                                      {payForm?.id === d._id ? (
                                        <div className="ps-inline-form" onClick={(e) => e.stopPropagation()}>
                                          <input type="number" value={payForm.paidAmount} onChange={(e) => setPayForm((f) => ({ ...f, paidAmount: Number(e.target.value) }))} />
                                          <button type="button" className="ps-btn ps-btn-primary" onClick={() => handlePay(d._id)}>Save</button>
                                          <button type="button" className="ps-btn" onClick={() => setPayForm(null)}>Cancel</button>
                                        </div>
                                      ) : (
                                        <button type="button" className="ps-btn ps-clp-mini-btn" onClick={(e) => { e.stopPropagation(); setPayForm({ id: d._id, paidAmount: d.paidAmount || 0, paidDate: new Date().toISOString().slice(0, 10) }); }}>
                                          Rcvd
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              {(() => {
                                const gst = g.milestones.find(isGstDemand);
                                if (!gst) return null;
                                const a = milestoneRowDisplay(gst, AS_OF_TODAY);
                                return (
                                  <tr key={gst._id} className="ps-clp-gst-row">
                                    <td className="ps-clp-ms-name">GST</td>
                                    <td className="ps-num">—</td>
                                    <td>
                                      <input type="date" className="ps-clp-date" value={toIsoDateInput(gst.targetDate || gst.dueDate)} disabled={dateBusy === `${gst._id}:targetDate`} onClick={(e) => e.stopPropagation()} onChange={(e) => handleMilestoneDate(gst, 'targetDate', e.target.value)} />
                                    </td>
                                    <td>—</td>
                                    <td>—</td>
                                    <td className="ps-num">—</td>
                                    <td className="ps-num">—</td>
                                    <td className="ps-num">—</td>
                                    <td className="ps-num">{fmt(a.gstDue)}</td>
                                    <td className="ps-num">{fmt(a.gstReceived)}</td>
                                    <td className="ps-num">{fmt(a.gstPending)}</td>
                                    <td><span className={payBadge(gst.paymentStatus)}>{gst.paymentStatus}</span></td>
                                    <td />
                                  </tr>
                                );
                              })()}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sortedMilestones.length > 0 && view === 'milestones' && (
        <div className="ps-card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="ps-table ps-demands-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Milestone</th>
                <th className="ps-num">Agmt due</th>
                <th className="ps-num">Agmt rcvd</th>
                <th className="ps-num">Agmt pend</th>
                <th className="ps-num">GST due</th>
                <th className="ps-num">GST rcvd</th>
                <th className="ps-num">GST pend</th>
                <th>Target</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedMilestones.filter((d) => !isGstDemand(d)).map((d) => {
                const a = milestoneRowDisplay(d, AS_OF_TODAY);
                return (
                  <tr key={d._id}>
                    <td>
                      <strong>{d.unitNumber}</strong>
                      <div className="ps-demands-meta">{d.project}{d.customerName ? ` · ${d.customerName}` : ''}</div>
                    </td>
                    <td>
                      {milestoneLabel(d)}
                      <div className="ps-demands-meta">CLP {d.clpPercent || '—'}%</div>
                    </td>
                    <td className="ps-num">{fmt(a.agreementDue)}</td>
                    <td className="ps-num" style={{ color: 'var(--ps-success)' }}>{fmt(a.agreementReceived)}</td>
                    <td className="ps-num" style={{ color: a.agreementPending > 0 ? 'var(--ps-danger)' : undefined }}>{fmt(a.agreementPending)}</td>
                    <td className="ps-num">{fmt(a.gstDue)}</td>
                    <td className="ps-num" style={{ color: 'var(--ps-success)' }}>{fmt(a.gstReceived)}</td>
                    <td className="ps-num" style={{ color: a.gstPending > 0 ? 'var(--ps-danger)' : undefined }}>{fmt(a.gstPending)}</td>
                    <td>
                      <input type="date" className="ps-clp-date" value={toIsoDateInput(d.targetDate || d.dueDate)} onChange={(e) => handleMilestoneDate(d, 'targetDate', e.target.value)} />
                    </td>
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
        Tip: use <strong>By unit</strong> for a customer overview; milestones run Token → Possession. Set <strong>Actual date</strong> when construction completes — a CLP letter task (step 12) is created automatically.
        {' '}<Link to="/app/post-sales/units">Sold units</Link> · <Link to="/app/post-sales/allocation">Allocation</Link>
      </p>
    </div>
  );
}
