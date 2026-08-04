import { useEffect, useMemo, useState } from 'react';
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

/** One forecast row per milestone with pending balance or an existing forecast. */
function initForecastMilestones(row) {
  return (row.milestones || [])
    .filter((m) => !m.isGst && ((Number(m.clpPendingAmount) || 0) > 0 || (m.installments || []).some((i) => Number(i.amount) > 0)))
    .map((m) => {
      const saved = m.installments?.find((i) => Number(i.amount) > 0) || m.installments?.[0];
      const pending = Number(m.clpPendingAmount) || 0;
      const inst = saved || emptyInstallment();
      return {
        _id: m._id,
        demandId: m.demandId,
        milestoneName: m.milestoneName,
        clpPendingAmount: pending,
        scheduleAchievedDate: m.scheduleAchievedDate,
        installment: {
          _id: inst._id,
          amount: inst.amount ?? (pending || ''),
          expectedDate: toInputDate(inst.expectedDate) || toInputDate(m.scheduleAchievedDate),
          includesTax: !!inst.includesTax,
          taxAmount: inst.taxAmount ?? '',
          riskCategory: inst.riskCategory || 'clear',
          note: inst.note || '',
          receivedAmount: inst.receivedAmount ?? '',
          status: inst.status || 'planned',
          revisedDate: toInputDate(inst.revisedDate),
          scheduleLinked: !!inst.scheduleLinked,
        },
      };
    });
}

export default function ReportsForecastEditor({ row, onSave, onCancel, onTaskUpdated }) {
  const [remarks, setRemarks] = useState(row.collectionRemarks || '');
  const [priority, setPriority] = useState(row.cxPriority || 'normal');
  const [followUp, setFollowUp] = useState(row.followUpOwner || '');
  const [milestones, setMilestones] = useState(() => initForecastMilestones(row));
  const [gstDue, setGstDue] = useState(row.gstDue ?? '');
  const [gstReceived, setGstReceived] = useState(row.gstReceived ?? '');
  const [gstPending, setGstPending] = useState(row.gstPending ?? '');
  const [bookingDisbursed, setBookingDisbursed] = useState(row.bookingDisbursedAmount || '');
  const [applySettlement, setApplySettlement] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [settlementInfo, setSettlementInfo] = useState(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [noteModal, setNoteModal] = useState(null);

  useEffect(() => {
    postSalesApi.getDisbursementTasks(row.unitId).then(setTasks).catch(() => setTasks([]));
  }, [row.unitId]);

  const openTasks = tasks.filter((t) => t.status === 'open' || t.status === 'delayed');

  const pendingToday = row.pendingAsOfToday ?? 0;
  const gstPendingDisplay = row.gstPending ?? 0;

  const forecastRows = useMemo(
    () => milestones.filter((m) => Number(m.installment.amount) > 0 || Number(m.clpPendingAmount) > 0),
    [milestones],
  );

  const updateMilestone = (mi, field, value) => {
    setMilestones((prev) => prev.map((m, idx) => (
      idx === mi ? { ...m, installment: { ...m.installment, [field]: value } } : m
    )));
  };

  const syncGstPending = (due, received) => {
    const d = Number(due);
    const r = Number(received);
    if (Number.isFinite(d) && Number.isFinite(r)) setGstPending(Math.max(0, d - r));
  };

  const handleCompleteTask = async (taskId) => {
    setBusy(true);
    try {
      await postSalesApi.completeDisbursementTask(taskId);
      setTasks(await postSalesApi.getDisbursementTasks(row.unitId));
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
      setTasks(await postSalesApi.getDisbursementTasks(row.unitId));
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
          installments: (Number(m.installment.amount) > 0 && m.installment.expectedDate)
            ? [{
              _id: m.installment._id,
              amount: Number(m.installment.amount),
              expectedDate: m.installment.expectedDate,
              includesTax: m.installment.includesTax,
              taxAmount: Number(m.installment.taxAmount) || 0,
              riskCategory: m.installment.riskCategory,
              note: m.installment.note,
              receivedAmount: Number(m.installment.receivedAmount) || 0,
              status: m.installment.status || 'planned',
              revisedDate: m.installment.revisedDate || undefined,
            }]
            : [],
        })),
      });
      if (result?.settlementSummary) setSettlementInfo(result.settlementSummary);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ps-reports-forecast-panel ps-reports-forecast-simple">
      <p className="ps-reports-forecast-lead">
        Due / received amounts come from <Link to="/app/post-sales/demands">Demands</Link> (CRM import).
        Use this panel only to set <strong>when</strong> pending balances are expected and CX follow-up.
      </p>

      <div className="ps-reports-snapshot">
        <span className="ps-chip">Pending today: {fmt(pendingToday)}</span>
        <span className="ps-chip">GST pending: {fmt(gstPendingDisplay)}</span>
        <span className="ps-chip">{row.overallCollectionPct ?? 0}% collected</span>
        <Link to={`/app/post-sales/demands?project=${encodeURIComponent(row.project || '')}`} className="ps-chip ps-chip-link">
          View collections →
        </Link>
      </div>

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
          <button type="button" className="ps-reports-remarks-edit-btn" onClick={() => setRemarksOpen(true)}>
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
        title={noteModal ? `Note — ${formatMilestoneLabel(noteModal.milestoneName)}` : 'Note'}
        value={noteModal?.value ?? ''}
        onChange={(v) => {
          if (noteModal == null) return;
          updateMilestone(noteModal.mi, 'note', v);
          setNoteModal((prev) => (prev ? { ...prev, value: v } : prev));
        }}
        onClose={() => setNoteModal(null)}
        placeholder="Client commitment, bank status…"
      />

      {forecastRows.length === 0 ? (
        <div className="ps-reports-empty-forecast">
          No pending CLP balances — nothing to forecast. Amounts are up to date in Demands.
        </div>
      ) : (
        <div className="ps-reports-forecast-table-wrap">
          <div className="ps-reports-ms-title">Expected payments (pending milestones only)</div>
          <table className="ps-table ps-reports-forecast-table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th className="ps-num">Pending</th>
                <th className="ps-num">Expected ₹</th>
                <th>Expected date</th>
                <th>Risk</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, mi) => (
                <tr key={m.demandId || m.milestoneName}>
                  <td>
                    <strong>{formatMilestoneLabel(m.milestoneName)}</strong>
                    {m.scheduleAchievedDate && (
                      <div className="ps-reports-muted">CLP achieved · date from Milestones tab</div>
                    )}
                  </td>
                  <td className="ps-num">{fmt(m.clpPendingAmount)}</td>
                  <td className="ps-num">
                    <input
                      type="number"
                      className="ps-reports-forecast-input"
                      value={m.installment.amount}
                      onChange={(e) => updateMilestone(mi, 'amount', e.target.value)}
                      placeholder={m.clpPendingAmount || '0'}
                      title="Usually same as pending"
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="ps-reports-forecast-input"
                      value={m.installment.expectedDate}
                      readOnly={!!m.installment.scheduleLinked}
                      onChange={(e) => updateMilestone(mi, 'expectedDate', e.target.value)}
                    />
                    {m.installment.scheduleLinked && (
                      <Link to="/app/post-sales/milestones" className="ps-reports-schedule-link">Milestones</Link>
                    )}
                  </td>
                  <td>
                    <select
                      className="ps-reports-forecast-input"
                      value={m.installment.riskCategory}
                      onChange={(e) => updateMilestone(mi, 'riskCategory', e.target.value)}
                    >
                      <option value="clear">Clear</option>
                      <option value="risky">Risky</option>
                      <option value="delayed">Delayed</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`ps-reports-note-btn ${m.installment.note ? 'has-note' : ''}`}
                      onClick={() => setNoteModal({ mi, milestoneName: m.milestoneName, value: m.installment.note || '' })}
                    >
                      Note{m.installment.note ? ' ✓' : ''}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openTasks.length > 0 && (
        <div className="ps-reports-tasks-block">
          <div className="ps-reports-ms-title">Open follow-up tasks</div>
          {openTasks.map((t) => (
            <div key={t._id} className="ps-reports-task-row">
              <span>{formatMilestoneLabel(t.milestoneName)} · {fmt(t.expectedAmount)} · {toInputDate(t.expectedDate)}</span>
              <button type="button" className="ps-btn ps-reports-mini-btn" disabled={busy} onClick={() => handleCompleteTask(t._id)}>Done</button>
              <button type="button" className="ps-btn ps-reports-mini-btn" disabled={busy} onClick={() => handleDelayTask(t._id)}>Delay</button>
            </div>
          ))}
        </div>
      )}

      <details className="ps-reports-advanced">
        <summary>Advanced — GST override &amp; booking settlement</summary>
        <div className="ps-reports-gst-block">
          <p className="ps-reports-muted">Override only when CRM GST column is wrong. Computed: Due {fmt(row.gstDueComputed)} · Recd {fmt(row.gstReceivedComputed)}</p>
          <div className="ps-reports-gst-row">
            <label>GST Due<input type="number" value={gstDue} onChange={(e) => { setGstDue(e.target.value); syncGstPending(e.target.value, gstReceived); }} /></label>
            <label>GST Received<input type="number" value={gstReceived} onChange={(e) => { setGstReceived(e.target.value); syncGstPending(gstDue, e.target.value); }} /></label>
            <label>GST Pending<input type="number" value={gstPending} onChange={(e) => setGstPending(e.target.value)} /></label>
          </div>
        </div>
        <div className="ps-reports-booking-block">
          <p className="ps-reports-muted">Rare: customer joined at an advanced CLP stage — settle historical milestones from one lump sum.</p>
          <div className="ps-reports-gst-row">
            <label>
              Disbursed at booking
              <input type="number" value={bookingDisbursed} onChange={(e) => setBookingDisbursed(e.target.value)} placeholder="₹ amount before onboarding" />
            </label>
            <label className="ps-reports-tax-chk" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
              <input type="checkbox" checked={applySettlement} onChange={(e) => setApplySettlement(e.target.checked)} />
              Apply FIFO on save
            </label>
          </div>
          {settlementInfo?.milestones?.length > 0 && (
            <div className="ps-reports-settlement-summary">
              <strong>Settlement applied:</strong>
              {settlementInfo.milestones.map((m) => (
                <span key={m.milestoneName} className="ps-reports-inst-chip">
                  {formatMilestoneLabel(m.milestoneName)}: {fmt(m.applied)} · pend {fmt(m.pending)}
                </span>
              ))}
            </div>
          )}
        </div>
      </details>

      <div className="ps-reports-meta-chips" style={{ marginTop: 10 }}>
        <Link to={`/app/post-sales/units/${row.unitId}`} className="ps-chip">Open pipeline →</Link>
      </div>

      {err && <div className="ps-error">{err}</div>}
      <div className="ps-reports-forecast-actions">
        <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save follow-up'}</button>
        <button type="button" className="ps-btn" onClick={onCancel}>Close</button>
      </div>
    </div>
  );
}
