import { Router } from 'express';
import Unit from '../../models/postsales/Unit.js';
import Customer from '../../models/postsales/Customer.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import Ticket from '../../models/postsales/Ticket.js';
import ConstructionMilestone from '../../models/postsales/ConstructionMilestone.js';
import { PHASES } from '../../lib/postsales/steps.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [units, steps, demands, tickets, milestones] = await Promise.all([
      Unit.find().populate('customerId').lean(),
      PipelineStep.find({ slaBreach: true }).lean(),
      Demand.find().lean(),
      Ticket.find({ status: { $nin: ['resolved', 'closed'] } }).lean(),
      ConstructionMilestone.find({ demandTriggerStatus: 'pending' }).lean(),
    ]);

    const totalUnits = units.length;
    const activeUnits = units.filter((u) => u.overallStatus === 'active').length;
    const slaBreaches = steps.length;

    const openTickets = tickets.length;
    const ackBreachCount = tickets.filter((t) => t.ackSlaBreach).length;
    const resBreachCount = tickets.filter((t) => t.resolutionSlaBreach).length;

    const totalDemanded = demands.reduce((s, d) => s + (d.totalAmount || 0), 0);
    const totalCollected = demands.reduce((s, d) => s + (d.paidAmount || 0), 0);
    const totalOutstanding = totalDemanded - totalCollected;
    const pendingDemandCount = demands.filter((d) => ['pending', 'partial', 'overdue'].includes(d.paymentStatus)).length;
    const pendingMilestoneCount = milestones.length;

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

    const possessionUnits = units.filter((u) => u.currentStepNumber >= 13 && u.currentStepNumber <= 20);
    const possessionReadiness = await Promise.all(
      possessionUnits.map(async (u) => {
        const uSteps = await PipelineStep.find({ unitId: u._id }).lean();
        const completed = uSteps.filter((s) => s.status === 'completed').length;
        return {
          unitId: u._id,
          unitNumber: u.unitNumber,
          project: u.project,
          pctComplete: Math.round((completed / 20) * 100),
        };
      })
    );

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
    const openTicketsList = tickets.slice(0, 20).map((t) => {
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

    const pendingMilestones = milestones.map((m) => ({
      milestoneId: m._id,
      project: m.project,
      tower: m.tower,
      milestoneName: m.milestoneName,
      completedDate: m.completedDate,
      clpPercent: m.clpPercent,
    }));

    res.json({
      totalUnits,
      activeUnits,
      slaBreaches,
      openTickets,
      ackBreachCount,
      resBreachCount,
      totalDemanded,
      totalCollected,
      totalOutstanding,
      pendingDemandCount,
      pendingMilestoneCount,
      byProject,
      byPhase,
      possessionReadiness,
      slaBreachUnits,
      openTicketsList,
      pendingMilestones,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
