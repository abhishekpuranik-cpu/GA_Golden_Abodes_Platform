import { useEffect, useMemo, useState } from 'react';
import { formatMilestoneLabel } from '../../lib/postsales/milestoneLabels.js';
import { isUnitSpecificClpMilestone, lookupUnitMilestoneDate } from '../../lib/postsales/clpCollectionPhase.js';
import { toIsoDateInput } from '../../lib/postsales/clpMilestoneOrder.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

/** Mark unit-specific CLP stages complete — one date per milestone, per unit. */
export default function UnitMilestoneTracker({ unitId, unitNumber, onUpdated }) {
  const [demands, setDemands] = useState([]);
  const [unitDates, setUnitDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!unitId) return;
    setLoading(true);
    Promise.all([
      postSalesApi.listDemands({ unitId }),
    ])
      .then(([demandRes]) => {
        setDemands(demandRes.demands || []);
        const ctx = demandRes.unitCollectionContext?.[unitId];
        setUnitDates(ctx?.unitMilestoneDates || {});
      })
      .catch(() => setDemands([]))
      .finally(() => setLoading(false));
  }, [unitId]);

  const rows = useMemo(() => demands
    .filter((d) => isUnitSpecificClpMilestone(d.milestoneNameRaw || d.milestoneName))
    .filter((d) => (Number(d.pendingAmount) || 0) > 0 || (Number(d.dueAmount) || 0) > (Number(d.receivedAmount) || 0))
    .map((d) => {
      const name = d.milestoneNameRaw || d.milestoneName;
      const achieved = lookupUnitMilestoneDate(unitDates, name) || d.actualDate;
      return {
        id: d._id,
        name,
        pending: Number(d.pendingAmount) || Math.max(0, (Number(d.dueAmount) || 0) - (Number(d.receivedAmount) || 0)),
        achievedDate: toIsoDateInput(achieved),
      };
    }), [demands, unitDates]);

  const saveDate = async (milestoneName, date) => {
    if (!date) return;
    setBusyKey(milestoneName);
    setMsg('');
    try {
      await postSalesApi.setUnitMilestoneAchieved(unitId, milestoneName, date);
      setUnitDates((prev) => ({ ...prev, [milestoneName]: date }));
      setMsg(`${formatMilestoneLabel(milestoneName)} marked complete — collection now due for this unit.`);
      onUpdated?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <div className="ps-empty" style={{ padding: '12px 0' }}>Loading unit milestones…</div>;

  return (
    <div className="ps-unit-ms-tracker">
      <div className="ps-unit-ms-tracker-head">
        <strong>Unit CLP collections</strong>
        <span className="ps-reports-muted">After top floor — internal works are per unit ({unitNumber})</span>
      </div>
      {rows.length === 0 ? (
        <p className="ps-reports-muted" style={{ margin: '8px 0 0' }}>
          No pending unit-specific milestones. Slab-stage collections follow the building schedule on the Milestones tab.
        </p>
      ) : (
        <table className="ps-table ps-unit-ms-table">
          <thead>
            <tr>
              <th>Milestone</th>
              <th className="ps-num">Pending</th>
              <th>Completed on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id || r.name}>
                <td>{formatMilestoneLabel(r.name)}</td>
                <td className="ps-num">{fmt(r.pending)}</td>
                <td>
                  <input
                    type="date"
                    className="ps-reports-forecast-input"
                    value={r.achievedDate}
                    disabled={busyKey === r.name}
                    onChange={(e) => saveDate(r.name, e.target.value)}
                    title="When this unit reached this stage"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {msg && <p className="ps-reports-muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
