/**
 * Build rich Ask AI context from live APIs / storage — PreConstruction-style contract:
 * { totals: flat numbers, hotItems: actionable rows, domain bags }
 */

import { hiringApi } from './hiringApi.js';
import { postSalesApi } from './postSalesApi.js';
import { dmGovernanceApi } from './dmGovernanceApi.js';

function snip(s, n = 140) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function asList(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  return v.items || v.rows || v.requisitions || v.candidates || v.alerts || v.invoices || [];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Hiring — dashboard KPIs + open requisitions + funnel pressure */
export async function buildHiringAskContext() {
  const [dash, reqs, health] = await Promise.all([
    hiringApi.dashboard().catch(() => null),
    hiringApi.listRequisitions().catch(() => null),
    hiringApi.health().catch(() => ({})),
  ]);
  const list = asList(reqs);
  const kpis = dash?.kpis || {};
  const byStatus = {};
  const hotItems = [];

  for (const r of list) {
    const st = String(r.status || 'unknown');
    byStatus[st] = (byStatus[st] || 0) + 1;
    const closed = /closed|cancelled|fulfilled/i.test(st);
    if (!closed) {
      hotItems.push({
        id: r.id || r._id,
        title: r.role || r.title || r.reqCode || 'Requisition',
        status: st,
        detail: snip(
          [r.department, r.location, r.projectName, r.entityTag, r.headcount != null ? `HC ${r.headcount}` : '']
            .filter(Boolean)
            .join(' · '),
        ),
        risk: /hold|stuck|draft|sourcing/i.test(st) ? 8 : /interview|offer/i.test(st) ? 5 : 3,
        href: r.id || r._id ? `/app/hiring/req/${r.id || r._id}` : '/app/hiring',
      });
    }
  }

  for (const f of dash?.funnelByRequisition || []) {
    if ((f.activeCandidates || f.inPipeline || 0) === 0 && f.status && !/closed|fulfilled|cancelled/i.test(f.status)) {
      hotItems.push({
        title: f.role || f.reqCode || 'Req funnel',
        detail: snip(`No active candidates · status ${f.status}`),
        status: f.status,
        risk: 9,
      });
    }
  }

  hotItems.sort((a, b) => (b.risk || 0) - (a.risk || 0));

  return {
    generatedAt: new Date().toISOString(),
    app: 'hiring',
    totals: {
      requisitions: list.length,
      openRequisitions: kpis.openRequisitions ?? hotItems.length,
      fulfilledRequisitions: kpis.fulfilledRequisitions ?? 0,
      totalHeadcount: kpis.totalHeadcount ?? 0,
      totalHired: kpis.totalHired ?? 0,
      fillRate: kpis.fillRate ?? 0,
      activeCandidates: kpis.activeCandidates ?? 0,
      upcomingInterviews: kpis.upcomingInterviews ?? 0,
      offersAccepted: kpis.offersAccepted ?? 0,
      offerConversionRate: kpis.offerConversionRate ?? 0,
      byStatus,
      sourcingMode: health?.sourcingMode || 'unknown',
    },
    hotItems: hotItems.slice(0, 30),
    funnelByRequisition: (dash?.funnelByRequisition || []).slice(0, 20),
    sourceMix: (dash?.sourceMix || []).slice(0, 12),
    timeInStage: dash?.timeInStage || null,
  };
}

/** Post Sales — map real dashboard fields */
export async function buildPostSalesAskContext() {
  let dash = null;
  try {
    dash = await postSalesApi.dashboard({});
  } catch {
    dash = null;
  }
  if (!dash) {
    return {
      generatedAt: new Date().toISOString(),
      app: 'post_sales',
      totals: {},
      hotItems: [],
      note: 'Post Sales dashboard unavailable — sign in and open Post Sales once, then re-ask.',
    };
  }

  const cf = dash.cashflowHealth || {};
  const hotItems = [];

  for (const u of dash.slaBreachUnits || []) {
    hotItems.push({
      id: u.id || u._id || u.unitId,
      title: u.unitNo || u.unit || u.name || 'Unit',
      detail: snip(`SLA breach · ${u.step || u.phase || u.reason || ''} · ${u.projectName || ''}`),
      status: 'sla_breach',
      risk: 10,
      href: u.id || u._id ? `/app/post-sales/units/${u.id || u._id}` : '/app/post-sales',
    });
  }
  for (const u of dash.highPriorityUnits || []) {
    hotItems.push({
      id: u.id || u._id || u.unitId,
      title: u.unitNo || u.unit || u.name || 'Unit',
      detail: snip(`High priority · ${u.step || u.status || u.reason || ''} · ${u.projectName || ''}`),
      status: u.status || 'high_priority',
      risk: 8,
      href: u.id || u._id ? `/app/post-sales/units/${u.id || u._id}` : '/app/post-sales',
    });
  }
  for (const t of dash.openTicketsList || []) {
    hotItems.push({
      id: t.id || t._id,
      title: t.subject || t.title || t.ticketNo || 'Ticket',
      detail: snip(`${t.status || ''} · ${t.unitNo || t.unit || ''} · ${t.priority || ''}`),
      status: t.status || 'ticket',
      risk: /high|urgent/i.test(String(t.priority || '')) ? 9 : 6,
      href: '/app/post-sales',
    });
  }

  hotItems.sort((a, b) => (b.risk || 0) - (a.risk || 0));

  const totals = {
    totalUnits: dash.totalUnits ?? 0,
    activeUnits: dash.activeUnits ?? 0,
    slaBreaches: dash.slaBreaches ?? (dash.slaBreachUnits || []).length,
    openTickets: dash.openTickets ?? (dash.openTicketsList || []).length,
    ackBreachCount: dash.ackBreachCount ?? 0,
    resBreachCount: dash.resBreachCount ?? 0,
    totalDemanded: dash.totalDemanded ?? cf.agreementDue ?? 0,
    totalCollected: dash.totalCollected ?? cf.agreementReceived ?? 0,
    totalOutstanding: dash.totalOutstanding ?? cf.totalOutstanding ?? 0,
    agreementPending: dash.agreementPending ?? cf.agreementPending ?? 0,
    gstPending: dash.gstPending ?? cf.gstPending ?? 0,
    pendingDemandCount: dash.pendingDemandCount ?? 0,
    openDisbursementTasks: dash.openDisbursementTasks ?? 0,
    delayedDisbursementTasks: dash.delayedDisbursementTasks ?? 0,
    collectPct: dash.collectPct ?? 0,
    todayCollectPct: dash.todayCollectPct ?? 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    app: 'post_sales',
    totals,
    hotItems: hotItems.slice(0, 35),
    cashflowHealth: cf,
    forecastBuckets: dash.forecastBuckets || null,
    collectionByProject: (dash.collectionByProject || []).slice(0, 15),
    byProject: (dash.byProject || []).slice?.(0, 15) || dash.byProject || null,
    byPhase: dash.byPhase || null,
  };
}

/** DM / Business Health — dashboard + alerts + inbox */
export async function buildDmAskContext() {
  const [meta, dash, alerts, inbox, scan, spvs, projects] = await Promise.all([
    dmGovernanceApi.meta().catch(() => null),
    dmGovernanceApi.dashboard().catch(() => null),
    dmGovernanceApi.alerts().catch(() => null),
    dmGovernanceApi.approvalInbox().catch(() => null),
    dmGovernanceApi.proactiveScan().catch(() => null),
    dmGovernanceApi.listSpvs().catch(() => null),
    dmGovernanceApi.listProjects().catch(() => null),
  ]);

  const hotItems = [];
  const alertList = asList(alerts);
  for (const e of alertList.slice(0, 20)) {
    hotItems.push({
      title: e.title || e.name || e.code || 'Alert',
      detail: snip(e.message || e.detail || e.status || e.severity || e.severityName || ''),
      status: e.severity || e.status || 'alert',
      risk: /crit|high|red/i.test(String(e.severity || e.status || '')) ? 10 : 6,
      href: '/app/dm-governance',
    });
  }

  const inboxList = asList(inbox);
  for (const e of inboxList.slice(0, 15)) {
    hotItems.push({
      title: e.title || e.number || e.type || 'Approval',
      detail: snip(e.projectName || e.spvName || e.status || e.summary || ''),
      status: 'approval',
      risk: 7,
      href: '/app/dm-governance',
    });
  }

  const scanItems = asList(scan?.findings || scan?.items || scan?.alerts || scan);
  for (const e of scanItems.slice(0, 15)) {
    hotItems.push({
      title: e.title || e.name || e.code || 'Scan finding',
      detail: snip(e.message || e.detail || e.recommendation || ''),
      status: e.severity || 'scan',
      risk: 8,
      href: '/app/dm-governance',
    });
  }

  // Flatten a few dashboard numeric KPIs when present
  const totals = {
    tabs: meta?.tabs?.length || 0,
    alerts: alertList.length,
    approvalsPending: inboxList.length,
    spvs: asList(spvs).length,
    projects: asList(projects).length,
    scanFindings: scanItems.length,
  };
  if (dash && typeof dash === 'object') {
    for (const [k, v] of Object.entries(dash)) {
      if (typeof v === 'number') totals[k] = v;
      else if (v && typeof v === 'object' && typeof v.count === 'number') totals[k] = v.count;
      else if (v && typeof v === 'object' && typeof v.total === 'number') totals[k] = v.total;
    }
  }

  hotItems.sort((a, b) => (b.risk || 0) - (a.risk || 0));

  return {
    generatedAt: new Date().toISOString(),
    app: 'dm_spv_governance',
    totals,
    hotItems: hotItems.slice(0, 35),
    dashboardSummary: dash
      ? Object.fromEntries(
          Object.entries(dash)
            .filter(([, v]) => v == null || typeof v !== 'object' || Array.isArray(v))
            .slice(0, 40),
        )
      : null,
    meta: meta ? { tabs: meta.tabs } : null,
  };
}

function deepSample(v, depth = 0) {
  if (v == null) return v;
  if (typeof v !== 'object') return v;
  if (depth > 3) return Array.isArray(v) ? `[${v.length}]` : '{…}';
  if (Array.isArray(v)) {
    return {
      count: v.length,
      sample: v.slice(0, 8).map((x) => {
        if (x && typeof x === 'object') {
          const title = x.name || x.title || x.role || x.id || x.code;
          if (title) {
            return {
              title: String(title),
              detail: snip([x.status, x.who, x.owner, x.loc, x.department].filter(Boolean).join(' · ')),
              ...Object.fromEntries(
                Object.entries(x)
                  .filter(([, val]) => typeof val === 'number')
                  .slice(0, 6),
              ),
            };
          }
        }
        return deepSample(x, depth + 1);
      }),
    };
  }
  const out = {};
  for (const [k, val] of Object.entries(v).slice(0, 50)) {
    if (Array.isArray(val)) out[k] = deepSample(val, depth + 1);
    else if (val && typeof val === 'object') out[k] = deepSample(val, depth + 1);
    else out[k] = val;
  }
  return out;
}

/** V2 / V3 planners — extract real projects/people pressure, not key names */
export function buildPlannerAskContext(appId, title) {
  const keys =
    appId === 'v2_resource_planner'
      ? ['ga_rp_state_v1', 'ga_rp_projects', 'ga_jd_data', 'ga_v2_proj_costs']
      : ['ga_planner_state_v1', 'ga_rp_projects', 'ga_v3_cf_sync', 'ga_v3_money_crores'];

  const bag = {};
  const hotItems = [];
  let projectCount = 0;
  let peopleCount = 0;

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      bag[k] = deepSample(parsed);

      const projects = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.projects)
          ? parsed.projects
          : Array.isArray(parsed?.projs)
            ? parsed.projs
            : [];
      if (projects.length) {
        projectCount = Math.max(projectCount, projects.length);
        for (const p of projects.slice(0, 20)) {
          hotItems.push({
            title: p.name || p.title || p.id || 'Project',
            detail: snip([p.status, p.loc, p.phase, p._gdv != null ? `GDV ${p._gdv}` : ''].filter(Boolean).join(' · ')),
            status: p.status || '',
            risk: /risk|delay|hold|red/i.test(String(p.status || '')) ? 8 : 3,
          });
        }
      }

      const people = Array.isArray(parsed?.people)
        ? parsed.people
        : Array.isArray(parsed?.team)
          ? parsed.team
          : Array.isArray(parsed?.resources)
            ? parsed.resources
            : [];
      if (people.length) {
        peopleCount = Math.max(peopleCount, people.length);
        for (const person of people.slice(0, 15)) {
          const open = Number(person.open || person.load || person.allocation || 0);
          hotItems.push({
            title: person.name || person.who || person.id || 'Person',
            detail: snip(`load ${open} · ${person.role || person.lane || ''}`),
            status: 'workload',
            risk: open >= 8 ? 9 : open >= 5 ? 6 : 2,
            who: person.name || person.who,
          });
        }
      }
    } catch {
      bag[k] = { present: true, parseError: true };
    }
  }

  hotItems.sort((a, b) => (b.risk || 0) - (a.risk || 0));

  return {
    generatedAt: new Date().toISOString(),
    app: appId,
    label: title,
    totals: {
      keysLoaded: Object.keys(bag).length,
      projects: projectCount,
      people: peopleCount,
      hotCount: hotItems.length,
    },
    storage: bag,
    hotItems: hotItems.slice(0, 30),
  };
}

export async function buildVaultHubAskContext(allowedApps = []) {
  return {
    generatedAt: new Date().toISOString(),
    app: 'vault',
    totals: { allowedApps: allowedApps.length },
    allowedApps,
    hotItems: allowedApps.map((id) => ({
      title: id,
      detail: 'Open this app and use Ask AI inside it for live metrics',
      href:
        id === 'hiring'
          ? '/app/hiring'
          : id === 'post_sales'
            ? '/app/post-sales'
            : id === 'dm_spv_governance'
              ? '/app/dm-governance'
              : id === 'preconstruction'
                ? '/app/preconstruction'
                : '/',
    })),
    note: 'Vault hub is a launcher. For accurate numbers open Ask AI inside Cashflow, Hiring, Post Sales, PreConstruction, etc.',
  };
}
