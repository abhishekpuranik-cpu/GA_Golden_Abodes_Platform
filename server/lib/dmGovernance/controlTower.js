import { DM_COLLECTIONS } from './collections.js';
import { buildProjectFilter } from './access.js';
import { getEligibleBase, sumProjectBillingTotals } from './calculationEngine.js';
import { computeSpvReadinessScore } from './reconciliationService.js';
import { scanProjectRisks } from './riskEngine.js';
import { collectCrossAppDeviations, deviationToIssue } from './crossAppDeviations.js';
import { rollupPillars } from './pillars.js';

const SEVERITY_WEIGHT = { critical: 40, high: 25, medium: 12, low: 5 };
const DOMAIN_LABELS = {
  billing: 'Billing & cap',
  compliance: 'Compliance & legal',
  integration: 'Data integrations',
  collections: 'Collections & revenue',
  governance: 'Governance & workflow',
  planning: 'Planning & precon',
  construction: 'Construction execution',
  sales: 'Sales & collections',
  resources: 'Resource & cost'
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 3600 * 1000));
}

function statusFromScore(score) {
  if (score >= 80) return 'green';
  if (score >= 55) return 'amber';
  return 'red';
}

function issue(id, fields) {
  const severity = fields.severity || 'medium';
  return {
    id,
    category: fields.category,
    severity,
    priority: SEVERITY_WEIGHT[severity] + (fields.priorityBoost || 0),
    projectId: fields.projectId || null,
    projectName: fields.projectName || null,
    spvId: fields.spvId || null,
    title: fields.title,
    message: fields.message,
    impact: fields.impact || '',
    recommendedAction: fields.recommendedAction,
    href: fields.href,
    detectedAt: new Date().toISOString()
  };
}

/**
 * Proactive issue detection across portfolio.
 * @param {import('mongodb').Db} db
 * @param {object} user
 * @param {{ runRiskScan?: boolean }} opts
 */
export async function buildControlTower(db, user, opts = {}) {
  const filter = buildProjectFilter(user);
  const projects = await db.collection(DM_COLLECTIONS.projects).find(filter).toArray();
  const projectIds = projects.map((p) => p._id);
  const now = new Date();
  const month = currentMonth();

  if (opts.runRiskScan) {
    for (const p of projects) {
      await scanProjectRisks(db, p._id);
    }
  }

  const [openRisks, pendingTriggers, pendingInvoices, staleInvoices] = await Promise.all([
    db
      .collection(DM_COLLECTIONS.riskExceptions)
      .find({ status: 'open', ...(projectIds.length ? { projectId: { $in: projectIds } } : {}) })
      .toArray(),
    db
      .collection(DM_COLLECTIONS.billingTriggers)
      .find({ status: 'pending', ...(projectIds.length ? { projectId: { $in: projectIds } } : {}) })
      .toArray(),
    db
      .collection(DM_COLLECTIONS.invoices)
      .find({
        status: { $in: ['FINANCE_REVIEW', 'PROJECT_REVIEW'] },
        ...(projectIds.length ? { projectId: { $in: projectIds } } : {})
      })
      .toArray(),
    db
      .collection(DM_COLLECTIONS.invoices)
      .find({
        status: { $in: ['SENT', 'ACCRUED', 'PART_PAID'] },
        ...(projectIds.length ? { projectId: { $in: projectIds } } : {})
      })
      .toArray()
  ]);

  const issues = [];
  const domainPenalty = {
    billing: 0,
    compliance: 0,
    integration: 0,
    collections: 0,
    governance: 0,
    planning: 0,
    construction: 0,
    sales: 0,
    resources: 0
  };
  const projectHealth = [];

  for (const p of projects) {
    const config = p.activeBillingConfigId
      ? await db.collection(DM_COLLECTIONS.billingConfigs).findOne({ _id: p.activeBillingConfigId })
      : null;
    const totals = await sumProjectBillingTotals(db, p._id);
    const eligibleBase = getEligibleBase(p, config || {});
    const dmCap = eligibleBase * (num(config?.dmCapPct ?? p.dmCapPct, 10) / 100);
    const capUtil = dmCap > 0 ? (totals.dmFeeBilledTtd / dmCap) * 100 : 0;
    const outstanding = Math.max(0, totals.dmFeeBilledTtd - totals.dmFeePaidTtd);
    const collectionsPct = num(p.toplineGdv) > 0 ? (num(p.collectionsTtd) / num(p.toplineGdv)) * 100 : 0;

    let projectPenalty = 0;
    const spvId = p.spvIds?.[0] || null;

    const push = (i) => {
      issues.push(i);
      domainPenalty[i.category] = (domainPenalty[i.category] || 0) + (SEVERITY_WEIGHT[i.severity] || 10);
      projectPenalty += SEVERITY_WEIGHT[i.severity] || 10;
    };

    if (!p.activeBillingConfigId) {
      push(
        issue(`ct_${p._id}_no_model`, {
          category: 'billing',
          severity: 'critical',
          priorityBoost: 15,
          projectId: p._id,
          projectName: p.name,
          spvId,
          title: 'No billing model',
          message: `${p.name} has no active billing configuration`,
          impact: 'Cannot generate governed DM invoices',
          recommendedAction: 'Configure Hybrid GA billing model',
          href: `/app/dm-governance/billing/${p._id}`
        })
      );
    }

    if (capUtil >= 100) {
      push(
        issue(`ct_${p._id}_cap_breach`, {
          category: 'billing',
          severity: 'critical',
          priorityBoost: 10,
          projectId: p._id,
          projectName: p.name,
          title: 'DM cap breached',
          message: `Cap utilisation ${capUtil.toFixed(1)}% — billed above 10% entitlement`,
          impact: 'Leadership approval required for further billing',
          recommendedAction: 'Review annual recon and leadership sign-off',
          href: `/app/dm-governance/projects/${p._id}`
        })
      );
    } else if (capUtil >= 85) {
      push(
        issue(`ct_${p._id}_cap_high`, {
          category: 'billing',
          severity: 'high',
          projectId: p._id,
          projectName: p.name,
          title: 'DM cap nearing limit',
          message: `Cap utilisation ${capUtil.toFixed(1)}%`,
          impact: 'Limited room for further inside-cap billing',
          recommendedAction: 'Run scenario simulator before next invoice',
          href: `/app/dm-governance/scenarios`
        })
      );
    }

    const monthInvoice = await db.collection(DM_COLLECTIONS.invoices).findOne({
      projectId: p._id,
      periodMonth: month,
      status: { $nin: ['REJECTED'] }
    });
    if (p.revenueStatus === 'pre_revenue' && p.activeBillingConfigId && !monthInvoice) {
      push(
        issue(`ct_${p._id}_retainer_due`, {
          category: 'billing',
          severity: 'high',
          projectId: p._id,
          projectName: p.name,
          title: 'Monthly retainer not invoiced',
          message: `No invoice for ${month} — pre-revenue retainer may be due`,
          impact: 'GA revenue recognition delay',
          recommendedAction: 'Open billing workspace and generate invoice',
          href: `/app/dm-governance/billing-workspace/${p._id}`
        })
      );
    }

    if (p.revenueStatus === 'collection_active' && num(p.collectionsTtd) > 0) {
      const lastInv = await db
        .collection(DM_COLLECTIONS.invoices)
        .find({ projectId: p._id, status: { $nin: ['REJECTED', 'DRAFT'] } })
        .sort({ periodMonth: -1 })
        .limit(1)
        .toArray();
      if (!lastInv.length) {
        push(
          issue(`ct_${p._id}_coll_no_bill`, {
            category: 'collections',
            severity: 'high',
            projectId: p._id,
            projectName: p.name,
            title: 'Collections without DM billing',
            message: 'Collections active but no approved DM invoice on record',
            impact: 'Fee recovery lag vs customer collections',
            recommendedAction: 'Calculate collection-linked fee and invoice',
            href: `/app/dm-governance/billing-workspace/${p._id}`
          })
        );
      }
    }

    if (collectionsPct >= 10 && p.revenueStatus === 'pre_revenue') {
      push(
        issue(`ct_${p._id}_phase_mismatch`, {
          category: 'collections',
          severity: 'medium',
          projectId: p._id,
          projectName: p.name,
          title: 'Revenue phase mismatch',
          message: `Collections ${collectionsPct.toFixed(1)}% but status still pre_revenue`,
          impact: 'May be under-billing collection-linked fees',
          recommendedAction: 'Sync Cashflow and update revenue status',
          href: `/app/dm-governance/projects/${p._id}`
        })
      );
    }

    const syncDays = daysSince(p.integrationSnapshot?.cashflow?.syncedAt);
    if (syncDays === null) {
      push(
        issue(`ct_${p._id}_sync_never`, {
          category: 'integration',
          severity: 'medium',
          projectId: p._id,
          projectName: p.name,
          title: 'Cashflow never synced',
          message: 'No integration snapshot for collections and milestones',
          impact: 'Control tower metrics may be stale',
          recommendedAction: 'Run full integration sync',
          href: `/app/dm-governance/projects/${p._id}`
        })
      );
    } else if (syncDays > 7) {
      push(
        issue(`ct_${p._id}_sync_stale`, {
          category: 'integration',
          severity: syncDays > 14 ? 'high' : 'low',
          projectId: p._id,
          projectName: p.name,
          title: 'Integration data stale',
          message: `Last Cashflow sync ${syncDays} days ago`,
          impact: 'Billing triggers and collections may be outdated',
          recommendedAction: 'Run full integration sync',
          href: '/app/dm-governance/integrations'
        })
      );
    }

    if (outstanding > 500000) {
      push(
        issue(`ct_${p._id}_payable_aging`, {
          category: 'governance',
          severity: 'medium',
          projectId: p._id,
          projectName: p.name,
          title: 'SPV payable aging',
          message: `₹${outstanding.toLocaleString('en-IN')} unpaid DM fees to GA`,
          impact: 'Working capital / accrual exposure',
          recommendedAction: 'Follow up SPV payment or accrue per DMA',
          href: `/app/dm-governance/invoices?projectId=${p._id}`
        })
      );
    }

    if (spvId) {
      const spv = await db.collection(DM_COLLECTIONS.spvs).findOne({ _id: spvId });
      if (spv?.agreementStatus !== 'signed') {
        push(
          issue(`ct_${spvId}_dma_unsigned`, {
            category: 'compliance',
            severity: 'high',
            projectId: p._id,
            projectName: p.name,
            spvId,
            title: 'DMA not signed',
            message: `${spv?.spvName || spvId} agreement status: ${spv?.agreementStatus || 'unknown'}`,
            impact: 'Billing lacks contractual cover',
            recommendedAction: 'Upload signed DMA and update SPV status',
            href: `/app/dm-governance/spvs/${spvId}`
          })
        );
      }
      const readiness = await computeSpvReadinessScore(db, spvId);
      if (readiness.score < 70 && readiness.required > 0) {
        push(
          issue(`ct_${spvId}_compliance_gap`, {
            category: 'compliance',
            severity: readiness.score < 40 ? 'high' : 'medium',
            projectId: p._id,
            projectName: p.name,
            spvId,
            title: 'Compliance checklist incomplete',
            message: `SPV readiness ${readiness.score}% — ${readiness.missing} required docs unsigned`,
            impact: 'Audit and board readiness risk',
            recommendedAction: 'Complete compliance matrix',
            href: '/app/dm-governance/compliance'
          })
        );
      }
    }

    projectHealth.push({
      projectId: p._id,
      name: p.name,
      healthScore: Math.max(0, 100 - Math.min(95, projectPenalty)),
      status: statusFromScore(Math.max(0, 100 - projectPenalty)),
      issueCount: 0,
      capUtilPct: Math.round(capUtil * 10) / 10,
      collectionsPct: Math.round(collectionsPct * 10) / 10,
      outstanding,
      revenueStatus: p.revenueStatus,
      _penalty: projectPenalty
    });
  }

  const crossApp = await collectCrossAppDeviations(db, projects);
  crossApp.deviations.forEach((d) => {
    const i = deviationToIssue(d);
    issues.push(i);
    domainPenalty[i.category] = (domainPenalty[i.category] || 0) + (SEVERITY_WEIGHT[i.severity] || 10);
    const ph = projectHealth.find((h) => h.projectId === i.projectId);
    if (ph) {
      ph._penalty = (ph._penalty || 0) + (SEVERITY_WEIGHT[i.severity] || 10);
      ph.healthScore = Math.max(0, 100 - Math.min(95, ph._penalty));
      ph.status = statusFromScore(ph.healthScore);
    }
  });

  openRisks.forEach((r) => {
    const cat =
      r.riskCategory === 'compliance'
        ? 'compliance'
        : r.riskCategory === 'integration'
          ? 'integration'
          : r.riskCategory === 'billing'
            ? 'billing'
            : 'governance';
    issues.push(
      issue(`ct_risk_${r._id}`, {
        category: cat,
        severity: r.severity || 'medium',
        projectId: r.projectId,
        projectName: projects.find((p) => p._id === r.projectId)?.name,
        spvId: r.spvId,
        title: r.message,
        message: r.riskType,
        impact: 'Auto-detected governance risk',
        recommendedAction: r.suggestedAction || 'Review and resolve',
        href: '/app/dm-governance/risks'
      })
    );
    domainPenalty[cat] = (domainPenalty[cat] || 0) + (SEVERITY_WEIGHT[r.severity] || 10);
  });

  pendingTriggers.forEach((t) => {
    issues.push(
      issue(`ct_trig_${t._id}`, {
        category: t.triggerType === 'construction_milestone' ? 'collections' : 'billing',
        severity: t.triggerType === 'construction_milestone' ? 'high' : 'medium',
        priorityBoost: 5,
        projectId: t.projectId,
        projectName: projects.find((p) => p._id === t.projectId)?.name,
        title: 'Billing trigger pending',
        message: t.message,
        impact: 'Fee event may require invoice or phase change',
        recommendedAction: 'Review billing workspace',
        href: '/app/dm-governance/billing-workspace'
      })
    );
    domainPenalty.billing += 12;
  });

  pendingInvoices.forEach((inv) => {
    const age = daysSince(inv.updatedAt) || 0;
    issues.push(
      issue(`ct_inv_${inv._id}`, {
        category: 'governance',
        severity: inv.requiresLeadershipApproval || age > 5 ? 'high' : 'medium',
        projectId: inv.projectId,
        projectName: projects.find((p) => p._id === inv.projectId)?.name,
        title: 'Invoice awaiting approval',
        message: `${inv.invoiceNo} — ${inv.status.replace(/_/g, ' ')} (${age}d)`,
        impact: 'Blocks SPV billing and cashflow push',
        recommendedAction: 'Process approval inbox',
        href: `/app/dm-governance/invoices/${inv._id}`
      })
    );
    domainPenalty.governance += 10;
  });

  staleInvoices.forEach((inv) => {
    const due = inv.dueDate ? new Date(inv.dueDate) : null;
    if (!due || due > now) return;
    const overdue = daysSince(inv.dueDate);
    if (overdue > 15) {
      issues.push(
        issue(`ct_overdue_${inv._id}`, {
          category: 'governance',
          severity: overdue > 45 ? 'high' : 'medium',
          projectId: inv.projectId,
          projectName: projects.find((p) => p._id === inv.projectId)?.name,
          title: 'Invoice payment overdue',
          message: `${inv.invoiceNo} due ${inv.dueDate} — ${overdue}d overdue`,
          impact: 'SPV collection follow-up required',
          recommendedAction: 'Record payment or escalate accrual',
          href: `/app/dm-governance/invoices/${inv._id}`
        })
      );
      domainPenalty.governance += 8;
    }
  });

  projectHealth.forEach((ph) => {
    ph.issueCount = issues.filter((i) => i.projectId === ph.projectId).length;
    delete ph._penalty;
  });

  const seen = new Set();
  const deduped = issues
    .filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .sort((a, b) => b.priority - a.priority);

  const domainScores = {};
  Object.keys(DOMAIN_LABELS).forEach((key) => {
    const penalty = Math.min(80, domainPenalty[key] || 0);
    const score = Math.max(0, 100 - penalty);
    domainScores[key] = {
      key,
      label: DOMAIN_LABELS[key],
      score,
      status: statusFromScore(score),
      issueCount: deduped.filter((i) => i.category === key).length
    };
  });

  const totalPenalty = deduped.reduce((s, i) => s + (SEVERITY_WEIGHT[i.severity] || 5), 0);
  const portfolioScore = Math.max(0, Math.min(100, 100 - Math.min(90, Math.round(totalPenalty / Math.max(1, projects.length)))));

  const insights = [];
  if (portfolioScore < 55) insights.push('Portfolio governance health is below target — prioritise unsigned DMAs and missing billing models.');
  if (domainScores.integration.score < 70) insights.push('Integration freshness is weak — schedule weekly full sync across all projects.');
  const xappCount = crossApp.deviations.length;
  if (xappCount) {
    insights.push(
      `${xappCount} cross-app deviation(s) from Cashflow, V2/V3 planners, PreConstruction, and Execution — review source badges in the issue inbox.`
    );
  }
  if (deduped.filter((i) => i.severity === 'critical').length)
    insights.push(`${deduped.filter((i) => i.severity === 'critical').length} critical issue(s) need leadership attention today.`);
  if (!deduped.length) insights.push('No proactive issues detected — portfolio is operating within governance guardrails.');

  return {
    health: {
      portfolioScore,
      status: statusFromScore(portfolioScore),
      domains: domainScores,
      pillars: rollupPillars(domainPenalty, deduped)
    },
    issues: deduped.slice(0, 40),
    issueSummary: {
      total: deduped.length,
      critical: deduped.filter((i) => i.severity === 'critical').length,
      high: deduped.filter((i) => i.severity === 'high').length,
      medium: deduped.filter((i) => i.severity === 'medium').length,
      low: deduped.filter((i) => i.severity === 'low').length
    },
    watchlist: projectHealth.sort((a, b) => a.healthScore - b.healthScore).slice(0, 8),
    insights,
    scannedAt: now.toISOString(),
    riskScanRan: !!opts.runRiskScan,
    crossApp: {
      deviationCount: crossApp.deviations.length,
      appSignals: crossApp.appSignals,
      loadedAt: crossApp.loadedAt
    }
  };
}
