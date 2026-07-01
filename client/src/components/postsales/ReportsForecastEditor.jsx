import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMilestoneLabel } from '../../lib/postsales/milestoneLabels.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import TextNoteModal from './TextNoteModal.jsx';

function toInputDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function emptyInstallment(overrides = {}) {
  return {
    amount: '',
    expectedDate: '',
    includesTax: false,
    taxAmount: '',
    riskCategory: 'clear',
    note: '',
    receivedAmount: '',
    status: 'planned',
    ...overrides,
  };
}

function sumInstallments(installments, skipIdx = -1) {
  return installments.reduce((s, inst, ii) => (ii === skipIdx ? s : s + (Number(inst.amount) || 0)), 0);
}

export default function ReportsForecastEditor({ row, onSave, onCancel, onTaskUpdated }) {
  const [remarks, setRemarks] = useState(row.collectionRemarks || '');
  const [priority, setPriority] = useState(row.cxPriority || 'normal');
  const [followUp, setFollowUp] = useState(row.followUpOwner || '');
  const [gstDue, setGstDue] = useState(row.gstDue ?? '');
  const [gstReceived, setGstReceived] = useState(row.gstReceived ?? '');
  const [gstPending, setGstPending] = useState(row.gstPending ?? '');
  const [bookingDisbursed, setBookingDisbursed] = useState(row.bookingDisbursedAmount || '');
  const [applySettlement, setApplySettlement] = useState(false);
  const [milestones, setMilestones] = useState(() => (row.milestones || []).map((m) => ({
    _id: m._id,
    demandId: m.demandId,
    milestoneName: m.milestoneName,
    clpDueAmount: m.clpDueAmount,
    clpReceivedAmount: m.clpReceivedAmount,
    clpPendingAmount: m.clpPendingAmount,
    isGst: m.isGst,
    scheduleAchievedDate: m.scheduleAchievedDate,
    installments: (m.installments?.length ? m.installments : [emptyInstallment()]).map((i) => ({
      _id: i._id,
      amount: i.amount ?? '',
      expectedDate: toInputDate(i.expectedDate),
      includesTax: !!i.includesTax,
      taxAmount: i.taxAmount ?? '',
      riskCategory: i.riskCategory || 'clear',
      note: i.note || '',
      receivedAmount: i.receivedAmount ?? '',
      status: i.status || 'planned',
      revisedDate: toInputDate(i.revisedDate),
      scheduleLinked: !!i.scheduleLinked,
    })),
  })));
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [settlementInfo, setSettlementInfo] = useState(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [noteModal, setNoteModal] = useState(null);

  useEffect(() => {
    postSalesApi.getDisbursementTasks(row.unitId).then(setTasks).catch(() => setTasks([]));
  }, [row.unitId]);

  const syncGstPending = (due, received) => {
    const d = Number(due);
    const r = Number(received);
    if (Number.isFinite(d) && Number.isFinite(r)) setGstPending(Math.max(0, d - r));
  };

  const updateInst = (mi, ii, field, value) => {
    setMilestones((prev) => {
      const next = prev.map((m, idx) => (idx === mi ? { ...m, installments: [...m.installments] } : m));
      next[mi].installments[ii] = { ...next[mi].installments[ii], [field]: value };

      if (field === 'amount' && ii === 0) {
        const pending = Number(next[mi].clpPendingAmount) || 0;
        const firstAmt = Number(value) || 0;
        const remainder = Math.max(0, pending - firstAmt);
        if (next[mi].installments.length === 1 && remainder > 0) {
          next[mi].installments.push(emptyInstallment({ amount: remainder, expectedDate: next[mi].installments[0].expectedDate }));
        } else if (next[mi].installments.length > 1) {
          next[mi].installments[1] = {
            ...next[mi].installments[1],
            amount: remainder,
          };
        }
      }
      return next;
    });
  };

  const addInstallment = (mi) => {
    setMilestones((prev) => prev.map((m, idx) => {
      if (idx !== mi) return m;
      const pending = Number(m.clpPendingAmount) || 0;
      const allocated = sumInstallments(m.installments);
      const remainder = Math.max(0, pending - allocated);
      return { ...m, installments: [...m.installments, emptyInstallment({ amount: remainder || '' })] };
    }));
  };

  const removeInstallment = (mi, ii) => {
    setMilestones((prev) => prev.map((m, idx) => (
      idx === mi ? { ...m, installments: m.installments.filter((_, j) => j !== ii) } : m
    )));
  };

  const handleCompleteTask = async (taskId) => {
    setBusy(true);
    try {
      await postSalesApi.completeDisbursementTask(taskId);
      const updated = await postSalesApi.getDisbursementTasks(row.unitId);
      setTasks(updated);
      onTaskUpdated?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelayTask = async (taskId) => {
    const revisedDate = window.prompt('New expected disbursement date (YYYY-MM-DD):');
    if (!revisedDate) return;
    setBusy(true);
    try {
      await postSalesApi.delayDisbursementTask(taskId, { revisedDate });
      const updated = await postSalesApi.getDisbursementTasks(row.unitId);
      setTasks(updated);
      onTaskUpdated?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const result = await onSave({
        collectionRemarks: remarks,
        cxPriority: priority,
        followUpOwner: followUp,
        gstDue: Number(gstDue),
        gstReceived: Number(gstReceived),
        gstPending: Number(gstPending),
        bookingDisbursedAmount: Number(bookingDisbursed) || 0,
        applyBookingSettlement: applySettlement && Number(bookingDisbursed) > 0,
        syncDisbursementTasks: true,
        milestones: milestones.map((m) => ({
          _id: m._id,
          demandId: m.demandId,
          milestoneName: m.milestoneName,
          installments: m.installments
            .filter((i) => Number(i.amount) > 0 && i.expectedDate)
            .map((i) => ({
              _id: i._id,
              amount: Number(i.amount),
              expectedDate: i.expectedDate,
              includesTax: i.includesTax,
              taxAmount: Number(i.taxAmount) || 0,
              riskCategory: i.riskCategory,
              note: i.note,
              receivedAmount: Number(i.receivedAmount) || 0,
              status: i.status || 'planned',
              revisedDate: i.revisedDate || undefined,
            })),
        })),
      });
      if (result?.settlementSummary) {
        setSettlementInfo(result.settlementSummary);
      }
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const openTasks = tasks.filter((t) => t.status === 'open' || t.status === 'delayed');

  return (
    <div className="ps-reports-forecast-panel">
      <div className="ps-reports-forecast-meta">
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
        <div className="ps-reports-remarks-field">
          <span className="ps-reports-remarks-label">Collection remarks</span>
          <button
            type="button"
            className="ps-reports-remarks-edit-btn"
            onClick={() => setRemarksOpen(true)}
          >
            {remarks.trim() ? (
              <span className="ps-reports-remarks-preview">{remarks.trim().slice(0, 48)}{remarks.trim().length > 48 ? '…' : ''}</span>
            ) : (
              <span className="ps-reports-muted">Add follow-up notes…</span>
            )}
            <span className="ps-reports-remarks-action">Edit</span>
          </button>
        </div>
      </div>

      <TextNoteModal
        open={remarksOpen}
        title="Collection remarks"
        value={remarks}
        onChange={setRemarks}
        onClose={() => setRemarksOpen(false)}
        placeholder="Follow-up notes, payment commitments…"
      />
      <TextNoteModal
        open={noteModal != null}
        title={noteModal ? `Installment note — ${formatMilestoneLabel(noteModal.milestoneName)}` : 'Note'}
        value={noteModal?.value ?? ''}
        onChange={(v) => {
          if (noteModal == null) return;
          updateInst(noteModal.mi, noteModal.ii, 'note', v);
          setNoteModal((prev) => (prev ? { ...prev, value: v } : prev));
        }}
        onClose={() => setNoteModal(null)}
        placeholder="Payment context, client commitment…"
      />

      <div className="ps-reports-gst-block">
        <div className="ps-reports-ms-title">GST (editable overrides)</div>
        <div className="ps-reports-gst-row">
          <label>
            GST Due
            <input type="number" value={gstDue} onChange={(e) => { setGstDue(e.target.value); syncGstPending(e.target.value, gstReceived); }} />
          </label>
          <label>
            GST Received
            <input type="number" value={gstReceived} onChange={(e) => { setGstReceived(e.target.value); syncGstPending(gstDue, e.target.value); }} />
          </label>
          <label>
            GST Pending
            <input type="number" value={gstPending} onChange={(e) => setGstPending(e.target.value)} />
          </label>
        </div>
        {row.gstDueComputed != null && (
          <p className="ps-reports-muted">Computed from CRM: Due {fmt(row.gstDueComputed)} · Recd {fmt(row.gstReceivedComputed)}</p>
        )}
      </div>

      <div className="ps-reports-booking-block">
        <div className="ps-reports-ms-title">Booking disbursement settlement</div>
        <p className="ps-reports-muted">If customer booked at an advanced CLP stage (e.g. 80%), enter total amount already disbursed. Apply to settle milestones chronologically from the beginning.</p>
        <div className="ps-reports-gst-row">
          <label>
            Disbursed amount at booking
            <input type="number" value={bookingDisbursed} onChange={(e) => setBookingDisbursed(e.target.value)} placeholder="₹ amount received before onboarding" />
          </label>
          <label className="ps-reports-tax-chk" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
            <input type="checkbox" checked={applySettlement} onChange={(e) => setApplySettlement(e.target.checked)} />
            Apply FIFO settlement on save
          </label>
        </div>
        {row.bookingSettlementAppliedAt && (
          <p className="ps-reports-muted">Last applied: {new Date(row.bookingSettlementAppliedAt).toLocaleString('en-IN')}</p>
        )}
        {settlementInfo?.milestones?.length > 0 && (
          <div className="ps-reports-settlement-summary">
            <strong>Settlement applied:</strong>
            {settlementInfo.milestones.map((m) => (
              <span key={m.milestoneName} className="ps-reports-inst-chip">
                {formatMilestoneLabel(m.milestoneName)}: {fmt(m.applied)} applied · {fmt(m.pending)} pending
              </span>
            ))}
            {settlementInfo.remaining > 0 && (
              <span className="ps-reports-inst-chip ps-reports-cat-risky">Unallocated: {fmt(settlementInfo.remaining)}</span>
            )}
          </div>
        )}
      </div>

      {milestones.map((m, mi) => (
        <div key={m.demandId || m.milestoneName} className="ps-reports-ms-block">
          <div className="ps-reports-ms-title">
            {formatMilestoneLabel(m.milestoneName)}
            <span className="ps-reports-clp-meta">
              CLP Due {fmt(m.clpDueAmount)} · Recd {fmt(m.clpReceivedAmount)} · Pending {fmt(m.clpPendingAmount)}
            </span>
            {m.scheduleAchievedDate && (
              <span className="ps-reports-schedule-link" title="From Milestones tab → Achieved Date">
                Linked to CLP schedule
              </span>
            )}
          </div>
          {m.installments.map((inst, ii) => (
            <div key={inst._id || ii} className="ps-reports-inst-row">
              <input type="number" placeholder="Amount ₹" value={inst.amount} onChange={(e) => updateInst(mi, ii, 'amount', e.target.value)} title={ii === 0 ? 'Edit first amount — remainder auto-fills next installment' : 'Amount'} />
              <input
                type="date"
                value={inst.expectedDate}
                readOnly={!!inst.scheduleLinked}
                onChange={(e) => updateInst(mi, ii, 'expectedDate', e.target.value)}
                title={inst.scheduleLinked ? 'Set Achieved Date on Milestones tab' : 'Expected date'}
              />
              {inst.scheduleLinked && (
                <Link to="/app/post-sales/milestones" className="ps-reports-schedule-link" title="Edit on Milestones tab">
                  Milestones
                </Link>
              )}
              <select value={inst.riskCategory} onChange={(e) => updateInst(mi, ii, 'riskCategory', e.target.value)} title="Risk">
                <option value="clear">Clear</option>
                <option value="risky">Risky</option>
                <option value="delayed">Delayed</option>
              </select>
              <label className="ps-reports-tax-chk" title="Includes GST portion">
                <input type="checkbox" checked={inst.includesTax} onChange={(e) => updateInst(mi, ii, 'includesTax', e.target.checked)} />
                GST
              </label>
              <input type="number" placeholder="GST ₹" value={inst.taxAmount} onChange={(e) => updateInst(mi, ii, 'taxAmount', e.target.value)} disabled={!inst.includesTax} />
              <button
                type="button"
                className={`ps-reports-note-btn ${inst.note ? 'has-note' : ''}`}
                title={inst.note || 'Add installment note'}
                onClick={() => setNoteModal({
                  mi,
                  ii,
                  milestoneName: m.milestoneName,
                  value: inst.note || '',
                })}
              >
                Note{inst.note ? ' ✓' : ''}
              </button>
              {inst.status === 'complete' && <span className="ps-badge ps-badge-green">Paid</span>}
              {m.installments.length > 1 && (
                <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => removeInstallment(mi, ii)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={() => addInstallment(mi)}>+ Add installment</button>
        </div>
      ))}

      {openTasks.length > 0 && (
        <div className="ps-reports-tasks-block">
          <div className="ps-reports-ms-title">Disbursement follow-up tasks</div>
          {openTasks.map((t) => (
            <div key={t._id} className="ps-reports-task-row">
              <span>{formatMilestoneLabel(t.milestoneName)} · {fmt(t.expectedAmount)} · {toInputDate(t.expectedDate)}</span>
              <span className={`ps-badge ps-badge-${t.status === 'delayed' ? 'red' : 'amber'}`}>{t.status}</span>
              <button type="button" className="ps-btn ps-reports-mini-btn" disabled={busy} onClick={() => handleCompleteTask(t._id)}>Mark complete</button>
              <button type="button" className="ps-btn ps-reports-mini-btn" disabled={busy} onClick={() => handleDelayTask(t._id)}>Mark delayed</button>
            </div>
          ))}
        </div>
      )}

      <div className="ps-reports-meta-chips" style={{ marginTop: 10 }}>
        <Link to={`/app/post-sales/units/${row.unitId}`} className="ps-chip">Open pipeline →</Link>
      </div>

      {err && <div className="ps-error">{err}</div>}
      <div className="ps-reports-forecast-actions">
        <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save forecast'}</button>
        <button type="button" className="ps-btn" onClick={onCancel}>Close</button>
      </div>
    </div>
  );
}
