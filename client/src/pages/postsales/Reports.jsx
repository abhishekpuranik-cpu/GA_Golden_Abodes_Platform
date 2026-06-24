import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import { useCollectionRegister, useDisbursementForecast } from '../../hooks/postsales/useReports.js';
import { formatMilestoneLabel } from '../../lib/postsales/milestoneLabels.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toInputDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

function emptyInstallment() {
  return { amount: '', expectedDate: '', includesTax: false, taxAmount: '', riskCategory: 'clear', note: '', receivedAmount: '' };
}

function ForecastEditor({ row, onSave, onCancel }) {
  const [remarks, setRemarks] = useState(row.collectionRemarks || '');
  const [priority, setPriority] = useState(row.cxPriority || 'normal');
  const [followUp, setFollowUp] = useState(row.followUpOwner || '');
  const [milestones, setMilestones] = useState(
    () => (row.milestones || []).map((m) => ({
      demandId: m.demandId,
      milestoneName: m.milestoneName,
      installments: (m.installments?.length ? m.installments : [emptyInstallment()]).map((i) => ({
        amount: i.amount ?? '',
        expectedDate: toInputDate(i.expectedDate),
        includesTax: !!i.includesTax,
        taxAmount: i.taxAmount ?? '',
        riskCategory: i.riskCategory || 'clear',
        note: i.note || '',
        receivedAmount: i.receivedAmount ?? '',
      })),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const updateInst = (mi, ii, field, value) => {
    setMilestones((prev) => {
      const next = prev.map((m, idx) => (idx === mi ? { ...m, installments: [...m.installments] } : m));
      next[mi].installments[ii] = { ...next[mi].installments[ii], [field]: value };
      return next;
    });
  };

  const addInstallment = (mi) => {
    setMilestones((prev) => prev.map((m, idx) => (
      idx === mi ? { ...m, installments: [...m.installments, emptyInstallment()] } : m
    )));
  };

  const removeInstallment = (mi, ii) => {
    setMilestones((prev) => prev.map((m, idx) => (
      idx === mi ? { ...m, installments: m.installments.filter((_, j) => j !== ii) } : m
    )));
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        collectionRemarks: remarks,
        cxPriority: priority,
        followUpOwner: followUp,
        milestones: milestones.map((m) => ({
          demandId: m.demandId,
          milestoneName: m.milestoneName,
          installments: m.installments
            .filter((i) => Number(i.amount) > 0 && i.expectedDate)
            .map((i) => ({
              amount: Number(i.amount),
              expectedDate: i.expectedDate,
              includesTax: i.includesTax,
              taxAmount: Number(i.taxAmount) || 0,
              riskCategory: i.riskCategory,
              note: i.note,
              receivedAmount: Number(i.receivedAmount) || 0,
            })),
        })),
      });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="ps-reports-forecast-panel">
      <div className="ps-reports-forecast-meta">
        <label>
          Collection remarks
          <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Follow-up notes, payment commitments…" />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="normal">Normal</option>
            <option value="watch">Watch</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Follow-up owner
          <input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="CX executive" />
        </label>
      </div>
      {milestones.map((m, mi) => (
        <div key={m.demandId || m.milestoneName} className="ps-reports-ms-block">
          <div className="ps-reports-ms-title">{formatMilestoneLabel(m.milestoneName)}</div>
          {m.installments.map((inst, ii) => (
            <div key={ii} className="ps-reports-inst-row">
              <input type="number" placeholder="Amount ₹" value={inst.amount} onChange={(e) => updateInst(mi, ii, 'amount', e.target.value)} />
              <input type="date" value={inst.expectedDate} onChange={(e) => updateInst(mi, ii, 'expectedDate', e.target.value)} title="Expected date" />
              <select value={inst.riskCategory} onChange={(e) => updateInst(mi, ii, 'riskCategory', e.target.value)} title="Risk">
                <option value="clear">Clear</option>
                <option value="risky">Risky</option>
                <option value="delayed">Delayed</option>
              </select>
              <label className="ps-reports-tax-chk" title="Includes tax portion">
                <input type="checkbox" checked={inst.includesTax} onChange={(e) => updateInst(mi, ii, 'includesTax', e.target.checked)} />
                Tax
              </label>
              <input type="number" placeholder="Tax ₹" value={inst.taxAmount} onChange={(e) => updateInst(mi, ii, 'taxAmount', e.target.value)} disabled={!inst.includesTax} />
              <input type="text" placeholder="Note" value={inst.note} onChange={(e) => updateInst(mi, ii, 'note', e.target.value)} className="ps-reports-inst-note" />
              {m.installments.length > 1 && (
                <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => removeInstallment(mi, ii)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => addInstallment(mi)}>+ Add installment</button>
        </div>
      ))}
      {err && <div className="ps-error">{err}</div>}
      <div className="ps-reports-forecast-actions">
        <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save forecast'}</button>
        <button type="button" className="ps-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DisbursementTree({ data, categoryFilter }) {
  const [expandedWeeks, setExpandedWeeks] = useState(new Set());
  const [expandedDates, setExpandedDates] = useState(new Set());

  const toggleWeek = (k) => setExpandedWeeks((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const toggleDate = (k) => setExpandedDates((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  if (!data?.weeks?.length) {
    return <div className="ps-empty">No forecast or receipts in the selected date range. Add expected payments in the Collection register.</div>;
  }

  const gt = data.grandTotal;

  return (
    <div className="ps-reports-disb-wrap">
      <table className="ps-reports-disb-table">
        <thead>
          <tr className="ps-reports-disb-h1">
            <th rowSpan={2} className="ps-reports-disb-week-col">Week</th>
            <th colSpan={4}>Pending</th>
            <th rowSpan={2}>Total Received</th>
          </tr>
          <tr className="ps-reports-disb-h2">
            <th>Clear</th>
            <th>Risky</th>
            <th>Delayed</th>
            <th>Total Pending</th>
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((w) => (
            <Fragment key={w.key}>
              <tr className="ps-reports-disb-week-row" onClick={() => toggleWeek(w.key)}>
                <td>
                  <span className="ps-reports-chevron">{expandedWeeks.has(w.key) ? '▼' : '▶'}</span>
                  {w.label}
                </td>
                <td className="ps-num">{fmtNum(w.clear)}</td>
                <td className="ps-num">{fmtNum(w.risky)}</td>
                <td className="ps-num">{fmtNum(w.delayed)}</td>
                <td className="ps-num ps-reports-total-pending">{fmtNum(w.totalPending)}</td>
                <td className="ps-num ps-reports-total-received">{fmtNum(w.totalReceived)}</td>
              </tr>
              {expandedWeeks.has(w.key) && w.dates.map((d) => {
                const dk = `${w.key}|${d.date}`;
                const pendingClients = d.clients.filter((c) => c.type === 'expected');
                const receivedClients = d.clients.filter((c) => c.type === 'received');
                return (
                  <Fragment key={dk}>
                    <tr className="ps-reports-disb-date-row" onClick={() => toggleDate(dk)}>
                      <td colSpan={6}>
                        <span className="ps-reports-chevron">{expandedDates.has(dk) ? '▼' : '▶'}</span>
                        <strong>{fmtDate(d.date)}</strong>
                        <span className="ps-reports-disb-date-meta">
                          Pending {fmt(d.totalPending)} · Received {fmt(d.totalReceived)}
                        </span>
                      </td>
                    </tr>
                    {expandedDates.has(dk) && (
                      <>
                        {pendingClients.map((c, i) => (
                          <tr key={`p-${dk}-${i}`} className="ps-reports-disb-client-row">
                            <td colSpan={2}>
                              <Link to={`/app/post-sales/units/${c.unitId}`}>{c.unitNumber}</Link>
                              {' · '}{c.clientName}
                              <span className="ps-reports-disb-ms">{c.milestoneName}</span>
                            </td>
                            <td className={`ps-num ps-reports-cat-${c.category}`} colSpan={2}>{c.category}</td>
                            <td className="ps-num" colSpan={2}>{fmt(c.amount)}</td>
                          </tr>
                        ))}
                        {receivedClients.map((c, i) => (
                          <tr key={`r-${dk}-${i}`} className="ps-reports-disb-client-row received">
                            <td colSpan={4}>
                              <Link to={`/app/post-sales/units/${c.unitId}`}>{c.unitNumber}</Link>
                              {' · '}{c.clientName}
                              <span className="ps-reports-disb-ms">{c.milestoneName}</span>
                              <span className="ps-badge ps-badge-green">Received</span>
                            </td>
                            <td className="ps-num" colSpan={2}>{fmt(c.amount)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
          <tr className="ps-reports-disb-grand">
            <td><strong>Grand Total</strong></td>
            <td className="ps-num"><strong>{fmtNum(gt.clear)}</strong></td>
            <td className="ps-num"><strong>{fmtNum(gt.risky)}</strong></td>
            <td className="ps-num"><strong>{fmtNum(gt.delayed)}</strong></td>
            <td className="ps-num"><strong>{fmtNum(gt.totalPending)}</strong></td>
            <td className="ps-num"><strong>{fmtNum(gt.totalReceived)}</strong></td>
          </tr>
        </tbody>
      </table>
      {categoryFilter && (
        <p className="ps-reports-filter-note">Showing category: <strong>{categoryFilter}</strong></p>
      )}
    </div>
  );
}

export default function Reports() {
  const [view, setView] = useState('register');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 3, 0).toISOString().slice(0, 10);
  });
  const [expanded, setExpanded] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const [excelBusy, setExcelBusy] = useState(false);
  const fileRef = useRef(null);

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();

  const registerFilters = useMemo(() => ({
    ...query,
    ...(search ? { search } : {}),
    ...(priority ? { priority } : {}),
  }), [query, search, priority]);

  const disbFilters = useMemo(() => ({
    ...query,
    from: dateFrom,
    to: dateTo,
    ...(category ? { category } : {}),
  }), [query, dateFrom, dateTo, category]);

  const { rows, summary, asOf, loading, error, refresh, saveForecast } = useCollectionRegister(registerFilters);
  const { data: disbData, loading: disbLoading, error: disbError } = useDisbursementForecast(disbFilters);

  const toggleRow = (id) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleSave = async (unitId, body) => {
    await saveForecast(unitId, body);
    setEditing(null);
    setToast('Forecast saved — disbursement view updated.');
    setTimeout(() => setToast(''), 4000);
  };

  const handleDownload = async () => {
    setExcelBusy(true);
    try {
      await postSalesApi.downloadCollectionRegisterExcel({
        ...registerFilters,
        from: dateFrom,
        to: dateTo,
      });
    } catch (e) {
      setToast(e.message);
      setTimeout(() => setToast(''), 5000);
    } finally {
      setExcelBusy(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setExcelBusy(true);
    try {
      const r = await postSalesApi.uploadReportsExcel(file);
      setToast(r.message || `Imported ${r.saved} unit(s).`);
      await refresh();
      setTimeout(() => setToast(''), 5000);
    } catch (e) {
      setToast(e.message);
      setTimeout(() => setToast(''), 5000);
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <div className="ps-reports-page">
      <div className="ps-reports-head">
        <div>
          <h2 style={{ margin: 0 }}>Reports</h2>
          <p className="ps-reports-sub">
            Collection register with milestone payment forecasts · rolls up to weekly disbursement view (Clear / Risky / Delayed).
            {asOf ? ` · As of ${asOf}` : ''}
          </p>
        </div>
        <div className="ps-tabs">
          <button type="button" className={`ps-tab ${view === 'register' ? 'active' : ''}`} onClick={() => setView('register')}>Collection register</button>
          <button type="button" className={`ps-tab ${view === 'disbursement' ? 'active' : ''}`} onClick={() => setView('disbursement')}>Disbursement forecast</button>
        </div>
        <div className="ps-reports-excel-actions">
          <button type="button" className="ps-btn" disabled={excelBusy} onClick={() => postSalesApi.downloadReportsTemplate()}>Template</button>
          <button type="button" className="ps-btn" disabled={excelBusy} onClick={handleDownload}>Download Excel</button>
          <button type="button" className="ps-btn ps-btn-primary" disabled={excelBusy} onClick={() => fileRef.current?.click()}>Upload Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
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
        extra={view === 'register' ? (
          <>
            <input type="search" placeholder="Search unit, client…" value={search} onChange={(e) => setSearch(e.target.value)} className="ps-demands-search" />
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All priorities</option>
              <option value="high">High priority</option>
              <option value="watch">Watch list</option>
              <option value="normal">Normal</option>
            </select>
          </>
        ) : (
          <>
            <label className="ps-reports-date-label">From<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
            <label className="ps-reports-date-label">To<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              <option value="clear">Clear</option>
              <option value="risky">Risky</option>
              <option value="delayed">Delayed</option>
            </select>
          </>
        )}
      />

      {view === 'register' && summary && (
        <div className="ps-kpi-grid ps-reports-kpi">
          <div className="ps-kpi"><div className="ps-kpi-label">Units</div><div className="ps-kpi-value">{summary.units}</div></div>
          <div className="ps-kpi"><div className="ps-kpi-label">Total due</div><div className="ps-kpi-value" style={{ fontSize: '1.1rem' }}>{fmt(summary.totalDue)}</div></div>
          <div className="ps-kpi"><div className="ps-kpi-label">Received</div><div className="ps-kpi-value" style={{ fontSize: '1.1rem', color: 'var(--ps-success)' }}>{fmt(summary.receivedAmount)}</div></div>
          <div className="ps-kpi danger"><div className="ps-kpi-label">Pending (today)</div><div className="ps-kpi-value" style={{ fontSize: '1.1rem' }}>{fmt(summary.pendingAsOfToday)}</div></div>
          <div className="ps-kpi"><div className="ps-kpi-label">Tax pending</div><div className="ps-kpi-value" style={{ fontSize: '1.1rem' }}>{fmt(summary.taxPending)}</div></div>
        </div>
      )}

      {loading && view === 'register' && <div className="ps-empty">Loading collection register…</div>}
      {error && view === 'register' && <div className="ps-error">{error}</div>}

      {view === 'register' && !loading && !error && (
        <div className="ps-reports-scroll">
          <table className="ps-table ps-reports-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Client</th>
                <th>Project</th>
                <th>Booking</th>
                <th>Agreement</th>
                <th className="ps-num">Area sq.ft</th>
                <th className="ps-num">Agmt value</th>
                <th className="ps-num">Total due</th>
                <th className="ps-num">Received</th>
                <th className="ps-num">Pending<span className="ps-th-note">as of today</span></th>
                <th className="ps-num">Tax due</th>
                <th className="ps-num">Tax recd</th>
                <th className="ps-num">Tax pend</th>
                <th>Expected payments</th>
                <th>Remarks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded.has(row.unitId);
                const isEdit = editing === row.unitId;
                const instCount = (row.milestones || []).reduce((s, m) => s + (m.installments?.length || 0), 0);
                return (
                  <Fragment key={row.unitId}>
                    <tr className="ps-reports-unit-row">
                      <td><strong>{row.unitNumber}</strong></td>
                      <td>
                        {row.clientName}
                        {row.cxPriority !== 'normal' && (
                          <span className={`ps-badge ps-badge-${row.cxPriority === 'high' ? 'red' : 'amber'}`} style={{ marginLeft: 4 }}>{row.cxPriority}</span>
                        )}
                      </td>
                      <td className="ps-reports-compact">{row.project}{row.phase ? ` · ${row.phase}` : ''}</td>
                      <td className="ps-reports-compact">{fmtDate(row.bookingDate)}</td>
                      <td className="ps-reports-compact">{fmtDate(row.agreementDate)}</td>
                      <td className="ps-num">{fmtNum(row.saleableArea || row.carpetArea)}</td>
                      <td className="ps-num">{fmt(row.agreementValue)}</td>
                      <td className="ps-num">{fmt(row.totalDue)}</td>
                      <td className="ps-num">{fmt(row.receivedAmount)}</td>
                      <td className="ps-num">{fmt(row.pendingAsOfToday)}</td>
                      <td className="ps-num">{fmt(row.taxDue)}</td>
                      <td className="ps-num">{fmt(row.taxReceived)}</td>
                      <td className="ps-num">{fmt(row.taxPending)}</td>
                      <td className="ps-reports-expected-cell">
                        {row.nextExpectedDate ? (
                          <span>{fmt(row.nextExpectedAmount)} · {fmtDate(row.nextExpectedDate)}</span>
                        ) : (
                          <span className="ps-reports-muted">Set forecast</span>
                        )}
                        {instCount > 0 && <span className="ps-reports-inst-count">{instCount} inst.</span>}
                      </td>
                      <td className="ps-reports-remarks">{row.collectionRemarks || '—'}</td>
                      <td>
                        <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => toggleRow(row.unitId)}>{isOpen ? '▲' : '▼'}</button>
                        <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => { setEditing(row.unitId); setExpanded((p) => new Set(p).add(row.unitId)); }}>Edit</button>
                      </td>
                    </tr>
                    {(isOpen || isEdit) && (
                      <tr className="ps-reports-expand-row">
                        <td colSpan={16}>
                          <div className="ps-reports-expand-grid">
                            <div className="ps-reports-meta-chips">
                              <span className="ps-chip">Plan: {row.paymentPlan || '—'}</span>
                              <span className="ps-chip">CX: {row.cxExecutive || '—'}</span>
                              <span className="ps-chip">Last pay: {fmtDate(row.lastPaymentDate)}</span>
                              <span className="ps-chip">{row.overallCollectionPct}% collected</span>
                              <Link to={`/app/post-sales/units/${row.unitId}`} className="ps-chip">Open pipeline →</Link>
                            </div>
                            {isEdit ? (
                              <ForecastEditor row={row} onSave={(body) => handleSave(row.unitId, body)} onCancel={() => setEditing(null)} />
                            ) : (
                              <div className="ps-reports-readonly-forecast">
                                {(row.milestones || []).map((m) => (
                                  <div key={m.milestoneName} className="ps-reports-ms-read">
                                    <strong>{formatMilestoneLabel(m.milestoneName)}</strong>
                                    {(m.installments || []).length ? m.installments.map((i, idx) => (
                                      <span key={idx} className={`ps-reports-inst-chip ps-reports-cat-${i.riskCategory || 'clear'}`}>
                                        {fmt(i.amount)} · {fmtDate(i.expectedDate)}
                                      </span>
                                    )) : <span className="ps-reports-muted">No installments planned</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {summary && rows.length > 0 && (
              <tfoot>
                <tr className="ps-reports-foot">
                  <td colSpan={6}><strong>Page totals ({summary.units} units)</strong></td>
                  <td className="ps-num">{fmt(summary.totalDue)}</td>
                  <td className="ps-num">{fmt(summary.receivedAmount)}</td>
                  <td className="ps-num">{fmt(summary.pendingAsOfToday)}</td>
                  <td className="ps-num">{fmt(summary.taxDue)}</td>
                  <td className="ps-num">{fmt(summary.taxReceived)}</td>
                  <td className="ps-num">{fmt(summary.taxPending)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {view === 'disbursement' && disbLoading && <div className="ps-empty">Building disbursement forecast…</div>}
      {view === 'disbursement' && disbError && <div className="ps-error">{disbError}</div>}
      {view === 'disbursement' && !disbLoading && !disbError && (
        <DisbursementTree data={disbData} categoryFilter={category} />
      )}

      {toast && <div className="ps-toast">{toast}</div>}
    </div>
  );
}
