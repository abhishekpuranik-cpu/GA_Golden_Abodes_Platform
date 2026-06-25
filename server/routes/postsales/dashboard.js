import { Router } from 'express';
import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import Ticket from '../../models/postsales/Ticket.js';
import DisbursementTask from '../../models/postsales/DisbursementTask.js';
import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import { PHASES } from '../../lib/postsales/steps.js';
import { computeUnitCumulative } from '../../lib/postsales/demandAmounts.js';
import { buildCollectionRegisterRow, buildDisbursementForecast, classifyInstallment } from '../../lib/postsales/collectionReports.js';

const router = Router();

function buildUnitFilter(query) {
  const filter = { overallStatus: { $ne: 'cancelled' } };
  if (query.project) filter.project = query.project;
  if (query.phase) filter.phase = query.phase;
  if (query.building) {
    filter.$and = [...(filter.$and || []), { $or: [{ building: query.building }, { tower: query.building }] }];
  }
  return filter;
}

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

router.get('/', async (req, res) => {
  try {
    const unitFilter = buildUnitFilter(req.query);
    const units = await Unit.find(unitFilter).populate('customerId').lean();
    const unitIds = units.map((u) => u._id);

    const [steps, demands, tickets, forecasts, disbTasks] = await Promise.all([
      PipelineStep.find({ unitId: { $in: unitIds }, slaBreach: true }).lean(),
      Demand.find({ unitId: { $in: unitIds } }).lean(),
      Ticket.find({ unitId: { $in: unitIds }, status: { $nin: ['resolved', 'closed'] } }).lean(),
      CollectionForecast.find({ unitId: { $in: unitIds } }).lean(),
      DisbursementTask.find({ unitId: { $in: unitIds }, status: { $in: ['open', 'delayed'] } }).lean(),
    ]);

    const demandsByUnit = new Map();
    for (const d of demands) {
      const k = String(d.unitId);
      if (!demandsByUnit.has(k)) demandsByUnit.set(k, []);
      demandsByUnit.get(k).push(d);
    }
    const forecastByUnit = new Map(forecasts.map((f) => [String(f.unitId), f]));

    const asOf = new Date();
    let agreementDue = 0;
    let agreementReceived = 0;
    let agreementPending = 0;
    let gstDue = 0;
    let gstReceived = 0;
    let gstPending = 0;
    const registerRows = [];

    for (const unit of units) {
      const unitDemands = demandsByUnit.get(String(unit._id)) || [];
      const totals = computeUnitCumulative(unitDemands, asOf);
      agreementDue += totals.agreementDue;
      agreementReceived += totals.agreementReceived;
      agreementPending += totals.agreementPending;
      gstDue += totals.gstDue;
      gstReceived += totals.gstReceived;
      gstPending += totals.gstPending;
      registerRows.push(buildCollectionRegisterRow(unit, unit.customerId, unitDemands, forecastByUnit.get(String(unit._id)), asOf));
    }

    const disbData = buildDisbursementForecast(registerRows, demandsByUnit, {}, asOf);
    const forecastBuckets = { clear: 0, risky: 0, delayed: 0 };
    for (const row of registerRows) {
      for (const m of row.milestones || []) {
        for (const inst of m.installments || []) {
          const pending = Math.max(0, num(inst.amount) - num(inst.receivedAmount));
          if (pending <= 0) continue;
          const cat = classifyInstallment(inst, asOf);
          if (forecastBuckets[cat] != null) forecastBuckets[cat] += pending;
        }
      }
    }

    const collectionByProject = {};
    for (const row of registerRows) {
      if (!collectionByProject[row.project]) {
        collectionByProject[row.project] = { project: row.project, units: 0, due: 0, received: 0, pending: 0, gstPending: 0 };
      }
      const p = collectionByProject[row.project];
      p.units += 1;
      p.due += row.totalDue;
      p.received += row.receivedAmount;
      p.pending += row.pendingAsOfToday;
      p.gstPending += row.gstPending;
    }

    const totalUnits = units.length;
    const activeUnits = units.filter((u) => u.overallStatus === 'active').length;
    const slaBreaches = steps.length;
    const openTickets = tickets.length;
    const ackBreachCount = tickets.filter((t) => t.ackSlaBreach).length;
    const resBreachCount = tickets.filter((t) => t.resolutionSlaBreach).length;
    const pendingDemandCount = demands.filter((d) => ['pending', 'partial', 'overdue'].includes(d.paymentStatus)).length;
    const openDisbursementTasks = disbTasks.length;
    const delayedDisbursementTasks = disbTasks.filter((t) => t.status === 'delayed').length;

    const collectPct = agreementDue ? Math.round((agreementReceived / agreementDue) * 100) : 0;
    const todayCollectPct = (agreementDue - agreementPending + agreementReceived) > 0
      ? Math.round((agreementReceived / (agreementReceived + agreementPending)) * 100)
      : collectPct;

    const projectCounts = {};
    for (const u of units) {
      projectCounts[u.project] = (projectCounts[u.project] || 0) + 1;
    }
    const byProject = Object.entries(projectCounts).map(([project, count]) => ({ project, count }));

    const phaseCounts = {};
    const activeUnitIds = units.filter((u) => u.overallStatus === 'active').map((u) => String(u._id));
    const allSteps = await PipelineStep.find({ unitId: { $in: activeUnitIds }, status: 'in_progress' }).lean();
    for (const s of allSteps) {
      phaseCounts[s.phase] = (phaseCounts[s.phase] || 0) + 1;
    }
    const byPhase = Object.entries(phaseCounts).map(([phase, count]) => ({
      phase,
      label: PHASES[phase]?.label || phase,
      color: PHASES[phase]?.color,
      count,
    }));

    const breachByUnit = {};
    for (const s of steps) {
      const key = String(s.unitId);
      if (!breachByUnit[key]) breachByUnit[key] = [];
      breachByUnit[key].push({ stepNumber: s.stepNumber, stepName: s.stepName, status: s.status });
    }

    const slaBreachUnits = [];
    for (const [unitId, breachedSteps] of Object.entries(breachByUnit)) {
      const u = units.find((x) => String(x._id) === unitId);
      if (!u) continue;
      slaBreachUnits.push({
        unitId: u._id,
        unitNumber: u.unitNumber,
        project: u.project,
        customerName: u.customerId?.name,
        breachedSteps,
      });
    }

    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));
    const openTicketsList = tickets.slice(0, 15).map((t) => {
      const u = unitMap[String(t.unitId)];
      return {
        ticketId: t._id,
        ticketNumber: t.ticketNumber,
        unitNumber: u?.unitNumber,
        project: u?.project,
        description: t.description,
        ackSlaBreach: t.ackSlaBreach,
        resolutionSlaBreach: t.resolutionSlaBreach,
      };
    });

    const highPriorityUnits = registerRows
      .filter((r) => r.cxPriority === 'high' || r.cxPriority === 'watch')
      .sort((a, b) => (b.pendingAsOfToday + b.gstPending) - (a.pendingAsOfToday + a.gstPending))
      .slice(0, 10)
      .map((r) => ({
        unitId: r.unitId,
        unitNumber: r.unitNumber,
        project: r.project,
        clientName: r.clientName,
        pending: r.pendingAsOfToday + r.gstPending,
        priority: r.cxPriority,
      }));

    const upcomingDisbursement = disbData.grandTotal?.totalPending || 0;
    const receivedInRange = disbData.grandTotal?.totalReceived || 0;

    res.json({
      totalUnits,
      activeUnits,
      slaBreaches,
      openTickets,
      ackBreachCount,
      resBreachCount,
      totalDemanded: agreementDue,
      totalCollected: agreementReceived,
      totalOutstanding: agreementPending + gstPending,
      agreementPending,
      gstPending,
      pendingDemandCount,
      openDisbursementTasks,
      delayedDisbursementTasks,
      collectPct,
      todayCollectPct,
      forecastBuckets,
      upcomingDisbursement,
      receivedInRange,
      collectionByProject: Object.values(collectionByProject),
      byProject,
      byPhase,
      slaBreachUnits,
      openTicketsList,
      highPriorityUnits,
      cashflowHealth: {
        agreementDue,
        agreementReceived,
        agreementPending,
        gstDue,
        gstReceived,
        gstPending,
        totalOutstanding: agreementPending + gstPending,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
