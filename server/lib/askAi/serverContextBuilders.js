/**
 * Server-of-record Ask AI context builders (Phase 2).
 * Prefer these over client snapshots when available.
 */

import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringInterview from '../../models/hiring/Interview.js';
import HiringOffer from '../../models/hiring/Offer.js';
import { notDeletedFilter } from '../hiring/validate.js';

import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import Ticket from '../../models/postsales/Ticket.js';
import DisbursementTask from '../../models/postsales/DisbursementTask.js';
import { computeUnitCumulative } from '../postsales/demandAmounts.js';

import { buildDashboardConsolidated } from '../dmGovernance/dashboard.js';
import { buildNotificationFeed } from '../dmGovernance/notificationService.js';
import { loadPreconState, loadExecutionPayload } from '../dmGovernance/integrations/appStateReader.js';

function snip(s, n = 140) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export async function buildHiringServerContext() {
  const requisitions = await HiringRequisition.find(notDeletedFilter())
    .select('_id reqCode role status headcount location projectName entityTag department')
    .lean();
  const openReqs = requisitions.filter((r) => !['Closed', 'Cancelled', 'Hiring Fulfilled'].includes(r.status));
  const fulfilledReqs = requisitions.filter((r) => r.status === 'Hiring Fulfilled');
  const candidates = await HiringCandidate.find(notDeletedFilter()).select('currentStageNumber requisitionId').lean();
  const activeCandidates = candidates.filter((c) => c.currentStageNumber >= 1 && c.currentStageNumber <= 7).length;
  const upcomingInterviews = await HiringInterview.countDocuments({
    ...notDeletedFilter(),
    scheduledAt: { $gte: new Date() },
    outcome: 'Pending',
  });
  const offers = await HiringOffer.find(notDeletedFilter()).select('status').lean();
  const offersAccepted = offers.filter((o) => o.status === 'Accepted').length;
  const byStatus = {};
  const hotItems = [];
  for (const r of openReqs) {
    const st = String(r.status || 'unknown');
    byStatus[st] = (byStatus[st] || 0) + 1;
    const candCount = candidates.filter((c) => String(c.requisitionId) === String(r._id)).length;
    hotItems.push({
      id: String(r._id),
      title: r.role || r.reqCode || 'Requisition',
      status: st,
      detail: snip(
        [r.department, r.location, r.projectName, `HC ${r.headcount || 1}`, `candidates ${candCount}`]
          .filter(Boolean)
          .join(' · '),
      ),
      risk: candCount === 0 ? 9 : /hold|draft|sourcing/i.test(st) ? 8 : 4,
      href: `/app/hiring/req/${r._id}`,
    });
  }
  hotItems.sort((a, b) => (b.risk || 0) - (a.risk || 0));
  const totalHeadcount = requisitions.reduce((s, r) => s + (r.headcount || 1), 0);
  const totalHired = candidates.filter((c) => c.currentStageNumber === 7).length;

  return {
    generatedAt: new Date().toISOString(),
    app: 'hiring',
    source: 'server',
    totals: {
      requisitions: requisitions.length,
      openRequisitions: openReqs.length,
      fulfilledRequisitions: fulfilledReqs.length,
      totalHeadcount,
      totalHired,
      fillRate: totalHeadcount ? Math.round((totalHired / totalHeadcount) * 1000) / 10 : 0,
      activeCandidates,
      upcomingInterviews,
      offersAccepted,
      offerConversionRate: offers.length
        ? Math.round((offersAccepted / offers.length) * 1000) / 10
        : 0,
      byStatus,
    },
    hotItems: hotItems.slice(0, 30),
  };
}

export async function buildPostSalesServerContext() {
  const units = await Unit.find({ overallStatus: { $ne: 'cancelled' } }).lean();
  const unitIds = units.map((u) => u._id);
  const [steps, demands, tickets, disbTasks] = await Promise.all([
    PipelineStep.find({ unitId: { $in: unitIds }, slaBreach: true }).lean(),
    Demand.find({ unitId: { $in: unitIds } }).lean(),
    Ticket.find({ unitId: { $in: unitIds }, status: { $nin: ['resolved', 'closed'] } }).lean(),
    DisbursementTask.find({ unitId: { $in: unitIds }, status: { $in: ['open', 'delayed'] } }).lean(),
  ]);

  const demandsByUnit = new Map();
  for (const d of demands) {
    const k = String(d.unitId);
    if (!demandsByUnit.has(k)) demandsByUnit.set(k, []);
    demandsByUnit.get(k).push(d);
  }

  let agreementDue = 0;
  let agreementReceived = 0;
  let agreementPending = 0;
  let gstPending = 0;
  for (const unit of units) {
    const cum = computeUnitCumulative(demandsByUnit.get(String(unit._id)) || [], new Date());
    agreementDue += num(cum.agreementDue);
    agreementReceived += num(cum.agreementReceived);
    agreementPending += num(cum.agreementPending);
    gstPending += num(cum.gstPending);
  }

  const unitById = new Map(units.map((u) => [String(u._id), u]));
  const hotItems = [];
  for (const s of steps.slice(0, 25)) {
    const u = unitById.get(String(s.unitId));
    hotItems.push({
      id: String(s.unitId),
      title: u?.unitNo || u?.unit || 'Unit',
      detail: snip(`SLA breach · ${s.stepName || s.name || s.stepNumber || ''} · ${u?.project || ''}`),
      status: 'sla_breach',
      risk: 10,
      href: u?._id ? `/app/post-sales/units/${u._id}` : '/app/post-sales',
    });
  }
  for (const t of tickets.slice(0, 15)) {
    const u = unitById.get(String(t.unitId));
    hotItems.push({
      id: String(t._id),
      title: t.subject || t.title || t.ticketNo || 'Ticket',
      detail: snip(`${t.status || ''} · ${u?.unitNo || ''} · ${t.priority || ''}`),
      status: 'ticket',
      risk: /high|urgent/i.test(String(t.priority || '')) ? 9 : 6,
    });
  }

  const delayedDisb = disbTasks.filter((d) => d.status === 'delayed').length;
  const outstanding = agreementPending + gstPending;
  const collectPct = agreementDue > 0 ? Math.round((agreementReceived / agreementDue) * 1000) / 10 : 0;

  return {
    generatedAt: new Date().toISOString(),
    app: 'post_sales',
    source: 'server',
    totals: {
      totalUnits: units.length,
      activeUnits: units.filter((u) => /active|progress/i.test(String(u.overallStatus || ''))).length || units.length,
      slaBreaches: steps.length,
      openTickets: tickets.length,
      totalDemanded: agreementDue,
      totalCollected: agreementReceived,
      totalOutstanding: outstanding,
      agreementPending,
      gstPending,
      openDisbursementTasks: disbTasks.length,
      delayedDisbursementTasks: delayedDisb,
      collectPct,
    },
    cashflowHealth: {
      agreementDue,
      agreementReceived,
      agreementPending,
      gstPending,
      totalOutstanding: outstanding,
    },
    hotItems: hotItems.slice(0, 35),
  };
}

export async function buildDmServerContext(db, user) {
  const [dash, feed] = await Promise.all([
    buildDashboardConsolidated(db, user).catch(() => null),
    buildNotificationFeed(db, user).catch(() => null),
  ]);
  const summary = dash?.summary || {};
  const alerts = Array.isArray(feed) ? feed : feed?.items || feed?.alerts || [];
  const hotItems = [];

  for (const p of dash?.projectCards || []) {
    if (p.riskStatus === 'red' || p.riskStatus === 'amber' || p.dmFeeOutstanding > 0 || !p.billingModelType) {
      hotItems.push({
        title: p.name || p.projectCode || p.projectId,
        detail: snip(
          `risk ${p.riskStatus} · outstanding ₹${Math.round(p.dmFeeOutstanding || 0)} · billed ₹${Math.round(p.dmFeeBilled || 0)} · cap util ${p.capUtilPct || 0}%`,
        ),
        status: p.riskStatus || 'project',
        risk: p.riskStatus === 'red' ? 10 : p.riskStatus === 'amber' ? 7 : 5,
        projectId: p.projectId,
      });
    }
  }
  for (const a of alerts.slice(0, 15)) {
    hotItems.push({
      title: a.title || a.name || a.code || 'Alert',
      detail: snip(a.message || a.detail || a.body || a.status || ''),
      status: a.severity || a.status || 'alert',
      risk: /crit|high|red/i.test(String(a.severity || a.status || '')) ? 10 : 6,
    });
  }
  hotItems.sort((a, b) => (b.risk || 0) - (a.risk || 0));

  return {
    generatedAt: new Date().toISOString(),
    app: 'dm_spv_governance',
    source: 'server',
    totals: {
      activeSpvs: summary.activeSpvs || 0,
      activeProjects: summary.activeProjects || 0,
      totalTopline: summary.totalTopline || 0,
      totalCollections: summary.totalCollections || 0,
      dmFeeBilledTtd: summary.dmFeeBilledTtd || 0,
      dmFeePaidTtd: summary.dmFeePaidTtd || 0,
      dmFeeAccrued: summary.dmFeeAccrued || 0,
      balanceDmEligible: summary.balanceDmEligible || 0,
      exceptionsPending: summary.exceptionsPending || 0,
      delayedPayments: summary.delayedPayments || 0,
      pendingApprovals: summary.pendingApprovals || 0,
      alerts: alerts.length,
    },
    hotItems: hotItems.slice(0, 35),
    projectCards: (dash?.projectCards || []).slice(0, 20),
  };
}

function scorePreconTask(task, today) {
  let score = 0;
  const st = String(task.status || '').toLowerCase();
  if (st === 'overdue' || st === 'blocked') score += 40;
  if (st === 'paused') score += 20;
  if (!task.who) score += 8;
  if (task.end && task.end < today && st !== 'completed' && st !== 'done') score += 30;
  return score;
}

export async function buildPreconServerContext(db) {
  const state = await loadPreconState(db);
  const projects = state?.projects || [];
  const today = new Date().toISOString().slice(0, 10);
  const totals = {
    projects: projects.length,
    tasks: 0,
    completed: 0,
    inprogress: 0,
    overdue: 0,
    paused: 0,
    notstarted: 0,
    unassigned: 0,
  };
  const hotTasks = [];
  const workload = new Map();

  for (const proj of projects) {
    for (const ph of proj.phases || []) {
      for (const t of ph.tasks || []) {
        const st = String(t.status || 'notstarted').toLowerCase();
        totals.tasks += 1;
        if (st === 'completed' || st === 'done') totals.completed += 1;
        else if (st === 'inprogress' || st === 'in_progress') totals.inprogress += 1;
        else if (st === 'overdue') totals.overdue += 1;
        else if (st === 'paused' || st === 'blocked') totals.paused += 1;
        else totals.notstarted += 1;
        if (!t.who && st !== 'completed' && st !== 'done') totals.unassigned += 1;

        const risk = scorePreconTask(t, today);
        if (risk >= 20 && st !== 'completed' && st !== 'done') {
          hotTasks.push({
            task: t.name || t.title || t.id,
            taskId: t.id,
            project: proj.name,
            projectId: proj.id,
            phase: ph.name || ph.id,
            phaseId: ph.id,
            status: t.status,
            who: t.who || '',
            risk,
            title: t.name || t.title || t.id,
            detail: snip(`${proj.name} · ${ph.name || ''} · ${t.status}${t.who ? ` · ${t.who}` : ' · unassigned'}`),
          });
        }
        if (t.who) {
          const w = workload.get(t.who) || { who: t.who, open: 0, overdue: 0, inprogress: 0 };
          if (st !== 'completed' && st !== 'done') w.open += 1;
          if (st === 'overdue') w.overdue += 1;
          if (st === 'inprogress' || st === 'in_progress') w.inprogress += 1;
          workload.set(t.who, w);
        }
      }
    }
  }

  hotTasks.sort((a, b) => b.risk - a.risk);
  const wl = [...workload.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  return {
    generatedAt: new Date().toISOString(),
    today,
    app: 'preconstruction',
    source: 'server',
    scope: 'portfolio',
    projectCount: projects.length,
    totals,
    hotTasks: hotTasks.slice(0, 40),
    hotItems: hotTasks.slice(0, 40),
    workload: wl.slice(0, 20),
    projects: projects.slice(0, 30).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      title: p.name,
      detail: snip(`${(p.phases || []).length} phases`),
    })),
  };
}

export async function buildExecutionServerContext() {
  const payload = await loadExecutionPayload();
  if (!payload || typeof payload !== 'object') return null;
  const all = payload.all || payload.portfolio || payload;
  const exec = all.executive || all.exec || {};
  const op = all.operational || {};
  const hotItems = [];
  const lists = [].concat(op.issues || [], op.blockers || [], exec.issueList || [], all.risks || []);
  for (const it of lists.slice(0, 25)) {
    if (!it) continue;
    if (typeof it === 'string') hotItems.push({ title: it, risk: 6 });
    else {
      hotItems.push({
        title: it.title || it.name || it.code || it.id || 'Item',
        detail: snip([it.status, it.detail, it.message, it.owner].filter(Boolean).join(' · ')),
        status: it.status || '',
        risk: Number(it.risk || 6),
      });
    }
  }
  const totals = {
    spi: exec.spi ?? op.spi_op ?? null,
    cpi: exec.cpi ?? op.cpi_op ?? null,
    issues: exec.issues ?? hotItems.length,
  };
  for (const [k, v] of Object.entries({ ...exec, ...op })) {
    if (typeof v === 'number' && totals[k] == null) totals[k] = v;
  }
  return {
    generatedAt: new Date().toISOString(),
    app: 'execution',
    source: 'server',
    totals,
    hotItems: hotItems.slice(0, 30),
    executive: exec,
    operational: op,
  };
}

/**
 * Build server context for an appId when possible.
 * @returns {Promise<object|null>}
 */
export async function buildServerAskContext(db, appId, user) {
  const id = String(appId || '');
  try {
    if (id === 'hiring') return await buildHiringServerContext();
    if (id === 'post_sales') return await buildPostSalesServerContext();
    if (id === 'dm_spv_governance') return await buildDmServerContext(db, user);
    if (id === 'preconstruction') return await buildPreconServerContext(db);
    if (id === 'execution') return await buildExecutionServerContext();
  } catch (e) {
    return {
      generatedAt: new Date().toISOString(),
      app: id,
      source: 'server_error',
      totals: {},
      hotItems: [],
      serverError: e?.message || String(e),
    };
  }
  return null;
}
