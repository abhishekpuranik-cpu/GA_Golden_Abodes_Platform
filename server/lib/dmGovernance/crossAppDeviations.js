import {
  loadCashflowEnvelope,
  loadV2PlannerState,
  loadV3PlannerState,
  loadPreconState,
  loadExecutionPayload,
  loadFinanceKpiState,
  loadMarketingKpiState,
  matchProjectByName,
  slugName,
  daysBetween
} from './integrations/appStateReader.js';
import { loadPostSalesProjectKpis } from './integrations/postSales.js';
import { APP_HUMAN_LABELS } from './pillars.js';

const APP_LABELS = APP_HUMAN_LABELS;

function num(v) {
  return Number(v) || 0;
}

function deviation(base) {
  return {
    sourceApp: base.sourceApp,
    sourceLabel: APP_LABELS[base.sourceApp] || base.sourceApp,
    deviationType: base.deviationType,
    category: base.category || 'integration',
    severity: base.severity || 'medium',
    projectId: base.projectId || null,
    projectName: base.projectName || null,
    title: base.title,
    message: base.message,
    impact: base.impact || '',
    recommendedAction: base.recommendedAction,
    href: base.href,
    metric: base.metric || null,
    detectedAt: new Date().toISOString()
  };
}

function cashflowDeviations(project, cfg, envelope) {
  const out = [];
  if (!cfg) {
    out.push(
      deviation({
        sourceApp: 'v1_cashflow',
        deviationType: 'project_missing',
        category: 'sales',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Project not in Cashflow V1',
        message: `${project._id} not found in cashflow workbook`,
        impact: 'Collections and milestone signals unavailable',
        recommendedAction: 'Add project to Cashflow V1 and sync',
        href: '/legacy/GA_Cashflow_V1.html'
      })
    );
    return out;
  }

  const units = cfg.units || [];
  const collections = units.reduce((s, u) => s + num(u.receivedToDate), 0);
  const soldGdv = units.reduce((s, u) => s + num(u.totalValue), 0);
  const dmTopline = num(project.toplineGdv);

  if (dmTopline > 0 && soldGdv > 0) {
    const drift = Math.abs(soldGdv - dmTopline) / dmTopline;
    if (drift > 0.08) {
      out.push(
        deviation({
          sourceApp: 'v1_cashflow',
          deviationType: 'gdv_drift',
          category: 'sales',
          severity: drift > 0.2 ? 'high' : 'medium',
          projectId: project._id,
          projectName: project.name,
          title: 'GDV drift vs DM master',
          message: `Cashflow sold GDV ${(soldGdv / 1e7).toFixed(2)} Cr vs DM ${(dmTopline / 1e7).toFixed(2)} Cr (${(drift * 100).toFixed(1)}%)`,
          impact: 'DM cap and billing base may be wrong',
          recommendedAction: 'Reconcile topline in project master',
          href: `/app/dm-governance/projects/${project._id}`,
          metric: { cashflowGdv: soldGdv, dmGdv: dmTopline }
        })
      );
    }
  }

  if (units.length && collections === 0 && project.revenueStatus !== 'pre_revenue') {
    out.push(
      deviation({
        sourceApp: 'v1_cashflow',
        deviationType: 'collections_zero',
        category: 'sales',
        severity: 'high',
        projectId: project._id,
        projectName: project.name,
        title: 'Sold units but zero collections',
        message: `${units.length} unit(s) in Cashflow with ₹0 collected`,
        impact: 'Collection-linked DM billing blocked',
        recommendedAction: 'Update unit collections in Cashflow V1',
        href: '/legacy/GA_Cashflow_V1.html'
      })
    );
  }

  const paymentIssues = units.filter((u) => {
    const st = String(u.paymentIssueStatus || u.paymentIssue || '').toLowerCase();
    return st && st !== 'ok' && st !== 'none' && st !== 'clear';
  });
  if (paymentIssues.length) {
    out.push(
      deviation({
        sourceApp: 'v1_cashflow',
        deviationType: 'payment_issue',
        category: 'sales',
        severity: paymentIssues.length >= 3 ? 'high' : 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Sales payment issues',
        message: `${paymentIssues.length} unit(s) flagged with payment/credit issues`,
        impact: 'Collections and CLP recovery at risk',
        recommendedAction: 'Review sales ledger in Cashflow V1',
        href: '/legacy/GA_Cashflow_V1.html',
        metric: { count: paymentIssues.length }
      })
    );
  }

  const defs = cfg.milestoneDefs || [];
  const plan = cfg.milestonesDates || {};
  const achieved = cfg.milestonesAchievedDates || {};
  const today = new Date().toISOString().slice(0, 10);

  for (const d of defs) {
    const key = d.key;
    const planDate = plan[key];
    const achievedDate = achieved[key];
    if (!planDate || achievedDate) continue;
    const late = daysBetween(planDate, today);
    if (late != null && late > 14) {
      out.push(
        deviation({
          sourceApp: 'v1_cashflow',
          deviationType: 'milestone_slip',
          category: 'construction',
          severity: late > 45 ? 'high' : 'medium',
          projectId: project._id,
          projectName: project.name,
          title: `Milestone slip: ${d.label || key}`,
          message: `Planned ${planDate} — ${late} days overdue, not achieved`,
          impact: 'Delays collection-linked construction CLP',
          recommendedAction: 'Update Execution roadmap or achieve milestone',
          href: '/legacy/GA_Cashflow_V1.html',
          metric: { key, planDate, daysLate: late }
        })
      );
      break;
    }
  }

  return out;
}

function v2Deviations(project, v2) {
  const out = [];
  if (!v2?.blob) {
    out.push(
      deviation({
        sourceApp: 'v2_resource_planner',
        deviationType: 'state_missing',
        category: 'resources',
        severity: 'low',
        projectId: project._id,
        projectName: project.name,
        title: 'Resource Planner V2 not synced',
        message: 'No ga_rp_state_v1 in Mongo',
        recommendedAction: 'Open V2 planner and enable cloud sync',
        href: '/app/resource-planner'
      })
    );
    return out;
  }

  const name = String(project.name || '').trim();
  const allocs = (v2.blob.teamAlloc || []).filter(
    (a) => String(a.project || '').trim().toLowerCase() === name.toLowerCase()
  );
  if (!allocs.length) {
    out.push(
      deviation({
        sourceApp: 'v2_resource_planner',
        deviationType: 'no_team_allocation',
        category: 'resources',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'No team allocated in V2',
        message: `No teamAlloc rows for "${name}"`,
        impact: 'Cost-plus billing may be understated',
        recommendedAction: 'Allocate team in Resource Planner V2',
        href: '/app/resource-planner'
      })
    );
  }

  const reg = (v2.projects || []).find((p) => String(p.id) === project._id);
  if (reg && num(reg._gdv) > 0 && num(project.toplineGdv) > 0) {
    const drift = Math.abs(num(reg._gdv) - num(project.toplineGdv)) / num(project.toplineGdv);
    if (drift > 0.1) {
      out.push(
        deviation({
          sourceApp: 'v2_resource_planner',
          deviationType: 'registry_gdv_drift',
          category: 'planning',
          severity: 'medium',
          projectId: project._id,
          projectName: project.name,
          title: 'V2 registry GDV differs from DM',
          message: `V2 _gdv ${(num(reg._gdv) / 1e7).toFixed(2)} Cr vs DM ${(num(project.toplineGdv) / 1e7).toFixed(2)} Cr`,
          recommendedAction: 'Align project registry across V2 and DM',
          href: '/app/resource-planner'
        })
      );
    }
  }

  return out;
}

function v3Deviations(project, v3) {
  const out = [];
  if (!v3?.blob) return out;

  const projs = v3.blob.projs || v3.projects || [];
  const match = projs.find((p) => String(p.id) === project._id) || matchProjectByName(project.name, projs);
  if (!match) {
    out.push(
      deviation({
        sourceApp: 'v3_org_planner',
        deviationType: 'not_in_acquisition',
        category: 'planning',
        severity: 'low',
        projectId: project._id,
        projectName: project.name,
        title: 'Not in V3 acquisition model',
        message: 'Project missing from ga_planner_state_v1.projs',
        recommendedAction: 'Add project in V3 Org Planner',
        href: '/app/v3-project-acquisition'
      })
    );
    return out;
  }

  const fin = v3.blob.fin?.[project._id];
  if (fin?.totRev && num(project.toplineGdv) > 0) {
    const drift = Math.abs(num(fin.totRev) - num(project.toplineGdv)) / num(project.toplineGdv);
    if (drift > 0.12) {
      out.push(
        deviation({
          sourceApp: 'v3_org_planner',
          deviationType: 'acquisition_gdv_drift',
          category: 'planning',
          severity: 'medium',
          projectId: project._id,
          projectName: project.name,
          title: 'V3 financial model GDV drift',
          message: `Acquisition totRev differs from DM topline by ${(drift * 100).toFixed(0)}%`,
          impact: 'Eligible DM base may need refresh',
          recommendedAction: 'Reconcile V3 fin model with DM project master',
          href: '/app/v3-project-acquisition'
        })
      );
    }
  }

  const bkn = match.bkn || {};
  const bknMonths = Object.keys(bkn).filter((k) => num(bkn[k]) > 0);
  if (bknMonths.length && num(project.collectionsTtd) === 0 && project.revenueStatus !== 'pre_revenue') {
    out.push(
      deviation({
        sourceApp: 'v3_org_planner',
        deviationType: 'booking_plan_vs_actual',
        category: 'sales',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'V3 booking plan vs zero collections',
        message: 'Acquisition model has booking forecast but Cashflow collections are zero',
        recommendedAction: 'Sync Cashflow sales or update revenue status',
        href: '/app/v3-project-acquisition'
      })
    );
  }

  return out;
}

function preconDeviations(project, precon) {
  const out = [];
  if (!precon?.projects?.length) return out;

  const match =
    precon.projects.find((p) => slugName(p.name) === slugName(project.name)) ||
    precon.projects.find((p) => String(p.id) === project._id);
  if (!match) return out;

  let overdue = 0;
  let open = 0;
  const today = new Date().toISOString().slice(0, 10);

  (match.phases || []).forEach((ph) => {
    (ph.tasks || []).forEach((t) => {
      const status = String(t.status || '').toLowerCase();
      if (status === 'complete' || status === 'done') return;
      open += 1;
      const end = t.ae || t.ms;
      if (end && end < today) overdue += 1;
    });
  });

  if (overdue > 0) {
    out.push(
      deviation({
        sourceApp: 'preconstruction',
        deviationType: 'overdue_tasks',
        category: 'delivery',
        severity: overdue >= 5 ? 'high' : 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'PreConstruction overdue tasks',
        message: `${overdue} overdue task(s) of ${open} open — ${match.name}`,
        impact: 'Launch and approvals may slip → delays DM retainer phase-out',
        recommendedAction: 'Review PreConstruction critical path',
        href: '/preconstruction',
        metric: { overdue, open }
      })
    );
  }

  return out;
}

function executionDeviations(project, payload) {
  const out = [];
  if (!payload?.PROJECTS) return out;

  let matchKey = project.integrationSnapshot?.executionProjectKey || null;
  let meta = matchKey ? payload.PROJECTS[matchKey] : null;

  if (!meta) {
    for (const [key, m] of Object.entries(payload.PROJECTS)) {
      if (slugName(m?.name) === slugName(project.name)) {
        matchKey = key;
        meta = m;
        break;
      }
    }
  }

  if (!meta) return out;

  const completion = num(meta.completion);
  const spi = num(meta.spi);
  const cpi = num(meta.cpi);

  if (spi > 0 && spi < 0.85) {
    out.push(
      deviation({
        sourceApp: 'ga_execution_dashboard',
        deviationType: 'spi_low',
        category: 'construction',
        severity: spi < 0.7 ? 'high' : 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Schedule performance index low',
        message: `SPI ${spi.toFixed(2)} on Execution Dashboard`,
        impact: 'Milestone-linked collections may slip',
        recommendedAction: 'Review construction schedule recovery',
        href: '/legacy/GA_Cashflow_V1.html',
        metric: { spi, completion }
      })
    );
  }

  if (cpi > 0 && cpi < 0.9) {
    out.push(
      deviation({
        sourceApp: 'ga_execution_dashboard',
        deviationType: 'cpi_low',
        category: 'construction',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Cost performance index low',
        message: `CPI ${cpi.toFixed(2)} — site spend above plan`,
        impact: 'Project cost-plus and SPV margin pressure',
        recommendedAction: 'Review BOQ vs actuals in Execution Dashboard',
        metric: { cpi, spent: meta.spent, boq: meta.boq }
      })
    );
  }

  if (num(project.constructionProgressPct) > 20 && completion < 10) {
    out.push(
      deviation({
        sourceApp: 'ga_execution_dashboard',
        deviationType: 'progress_mismatch',
        category: 'construction',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Construction progress mismatch',
        message: `DM milestones ${project.constructionProgressPct}% vs Execution completion ${completion}%`,
        recommendedAction: 'Run milestone sync from Integrations',
        href: '/app/dm-governance/integrations'
      })
    );
  }

  return out;
}

function financeKpiDeviations(finKpi) {
  const out = [];
  if (!finKpi?.blob) return out;
  const S = finKpi.blob;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = (S.compliance || []).filter((c) => !c.actual && c.due && c.due < today);
  if (overdue.length) {
    out.push(
      deviation({
        sourceApp: 'finance_kpi',
        deviationType: 'compliance_overdue',
        category: 'governance',
        severity: overdue.length >= 3 ? 'high' : 'medium',
        projectId: null,
        projectName: null,
        title: 'Finance compliance overdue',
        message: `${overdue.length} statutory obligation(s) past due in Finance KPI`,
        impact: 'Portfolio governance and lender confidence risk',
        recommendedAction: 'Clear compliance calendar in Finance KPI',
        href: '/legacy/GA_Finance_KPI.html'
      })
    );
  }
  return out;
}

function marketingKpiDeviations(project, mkt) {
  const out = [];
  if (!mkt?.blob?.leads?.length) return out;
  const leads = mkt.blob.leads.filter((l) => {
    const proj = String(l.project || l['Reference Projects Name'] || '').toLowerCase();
    return proj.includes(String(project.name || '').toLowerCase()) || proj.includes(String(project._id || '').toLowerCase());
  });
  if (!leads.length) return out;
  const stale = leads.filter((l) => {
    const st = String(l.stage || l.Status || l['Lead Stage'] || '').toLowerCase();
    return st.includes('follow') || st.includes('no response');
  });
  if (stale.length >= 3) {
    out.push(
      deviation({
        sourceApp: 'marketing_kpi',
        deviationType: 'stale_leads',
        category: 'commercial',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Marketing leads stalling',
        message: `${stale.length} follow-up / no-response leads for ${project.name}`,
        recommendedAction: 'Review lead pipeline in Marketing KPI dashboard',
        href: '/legacy/GA_MarketingSales_KPI_Dashboard.html'
      })
    );
  }
  return out;
}

async function postSalesDeviations(project, ps) {
  const out = [];
  if (!ps) return out;
  if (ps.overdueDemands > 0) {
    out.push(
      deviation({
        sourceApp: 'post_sales',
        deviationType: 'overdue_demands',
        category: 'customer',
        severity: ps.overdueDemands >= 5 ? 'high' : 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Post-sales demands overdue',
        message: `${ps.overdueDemands} overdue demand(s) · ${ps.unitsInPipeline} units in pipeline`,
        recommendedAction: 'Review demands in Post Sales',
        href: '/app/post-sales/demands',
        metric: { overdueDemands: ps.overdueDemands }
      })
    );
  }
  if (ps.loanBlockers > 0) {
    out.push(
      deviation({
        sourceApp: 'post_sales',
        deviationType: 'loan_blocker',
        category: 'customer',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Loan sanction blockers',
        message: `${ps.loanBlockers} unit(s) with incomplete loan sanction`,
        recommendedAction: 'Review loans in Post Sales',
        href: '/app/post-sales/loans'
      })
    );
  }
  if (ps.overdueSteps >= 5) {
    out.push(
      deviation({
        sourceApp: 'post_sales',
        deviationType: 'pipeline_slip',
        category: 'customer',
        severity: 'medium',
        projectId: project._id,
        projectName: project.name,
        title: 'Post-sales pipeline overdue',
        message: `${ps.overdueSteps} overdue step(s) · avg age ${ps.avgStageAgeDays}d`,
        recommendedAction: 'Review unit pipeline in Post Sales',
        href: '/app/post-sales'
      })
    );
  }
  return out;
}

/**
 * Collect cross-app deviations for DM projects.
 * @param {import('mongodb').Db} db
 * @param {object[]} projects
 */
export async function collectCrossAppDeviations(db, projects) {
  const [cfEnv, v2, v3, precon, exec, finKpi, mkt] = await Promise.all([
    loadCashflowEnvelope(db),
    loadV2PlannerState(db),
    loadV3PlannerState(db),
    loadPreconState(db),
    loadExecutionPayload(),
    loadFinanceKpiState(db),
    loadMarketingKpiState(db)
  ]);

  const all = [...financeKpiDeviations(finKpi)];
  const appSignals = {
    v1_cashflow: { available: !!cfEnv, deviationCount: 0, status: cfEnv ? 'green' : 'amber' },
    v2_resource_planner: { available: !!v2?.blob, deviationCount: 0, status: v2?.blob ? 'green' : 'amber' },
    v3_org_planner: { available: !!v3?.blob, deviationCount: 0, status: v3?.blob ? 'green' : 'amber' },
    preconstruction: { available: !!precon?.projects?.length, deviationCount: 0, status: precon?.projects?.length ? 'green' : 'amber' },
    ga_execution_dashboard: { available: !!exec, deviationCount: 0, status: exec ? 'green' : 'amber' },
    finance_kpi: { available: !!finKpi?.blob, deviationCount: 0, status: finKpi?.blob ? 'green' : 'amber' },
    marketing_kpi: { available: !!mkt?.blob?.leads?.length, deviationCount: 0, status: mkt?.blob?.leads?.length ? 'green' : 'amber' },
    post_sales: { available: false, deviationCount: 0, status: 'amber' },
    sales_dashboard: { available: false, deviationCount: 0, status: 'amber', note: 'Using Cashflow units as sales proxy' }
  };

  let postSalesLinked = false;
  for (const p of projects) {
    const cfg = cfEnv?.data?.[p._id];
    const ps = await loadPostSalesProjectKpis(p._id, p.name);
    if (ps) {
      postSalesLinked = true;
      appSignals.post_sales.available = true;
      appSignals.post_sales.status = 'green';
    }
    all.push(
      ...cashflowDeviations(p, cfg, cfEnv),
      ...v2Deviations(p, v2),
      ...v3Deviations(p, v3),
      ...preconDeviations(p, precon),
      ...executionDeviations(p, exec),
      ...marketingKpiDeviations(p, mkt),
      ...(await postSalesDeviations(p, ps))
    );
  }
  if (!postSalesLinked) {
    appSignals.post_sales.note = 'No Post Sales units linked to DM projects yet';
  }

  all.forEach((d) => {
    if (appSignals[d.sourceApp]) {
      appSignals[d.sourceApp].deviationCount += 1;
      if (d.severity === 'critical' || d.severity === 'high') {
        appSignals[d.sourceApp].status = 'red';
      } else if (appSignals[d.sourceApp].status === 'green') {
        appSignals[d.sourceApp].status = 'amber';
      }
    }
  });

  Object.keys(appSignals).forEach((key) => {
    appSignals[key].label = APP_HUMAN_LABELS[key] || key.replace(/_/g, ' ');
  });

  return {
    deviations: all.sort((a, b) => {
      const rank = { critical: 4, high: 3, medium: 2, low: 1 };
      return (rank[b.severity] || 0) - (rank[a.severity] || 0);
    }),
    appSignals,
    loadedAt: new Date().toISOString()
  };
}

export function deviationToIssue(d) {
  const rank = { critical: 40, high: 25, medium: 12, low: 5 };
  return {
    id: `xapp_${d.sourceApp}_${d.deviationType}_${d.projectId || 'global'}`,
    category: d.category,
    severity: d.severity,
    priority: (rank[d.severity] || 10) + 3,
    projectId: d.projectId,
    projectName: d.projectName,
    spvId: null,
    title: d.title,
    message: `[${d.sourceLabel}] ${d.message}`,
    impact: d.impact,
    recommendedAction: d.recommendedAction,
    href: d.href,
    sourceApp: d.sourceApp,
    sourceLabel: d.sourceLabel,
    deviationType: d.deviationType,
    detectedAt: d.detectedAt
  };
}
