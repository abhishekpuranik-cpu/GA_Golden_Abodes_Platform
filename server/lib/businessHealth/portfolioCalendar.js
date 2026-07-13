import { DM_COLLECTIONS } from '../dmGovernance/collections.js';
import { buildProjectFilter, projectInScope } from '../dmGovernance/access.js';
import { slugName } from '../dmGovernance/integrations/appStateReader.js';
import {
  loadFinanceKpiState,
  loadMarketingKpiState,
  loadPreconState,
  loadExecutionPayload
} from '../dmGovernance/integrations/appStateReader.js';
import { pullConstructionMilestones } from '../dmGovernance/integrations/constructionMilestones.js';
import { ensureMongo } from '../mongo.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import Unit from '../../models/postsales/Unit.js';
import HiringInterview from '../../models/hiring/Interview.js';
import { CALENDAR_SOURCE_DEFS, sourceDef } from './calendarRegistry.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

export function toYmd(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function deriveStatus(ymd, done = false) {
  if (!ymd) return 'upcoming';
  if (done) return 'done';
  const today = TODAY();
  if (ymd < today) return 'overdue';
  if (ymd === today) return 'today';
  return 'upcoming';
}

function inRange(ymd, from, to) {
  return ymd && ymd >= from && ymd <= to;
}

function makeEvent(fields) {
  const date = toYmd(fields.date);
  if (!date) return null;
  const def = sourceDef(fields.sourceApp);
  return {
    id: fields.id,
    sourceApp: fields.sourceApp,
    sourceLabel: def.label,
    sourceColor: def.color,
    pillar: fields.pillar || def.pillar,
    projectId: fields.projectId || null,
    projectName: fields.projectName || null,
    type: fields.type,
    title: fields.title,
    subtitle: fields.subtitle || '',
    date,
    status: fields.status || deriveStatus(date, fields.done),
    severity: fields.severity || 'medium',
    href: fields.href || null,
    meta: fields.meta || {}
  };
}

function matchDmProject(projects, nameOrId) {
  const slug = slugName(nameOrId);
  return (
    projects.find((p) => p._id === nameOrId) ||
    projects.find((p) => slugName(p.name) === slug) ||
    projects.find((p) => slugName(p.projectCode) === slug) ||
    null
  );
}

function addEvent(list, fields) {
  const ev = makeEvent(fields);
  if (ev) list.push(ev);
}

async function collectDmEvents(db, projects, from, to) {
  const events = [];
  const projectIds = projects.map((p) => p._id);

  const invoices = await db
    .collection(DM_COLLECTIONS.invoices)
    .find({
      projectId: { $in: projectIds },
      dueDate: { $exists: true },
      status: { $nin: ['PAID', 'REJECTED', 'DRAFT'] }
    })
    .toArray();

  invoices.forEach((inv) => {
    const ymd = toYmd(inv.dueDate);
    if (!inRange(ymd, from, to)) return;
    const project = projects.find((p) => p._id === inv.projectId);
    addEvent(events, {
      id: `dm_inv_${inv._id}`,
      sourceApp: 'dm_spv_governance',
      pillar: 'governance',
      projectId: inv.projectId,
      projectName: project?.name,
      type: 'invoice_due',
      title: `Invoice ${inv.invoiceNo || inv._id}`,
      subtitle: `${inv.periodMonth || ''} · ${inv.status || ''}`.trim(),
      date: ymd,
      severity: deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
      href: `/app/dm-governance/invoices/${inv._id}`,
      meta: { amount: inv.totalAmount, status: inv.status }
    });
  });

  for (const p of projects) {
    if (!p.activeBillingConfigId) continue;
    const config = await db.collection(DM_COLLECTIONS.billingConfigs).findOne({ _id: p.activeBillingConfigId });
    if (!config) continue;
    const dueDay = Number(config.paymentDueDays || p.paymentDueDays || 15) || 15;
    const start = toYmd(p.billingStartDate || config.effectiveFrom) || from;
    let cursor = new Date(`${start.slice(0, 7)}-01T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    while (cursor <= end) {
      const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const due = new Date(cursor.getFullYear(), cursor.getMonth() + 1, dueDay);
      const ymd = toYmd(due);
      if (inRange(ymd, from, to)) {
        addEvent(events, {
          id: `dm_bill_${p._id}_${ym}`,
          sourceApp: 'dm_spv_governance',
          pillar: 'financial',
          projectId: p._id,
          projectName: p.name,
          type: 'billing_cycle',
          title: `DM billing · ${p.name}`,
          subtitle: `Period ${ym}`,
          date: ymd,
          severity: 'low',
          href: `/app/dm-governance/billing-workspace/${p._id}`,
          meta: { periodMonth: ym }
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const dates = [
      ['launchDate', 'Launch'],
      ['reraDate', 'RERA'],
      ['constructionStartDate', 'Construction start'],
      ['expectedCompletionDate', 'Expected completion']
    ];
    dates.forEach(([field, label]) => {
      const ymd = toYmd(p[field]);
      if (!inRange(ymd, from, to)) return;
      addEvent(events, {
        id: `dm_proj_${p._id}_${field}`,
        sourceApp: 'dm_spv_governance',
        pillar: 'commercial',
        projectId: p._id,
        projectName: p.name,
        type: 'project_date',
        title: `${p.name} · ${label}`,
        subtitle: 'Project timeline',
        date: ymd,
        severity: 'low',
        href: `/app/dm-governance/projects/${p._id}`,
        meta: { field }
      });
    });
  }

  return events;
}

async function collectPostSalesEvents(projects, from, to) {
  await ensureMongo();
  const events = [];
  const units = await Unit.find({}, { _id: 1, unitNumber: 1, project: 1 }).lean();
  const unitMap = new Map(units.map((u) => [String(u._id), u]));

  const steps = await PipelineStep.find({
    status: { $nin: ['completed', 'cancelled'] },
    $or: [
      { dueDate: { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59`) } },
      { nextActionDate: { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59`) } }
    ]
  }).lean();

  steps.forEach((s) => {
    const u = unitMap.get(String(s.unitId));
    const dm = matchDmProject(projects, u?.project);
    const base = {
      sourceApp: 'post_sales',
      pillar: 'customer',
      projectId: dm?._id || null,
      projectName: dm?.name || u?.project || null,
      href: '/app/post-sales/my-tasks',
      meta: { unitNumber: u?.unitNumber, stepNumber: s.stepNumber }
    };
    const dueYmd = toYmd(s.dueDate);
    if (inRange(dueYmd, from, to)) {
      addEvent(events, {
        ...base,
        id: `ps_due_${s._id}`,
        type: 'task_due',
        title: `Step ${s.stepNumber} · ${u?.unitNumber || 'Unit'}`,
        subtitle: s.stepName || 'Pipeline task',
        date: dueYmd,
        severity: deriveStatus(dueYmd) === 'overdue' || s.slaBreach ? 'high' : 'medium'
      });
    }
    const naYmd = toYmd(s.nextActionDate);
    if (inRange(naYmd, from, to) && naYmd !== dueYmd) {
      addEvent(events, {
        ...base,
        id: `ps_na_${s._id}`,
        type: 'task_followup',
        title: `Follow-up · ${u?.unitNumber || 'Unit'}`,
        subtitle: s.nextAction || s.stepName || 'Next action',
        date: naYmd,
        severity: 'medium'
      });
    }
  });

  const demands = await Demand.find({
    paymentStatus: { $ne: 'paid' },
    $or: [
      { dueDate: { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59`) } },
      { targetDate: { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59`) } }
    ]
  }).lean();

  demands.forEach((d) => {
    const u = unitMap.get(String(d.unitId));
    const dm = matchDmProject(projects, u?.project);
    const ymd = toYmd(d.dueDate || d.targetDate);
    if (!inRange(ymd, from, to)) return;
    addEvent(events, {
      id: `ps_dem_${d._id}`,
      sourceApp: 'post_sales',
      pillar: 'commercial',
      projectId: dm?._id || null,
      projectName: dm?.name || u?.project || null,
      type: 'demand_due',
      title: `Demand · ${d.milestoneName || 'Milestone'}`,
      subtitle: `${u?.unitNumber || ''} · ${d.paymentStatus || 'due'}`.trim(),
      date: ymd,
      severity: deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
      href: '/app/post-sales/demands',
      meta: { unitNumber: u?.unitNumber, amount: d.amountDue }
    });
  });

  const clpTasks = await ClpLetterTask.find({
    status: { $ne: 'completed' },
    dueDate: { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59`) }
  }).lean();

  clpTasks.forEach((t) => {
    const u = unitMap.get(String(t.unitId));
    const dm = matchDmProject(projects, u?.project);
    const ymd = toYmd(t.dueDate);
    if (!inRange(ymd, from, to)) return;
    addEvent(events, {
      id: `ps_clp_${t._id}`,
      sourceApp: 'post_sales',
      pillar: 'customer',
      projectId: dm?._id || null,
      projectName: dm?.name || u?.project || null,
      type: 'clp_letter',
      title: `CLP letter · ${u?.unitNumber || 'Unit'}`,
      subtitle: t.milestoneName || t.stepName || 'Letter task',
      date: ymd,
      severity: deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
      href: '/app/post-sales/my-tasks',
      meta: { unitNumber: u?.unitNumber }
    });
  });

  return events;
}

async function collectCashflowMilestones(db, projects, from, to) {
  const events = [];

  for (const p of projects) {
    const snap = await pullConstructionMilestones(db, p._id);
    if (!snap.ok) continue;

    (snap.steps || []).forEach((step) => {
      if (step.done) return;
      const ymd = toYmd(step.targetIso);
      if (!inRange(ymd, from, to)) return;
      addEvent(events, {
        id: `cf_ms_${p._id}_${step.key}`,
        sourceApp: 'v1_cashflow',
        pillar: 'delivery',
        projectId: p._id,
        projectName: p.name,
        type: 'construction_milestone',
        title: step.label || step.key,
        subtitle: `${p.name} · ${step.cumDuePct || 0}% cumulative`,
        date: ymd,
        severity: deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
        href: '/legacy/GA_Cashflow_V1.html',
        meta: { key: step.key, pct: step.pct }
      });
    });
  }

  return events;
}

function collectPreconEvents(projects, precon, from, to) {
  const events = [];
  if (!precon?.projects?.length) return events;

  projects.forEach((dm) => {
    const match =
      precon.projects.find((p) => slugName(p.name) === slugName(dm.name)) ||
      precon.projects.find((p) => String(p.id) === dm._id);
    if (!match) return;

    (match.phases || []).forEach((ph) => {
      (ph.tasks || []).forEach((t, idx) => {
        const status = String(t.status || '').toLowerCase();
        if (status === 'complete' || status === 'done') return;
        const ymd = toYmd(t.ae || t.ms || t.deadline);
        if (!inRange(ymd, from, to)) return;
        addEvent(events, {
          id: `pc_${dm._id}_${ph.id || ph.name}_${idx}`,
          sourceApp: 'preconstruction',
          pillar: 'delivery',
          projectId: dm._id,
          projectName: dm.name,
          type: 'approval_task',
          title: t.name || t.title || 'PreCon task',
          subtitle: `${match.name} · ${ph.name || ph.id || 'Phase'}`,
          date: ymd,
          severity: deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
          href: '/preconstruction/',
          meta: { phase: ph.name || ph.id }
        });
      });
    });
  });

  return events;
}

function collectFinanceEvents(finState, from, to) {
  const events = [];
  const blob = finState?.blob;
  if (!blob) return events;

  (blob.compliance || []).forEach((c, i) => {
    if (c.actual) return;
    const ymd = toYmd(c.due);
    if (!inRange(ymd, from, to)) return;
    addEvent(events, {
      id: `fin_comp_${c.id || i}`,
      sourceApp: 'finance_kpi',
      pillar: 'governance',
      projectId: null,
      projectName: null,
      type: 'compliance_filing',
      title: c.obligation || 'Statutory filing',
      subtitle: `${c.authority || ''} · ${c.period || ''}`.trim(),
      date: ymd,
      severity: deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
      href: '/legacy/GA_Finance_KPI.html',
      meta: { authority: c.authority, period: c.period }
    });
  });

  (blob.raBills || []).forEach((b, i) => {
    if (b.paymentDate) return;
    const received = toYmd(b.received);
    if (!received) return;
    const implied = new Date(`${received}T12:00:00`);
    implied.setDate(implied.getDate() + 10);
    const ymd = toYmd(implied);
    if (!inRange(ymd, from, to)) return;
    addEvent(events, {
      id: `fin_ra_${b.ref || i}`,
      sourceApp: 'finance_kpi',
      pillar: 'financial',
      projectId: null,
      projectName: b.project || null,
      type: 'vendor_payment',
      title: `RA payment · ${b.contractor || b.ref || 'Vendor'}`,
      subtitle: b.project ? `Project ${b.project}` : 'Open RA bill',
      date: ymd,
      severity: deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
      href: '/legacy/GA_Finance_KPI.html',
      meta: { ref: b.ref, gross: b.gross }
    });
  });

  return events;
}

function collectMarketingEvents(mktState, from, to) {
  const events = [];
  const raw = mktState?.blob;
  if (!raw) return events;
  const leads = Array.isArray(raw.leads) ? raw.leads : [];

  let count = 0;
  const cap = 400;
  for (const L of leads) {
    if (count >= cap) break;
    const pairs = [
      ['lead_followup', L.nextCall, 'Follow-up call'],
      ['site_visit', L.tentativeVisit, 'Tentative visit']
    ];
    for (const [type, rawDate, label] of pairs) {
      const ymd = toYmd(rawDate);
      if (!inRange(ymd, from, to)) continue;
      addEvent(events, {
        id: `mkt_${type}_${L.phone || L.id || count}`,
        sourceApp: 'marketing_kpi',
        pillar: 'commercial',
        projectId: null,
        projectName: L.projectName || L['Reference Projects Name'] || null,
        type,
        title: `${label} · ${L.firstName || L.name || 'Lead'}`,
        subtitle: `${L.sourceName || L.source || ''} · ${L.owner || L.Employees || ''}`.trim(),
        date: ymd,
        severity: 'low',
        href: '/legacy/GA_MarketingSales_KPI_Dashboard.html',
        meta: { phone: L.phone, journey: L.journeyKey || L.journey }
      });
      count += 1;
      if (count >= cap) break;
    }
  }

  return events;
}

function collectExecutionEvents(projects, execPayload, from, to) {
  const events = [];
  if (!execPayload?.roadmap?.byScope) return events;

  projects.forEach((p) => {
    const scope = p.integrationSnapshot?.executionProjectKey;
    if (!scope) return;
    const byScope = execPayload.roadmap.byScope[scope] || {};
    Object.entries(byScope).forEach(([key, row]) => {
      const done = Boolean(row?.metDate);
      const ymd = toYmd(row?.expectedEnd || row?.metDate);
      if (!inRange(ymd, from, to)) return;
      addEvent(events, {
        id: `exec_${p._id}_${key}`,
        sourceApp: 'ga_execution_dashboard',
        pillar: 'delivery',
        projectId: p._id,
        projectName: p.name,
        type: 'roadmap_milestone',
        title: row?.label || key,
        subtitle: `${p.name} · execution roadmap`,
        date: ymd,
        status: done ? 'done' : undefined,
        done,
        severity: !done && deriveStatus(ymd) === 'overdue' ? 'high' : 'medium',
        href: '/app/execution-dashboard',
        meta: { key, scope }
      });
    });
  });

  return events;
}

async function collectHiringEvents(from, to) {
  await ensureMongo();
  const events = [];
  const rows = await HiringInterview.find({
    isDeleted: { $ne: true },
    scheduledAt: { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59`) },
    outcome: 'Pending'
  })
    .sort({ scheduledAt: 1 })
    .lean();

  rows.forEach((iv) => {
    const ymd = toYmd(iv.scheduledAt);
    if (!inRange(ymd, from, to)) return;
    addEvent(events, {
      id: `hire_${iv._id}`,
      sourceApp: 'hiring',
      pillar: 'people_cost',
      projectId: null,
      projectName: null,
      type: 'interview',
      title: 'Interview scheduled',
      subtitle: `Round ${iv.round} · ${iv.mode || ''}`.trim(),
      date: ymd,
      severity: 'medium',
      href: '/app/hiring/interviews',
      meta: { round: iv.round, mode: iv.mode, panel: iv.panel }
    });
  });

  return events;
}

function defaultRange(cursor = new Date()) {
  const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0);
  return { from: toYmd(from), to: toYmd(to) };
}

function applyFilters(events, filters) {
  let out = events;
  if (filters.apps?.length) {
    const set = new Set(filters.apps);
    out = out.filter((e) => set.has(e.sourceApp));
  }
  if (filters.pillars?.length) {
    const set = new Set(filters.pillars);
    out = out.filter((e) => set.has(e.pillar));
  }
  if (filters.projects?.length) {
    const set = new Set(filters.projects);
    out = out.filter((e) => !e.projectId || set.has(e.projectId));
  }
  if (filters.types?.length) {
    const set = new Set(filters.types);
    out = out.filter((e) => set.has(e.type));
  }
  if (filters.status && filters.status !== 'all') {
    out = out.filter((e) => e.status === filters.status);
  }
  return out;
}

/**
 * Aggregate portfolio calendar events from all integrated apps.
 * @param {import('mongodb').Db} db
 * @param {object} user
 * @param {object} query
 */
export async function buildPortfolioCalendar(db, user, query = {}) {
  const range = query.from && query.to ? { from: query.from, to: query.to } : defaultRange();
  const { from, to } = range;

  const filter = buildProjectFilter(user);
  const projects = await db.collection(DM_COLLECTIONS.projects).find(filter).sort({ name: 1 }).toArray();
  const scoped = projects.filter((p) => projectInScope(user, p));

  const [precon, finState, mktState, execPayload] = await Promise.all([
    loadPreconState(db),
    loadFinanceKpiState(db),
    loadMarketingKpiState(db),
    loadExecutionPayload()
  ]);

  const batches = await Promise.all([
    collectDmEvents(db, scoped, from, to),
    collectPostSalesEvents(scoped, from, to),
    collectCashflowMilestones(db, scoped, from, to),
    Promise.resolve(collectPreconEvents(scoped, precon, from, to)),
    Promise.resolve(collectFinanceEvents(finState, from, to)),
    Promise.resolve(collectMarketingEvents(mktState, from, to)),
    Promise.resolve(collectExecutionEvents(scoped, execPayload, from, to)),
    collectHiringEvents(from, to)
  ]);

  const allEvents = batches.flat().filter(Boolean);
  const filters = {
    apps: query.apps ? String(query.apps).split(',').map((s) => s.trim()).filter(Boolean) : [],
    pillars: query.pillars ? String(query.pillars).split(',').map((s) => s.trim()).filter(Boolean) : [],
    projects: query.projects ? String(query.projects).split(',').map((s) => s.trim()).filter(Boolean) : [],
    types: query.types ? String(query.types).split(',').map((s) => s.trim()).filter(Boolean) : [],
    status: query.status || 'all'
  };

  const events = applyFilters(allEvents, filters).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] || 2) - (sev[b.severity] || 2);
  });

  const sourceCounts = {};
  events.forEach((e) => {
    sourceCounts[e.sourceApp] = (sourceCounts[e.sourceApp] || 0) + 1;
  });

  const counts = { total: events.length, overdue: 0, today: 0, upcoming: 0, done: 0 };
  events.forEach((e) => {
    if (counts[e.status] != null) counts[e.status] += 1;
  });

  return {
    events,
    meta: {
      from,
      to,
      syncedAt: new Date().toISOString(),
      sources: CALENDAR_SOURCE_DEFS.map((s) => ({
        ...s,
        count: sourceCounts[s.key] || 0
      })),
      projects: scoped.map((p) => ({ id: p._id, name: p.name })),
      counts,
      totalUnfiltered: allEvents.length
    }
  };
}
