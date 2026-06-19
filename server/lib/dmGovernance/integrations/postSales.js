/**
 * Post Sales rollup for Business Health Command Center.
 */
import { ensurePostSalesMongoose } from '../../postsales/mongoose.js';
import Unit from '../../../models/postsales/Unit.js';
import Demand from '../../../models/postsales/Demand.js';
import PipelineStep from '../../../models/postsales/PipelineStep.js';
import Ticket from '../../../models/postsales/Ticket.js';
import LoanTracker from '../../../models/postsales/LoanTracker.js';

function num(v) {
  return Number(v) || 0;
}

/**
 * @param {string} projectId DM project id (matches Unit.v1ProjectId)
 * @param {string} [projectName] fallback match on Unit.project
 */
export async function loadPostSalesProjectKpis(projectId, projectName) {
  await ensurePostSalesMongoose();
  const or = [{ v1ProjectId: projectId }];
  if (projectName) or.push({ project: projectName });

  const units = await Unit.find({ $or: or }).lean();
  if (!units.length) return null;

  const unitIds = units.map((u) => u._id);
  const [demands, openSteps, tickets, loans] = await Promise.all([
    Demand.find({ unitId: { $in: unitIds } }).lean(),
    PipelineStep.find({ unitId: { $in: unitIds }, status: { $ne: 'completed' }, dueDate: { $lt: new Date() } }).lean(),
    Ticket.find({ unitId: { $in: unitIds }, status: { $nin: ['resolved', 'closed'] } }).lean(),
    LoanTracker.find({ unitId: { $in: unitIds } }).lean()
  ]);

  const overdueDemands = demands.filter((d) => d.paymentStatus === 'overdue' || (d.dueDate && new Date(d.dueDate) < new Date() && d.paymentStatus !== 'paid'));
  const loanBlockers = loans.filter((l) => l.status && !['sanctioned', 'disbursed', 'closed'].includes(String(l.status).toLowerCase()));
  const activePipeline = units.filter((u) => u.overallStatus === 'active').length;

  const stepAges = openSteps.map((s) => {
    const due = s.dueDate ? new Date(s.dueDate).getTime() : NaN;
    return Number.isFinite(due) ? Math.floor((Date.now() - due) / (24 * 3600 * 1000)) : 0;
  });
  const avgStageAge = stepAges.length ? Math.round(stepAges.reduce((a, b) => a + b, 0) / stepAges.length) : 0;

  return {
    unitsInPipeline: activePipeline,
    totalUnits: units.length,
    overdueDemands: overdueDemands.length,
    openTickets: tickets.length,
    loanBlockers: loanBlockers.length,
    overdueSteps: openSteps.length,
    avgStageAgeDays: avgStageAge,
    collectionsOutstanding: demands.reduce((s, d) => s + Math.max(0, num(d.totalAmount) - num(d.paidAmount)), 0),
    syncedAt: new Date().toISOString()
  };
}
