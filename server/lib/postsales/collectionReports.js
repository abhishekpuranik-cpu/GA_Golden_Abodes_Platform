import {
  computeUnitCumulative,
  isGstDemand,
  isPostStageDemand,
  milestoneDueAsOfToday,
  agreementDueOnRow,
  readGstDue,
  readGstReceived,
} from './demandAmounts.js';
import { sortDemandsByClpChronology } from './clpMilestoneOrder.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { achievedDateForMilestone } from './clpScheduleSync.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function weekLabel(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const month = d.toLocaleString('en-IN', { month: 'short' });
  const weekOfMonth = Math.ceil(d.getDate() / 7);
  return `${month} Week ${weekOfMonth}`;
}

export function weekKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  const w = Math.ceil(d.getDate() / 7);
  return `${y}-${m}-W${w}`;
}

export function dateKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function classifyInstallment(inst, asOf = new Date()) {
  if (inst.riskCategory === 'risky') return 'risky';
  const pending = Math.max(0, num(inst.amount) - num(inst.receivedAmount));
  if (pending <= 0) return 'clear';
  const expected = startOfDay(inst.expectedDate);
  const today = startOfDay(asOf);
  if (expected.getTime() < today.getTime()) return 'delayed';
  return 'clear';
}

function slug(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function milestoneMatchKey(m) {
  return `${String(m.demandId || '')}|${slug(m.milestoneName || '')}`;
}

function findDemandForMilestone(demands, milestoneName, demandId) {
  if (demandId) {
    const hit = demands.find((d) => String(d._id) === String(demandId));
    if (hit) return hit;
  }
  const s = slug(milestoneName);
  return demands.find((d) => slug(d.milestoneName) === s || slug(d.milestoneName).includes(s) || s.includes(slug(d.milestoneName)));
}

function mapInstallments(list = []) {
  return (list || []).map((i) => ({
    _id: i._id,
    amount: num(i.amount),
    expectedDate: i.expectedDate,
    includesTax: !!i.includesTax,
    taxAmount: num(i.taxAmount),
    riskCategory: i.riskCategory || 'clear',
    note: i.note || '',
    receivedAmount: num(i.receivedAmount),
    status: i.status || 'planned',
    revisedDate: i.revisedDate,
    scheduleLinked: !!i.scheduleLinked,
  }));
}

function applyScheduleToInstallments(installments, scheduleDate, clpPending) {
  if (!scheduleDate) return installments;
  const base = {
    amount: clpPending,
    expectedDate: scheduleDate,
    includesTax: false,
    taxAmount: 0,
    riskCategory: 'clear',
    note: '',
    receivedAmount: 0,
    status: 'planned',
    scheduleLinked: true,
  };
  if (!installments?.length) {
    return clpPending > 0 ? [base] : [];
  }
  return installments.map((inst, idx) => (
    idx === 0
      ? { ...inst, expectedDate: scheduleDate, scheduleLinked: true }
      : inst
  ));
}

function defaultMilestonesFromSchedule(scheduleRows = [], unit = {}, demands = [], scheduleAchievedMap = null) {
  const demandBySlug = new Map();
  for (const d of demands) {
    if (isPostStageDemand(d) && !isGstDemand(d)) continue;
    demandBySlug.set(slug(d.milestoneName), d);
  }

  return [...scheduleRows]
    .filter((r) => r.milestone && !/^gst$/i.test(String(r.milestone).trim()))
    .sort((a, b) => (a.scheduleOrder ?? 0) - (b.scheduleOrder ?? 0))
    .map((row) => {
      const name = formatMilestoneLabel(row.milestone);
      const demand = demandBySlug.get(slug(name)) || demandBySlug.get(slug(row.milestone));
      const scheduleDate = achievedDateForMilestone(scheduleAchievedMap, name)
        || (row.achievedDate ? new Date(row.achievedDate) : null);
      const clpDue = demand
        ? (isGstDemand(demand) ? readGstDue(demand) : agreementDueOnRow(demand))
        : Math.max(0, (unit.totalCost || 0) * ((row.percentDue || 0) / 100));
      const clpReceived = demand
        ? (isGstDemand(demand) ? readGstReceived(demand) : num(demand.paidAmount))
        : 0;
      const clpPending = Math.max(0, clpDue - clpReceived);
      const defaultDate = scheduleDate || demand?.targetDate || demand?.dueDate;
      const installments = clpPending > 0 && defaultDate
        ? applyScheduleToInstallments(
          [{ amount: clpPending, expectedDate: defaultDate, includesTax: false, taxAmount: 0, riskCategory: 'clear', receivedAmount: clpReceived, status: 'planned' }],
          scheduleDate,
          clpPending,
        )
        : [];
      return {
        demandId: demand?._id,
        milestoneName: name,
        clpDueAmount: clpDue,
        clpReceivedAmount: clpReceived,
        clpPendingAmount: clpPending,
        isGst: false,
        scheduleAchievedDate: scheduleDate || undefined,
        scheduleOrder: row.scheduleOrder,
        installments,
      };
    });
}

function buildRegisterMilestones(demands, scheduleRows, unit, scheduleAchievedMap) {
  if (scheduleRows?.length) {
    const fromSchedule = defaultMilestonesFromSchedule(scheduleRows, unit, demands, scheduleAchievedMap);
    const gst = defaultMilestonesFromDemands(demands, scheduleAchievedMap).filter((m) => m.isGst);
    return [...fromSchedule, ...gst];
  }
  return defaultMilestonesFromDemands(demands, scheduleAchievedMap);
}

function defaultMilestonesFromDemands(demands = [], scheduleAchievedMap = null) {
  const sorted = sortDemandsByClpChronology(demands);
  return sorted
    .filter((d) => !isPostStageDemand(d) || isGstDemand(d))
    .map((d) => {
      const name = isGstDemand(d) ? 'GST' : (d.milestoneName || d.milestoneNameRaw);
      const clpDue = isGstDemand(d) ? readGstDue(d) : agreementDueOnRow(d);
      const clpReceived = isGstDemand(d) ? readGstReceived(d) : num(d.paidAmount);
      const clpPending = Math.max(0, clpDue - clpReceived);
      const scheduleDate = achievedDateForMilestone(scheduleAchievedMap, name);
      const defaultDate = scheduleDate || d.targetDate || d.dueDate;
      const installments = clpPending > 0 && defaultDate
        ? applyScheduleToInstallments(
          [{ amount: clpPending, expectedDate: defaultDate, includesTax: isGstDemand(d), taxAmount: isGstDemand(d) ? clpPending : 0, riskCategory: 'clear', receivedAmount: 0, status: 'planned' }],
          scheduleDate,
          clpPending,
        )
        : [];
      return {
        demandId: d._id,
        milestoneName: name,
        clpDueAmount: clpDue,
        clpReceivedAmount: clpReceived,
        clpPendingAmount: clpPending,
        isGst: isGstDemand(d),
        scheduleAchievedDate: scheduleDate || undefined,
        installments,
      };
    });
}

function mergeForecastWithDemands(stored, demands, scheduleAchievedMap = null, scheduleRows = null, unit = {}) {
  const defaults = buildRegisterMilestones(demands, scheduleRows, unit, scheduleAchievedMap);
  const storedList = stored?.milestones || [];
  const storedByKey = new Map(storedList.map((m) => [milestoneMatchKey(m), m]));
  const usedStored = new Set();

  const merged = defaults.map((def) => {
    const key = milestoneMatchKey(def);
    let saved = storedByKey.get(key);
    if (!saved) {
      saved = storedList.find((s) => !usedStored.has(String(s._id)) && slug(s.milestoneName) === slug(def.milestoneName));
    }
    if (saved) usedStored.add(String(saved._id));

    const demand = findDemandForMilestone(demands, def.milestoneName, def.demandId);
    const clpDue = def.clpDueAmount;
    const clpReceived = def.clpReceivedAmount;
    const clpPending = def.clpPendingAmount;
    const scheduleDate = def.scheduleAchievedDate || achievedDateForMilestone(scheduleAchievedMap, def.milestoneName);

    let installments = saved?.installments?.length
      ? mapInstallments(saved.installments)
      : def.installments;
    if (scheduleDate) {
      installments = applyScheduleToInstallments(installments, scheduleDate, clpPending);
    }

    return {
      demandId: def.demandId,
      milestoneName: def.milestoneName,
      clpDueAmount: clpDue,
      clpReceivedAmount: clpReceived,
      clpPendingAmount: clpPending,
      isGst: def.isGst,
      scheduleAchievedDate: scheduleDate || undefined,
      installments,
    };
  });

  for (const saved of storedList) {
    if (usedStored.has(String(saved._id))) continue;
    const demand = findDemandForMilestone(demands, saved.milestoneName, saved.demandId);
    const clpDue = demand ? (isGstDemand(demand) ? readGstDue(demand) : agreementDueOnRow(demand)) : 0;
    const clpReceived = demand ? (isGstDemand(demand) ? readGstReceived(demand) : num(demand.paidAmount)) : 0;
    merged.push({
      demandId: saved.demandId || demand?._id,
      milestoneName: saved.milestoneName,
      clpDueAmount: clpDue,
      clpReceivedAmount: clpReceived,
      clpPendingAmount: Math.max(0, clpDue - clpReceived),
      isGst: demand ? isGstDemand(demand) : /^gst$/i.test(saved.milestoneName),
      installments: mapInstallments(saved.installments),
    });
  }

  return sortDemandsByClpChronology(merged.map((m) => ({ ...m, milestoneNameRaw: m.milestoneName })))
    .map(({ milestoneNameRaw, ...rest }) => rest);
}

export function buildCollectionRegisterRow(unit, customer, demands, forecast, asOf = new Date(), scheduleAchievedMap = null, scheduleRows = null) {
  const totals = computeUnitCumulative(demands, asOf);
  const milestones = mergeForecastWithDemands(forecast, demands, scheduleAchievedMap, scheduleRows, unit);

  const gstDue = Number.isFinite(Number(forecast?.gstDueOverride))
    ? Number(forecast.gstDueOverride)
    : totals.gstDue;
  const gstReceived = Number.isFinite(Number(forecast?.gstReceivedOverride))
    ? Number(forecast.gstReceivedOverride)
    : totals.gstReceived;
  const gstPending = Number.isFinite(Number(forecast?.gstPendingOverride))
    ? Number(forecast.gstPendingOverride)
    : Math.max(0, gstDue - gstReceived);

  let nextExpectedDate = null;
  let nextExpectedAmount = 0;
  for (const m of milestones) {
    for (const inst of m.installments || []) {
      const pending = Math.max(0, num(inst.amount) - num(inst.receivedAmount));
      if (pending <= 0) continue;
      const dt = new Date(inst.expectedDate);
      if (!nextExpectedDate || dt < nextExpectedDate) {
        nextExpectedDate = dt;
        nextExpectedAmount = pending;
      }
    }
  }

  const lastPaidDates = demands
    .map((d) => d.paidDate)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a);

  const clpPending = demands
    .filter((d) => !isPostStageDemand(d) && milestoneDueAsOfToday(d, asOf))
    .reduce((s, d) => s + Math.max(0, agreementDueOnRow(d) - num(d.paidAmount)), 0);

  return {
    unitId: unit._id,
    unitNumber: unit.unitNumber,
    project: unit.project,
    phase: unit.phase,
    building: unit.building || unit.tower,
    entity: unit.entity,
    clientName: customer?.name || '—',
    coApplicants: customer?.coApplicant?.name || '',
    bookingDate: unit.bookingDate,
    agreementDate: unit.agreementDate,
    saleableArea: unit.saleableArea,
    carpetArea: unit.carpetArea,
    agreementValue: unit.totalCost,
    paymentPlan: unit.paymentPlan,
    fundingType: customer?.fundingType,
    cxExecutive: unit.cxExecutive || unit.crmExecutive,
    backendExecutive: unit.backendExecutive,
    totalDue: totals.agreementDue,
    receivedAmount: totals.agreementReceived,
    pendingAsOfToday: totals.agreementPending,
    gstDue,
    gstReceived,
    gstPending,
    gstDueComputed: totals.gstDue,
    gstReceivedComputed: totals.gstReceived,
    totalOutstanding: totals.agreementPending + gstPending,
    collectionRemarks: forecast?.collectionRemarks || '',
    cxPriority: forecast?.cxPriority || 'normal',
    followUpOwner: forecast?.followUpOwner || unit.cxExecutive || '',
    bookingDisbursedAmount: num(forecast?.bookingDisbursedAmount),
    bookingSettlementAppliedAt: forecast?.bookingSettlementAppliedAt,
    milestones,
    nextExpectedDate,
    nextExpectedAmount,
    lastPaymentDate: lastPaidDates[0] || null,
    clpPending,
    overallCollectionPct: totals.agreementDue
      ? Math.round((totals.agreementReceived / totals.agreementDue) * 100)
      : 0,
  };
}

function emptyBucket() {
  return { clear: 0, risky: 0, delayed: 0, totalPending: 0, totalReceived: 0, clients: [] };
}

function addClient(bucket, row) {
  bucket.clients.push(row);
  if (row.category === 'clear') bucket.clear += row.amount;
  else if (row.category === 'risky') bucket.risky += row.amount;
  else if (row.category === 'delayed') bucket.delayed += row.amount;
  bucket.totalPending += row.type === 'expected' ? row.amount : 0;
  if (row.type === 'received') bucket.totalReceived += row.amount;
}

export function buildDisbursementForecast(registerRows, demandsByUnit, { from, to, categoryFilter } = {}, asOf = new Date()) {
  const fromDt = from ? startOfDay(from) : startOfDay(new Date(asOf.getFullYear(), asOf.getMonth(), 1));
  const toDt = to ? startOfDay(to) : startOfDay(new Date(asOf.getFullYear(), asOf.getMonth() + 3, 0));

  const weeksMap = new Map();

  const ensureWeek = (wk) => {
    if (!weeksMap.has(wk)) {
      weeksMap.set(wk, { key: wk, label: '', dates: new Map(), ...emptyBucket() });
    }
    return weeksMap.get(wk);
  };

  const ensureDate = (week, dk) => {
    if (!week.dates.has(dk)) week.dates.set(dk, { date: dk, ...emptyBucket() });
    return week.dates.get(dk);
  };

  for (const row of registerRows) {
    for (const m of row.milestones || []) {
      for (const inst of m.installments || []) {
        const pending = Math.max(0, num(inst.amount) - num(inst.receivedAmount));
        if (pending <= 0) continue;
        const expected = new Date(inst.expectedDate);
        if (Number.isNaN(expected.getTime())) continue;
        if (expected < fromDt || expected > toDt) continue;

        const category = classifyInstallment(inst, asOf);
        if (categoryFilter && categoryFilter !== category) continue;

        const wk = weekKey(expected);
        const week = ensureWeek(wk);
        week.label = weekLabel(expected);
        const dk = dateKey(expected);
        const dateBucket = ensureDate(week, dk);

        const clientRow = {
          type: 'expected',
          unitId: row.unitId,
          unitNumber: row.unitNumber,
          clientName: row.clientName,
          project: row.project,
          milestoneName: formatMilestoneLabel(m.milestoneName),
          amount: pending,
          category,
          includesTax: !!inst.includesTax,
          taxAmount: num(inst.taxAmount),
          note: inst.note || '',
        };
        addClient(dateBucket, clientRow);
        addClient(week, clientRow);
      }
    }

    const demands = demandsByUnit.get(String(row.unitId)) || [];
    for (const d of demands) {
      const paid = num(d.paidAmount);
      if (paid <= 0) continue;
      const paidOn = d.paidDate || d.actualDate || d.updatedAt;
      if (!paidOn) continue;
      const pd = startOfDay(new Date(paidOn));
      if (pd < fromDt || pd > toDt) continue;

      const wk = weekKey(pd);
      const week = ensureWeek(wk);
      week.label = weekLabel(pd);
      const dk = dateKey(pd);
      const dateBucket = ensureDate(week, dk);

      const clientRow = {
        type: 'received',
        unitId: row.unitId,
        unitNumber: row.unitNumber,
        clientName: row.clientName,
        project: row.project,
        milestoneName: formatMilestoneLabel(d.milestoneName),
        amount: paid,
        category: 'received',
      };
      addClient(dateBucket, clientRow);
      addClient(week, clientRow);
    }
  }

  const weeks = [...weeksMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((w) => {
      const dates = [...w.dates.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          ...d,
          totalPending: d.clear + d.risky + d.delayed,
          clients: d.clients.sort((a, b) => a.clientName.localeCompare(b.clientName)),
        }));
      return {
        key: w.key,
        label: w.label || dates[0]?.date || w.key,
        clear: w.clear,
        risky: w.risky,
        delayed: w.delayed,
        totalPending: w.clear + w.risky + w.delayed,
        totalReceived: w.totalReceived,
        dates,
      };
    });

  const grandTotal = weeks.reduce(
    (acc, w) => ({
      clear: acc.clear + w.clear,
      risky: acc.risky + w.risky,
      delayed: acc.delayed + w.delayed,
      totalPending: acc.totalPending + w.totalPending,
      totalReceived: acc.totalReceived + w.totalReceived,
    }),
    { clear: 0, risky: 0, delayed: 0, totalPending: 0, totalReceived: 0 },
  );

  return { weeks, grandTotal, range: { from: fromDt.toISOString().slice(0, 10), to: toDt.toISOString().slice(0, 10) } };
}
