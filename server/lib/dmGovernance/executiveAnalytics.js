import { DM_COLLECTIONS } from './collections.js';
import { buildProjectFilter } from './access.js';
import { sumProjectBillingTotals } from './calculationEngine.js';

function num(v) {
  return Number(v) || 0;
}

/**
 * Executive portfolio analytics for leadership view.
 * @param {import('mongodb').Db} db
 * @param {object} user
 */
export async function buildExecutiveSummary(db, user) {
  const filter = buildProjectFilter(user);
  const projects = await db.collection(DM_COLLECTIONS.projects).find(filter).toArray();
  const spvs = await db.collection(DM_COLLECTIONS.spvs).find({ billingStatus: { $ne: 'archived' } }).toArray();

  let totalTopline = 0;
  let totalCollections = 0;
  let totalDmCap = 0;
  let totalBilled = 0;
  let totalPaid = 0;
  let weightedCapUtil = 0;

  const phaseBreakdown = {};
  const projectRows = [];

  for (const p of projects) {
    const totals = await sumProjectBillingTotals(db, p._id);
    const eligibleBase =
      p.eligibleBaseType === 'collections_ttd'
        ? num(p.collectionsTtd)
        : p.eligibleBaseType === 'agreement_value'
          ? num(p.agreementValue, num(p.toplineGdv))
          : num(p.toplineGdv);
    const dmCap = eligibleBase * (num(p.dmCapPct, 10) / 100);
    const billed = totals.dmFeeBilledTtd;
    const paid = totals.dmFeePaidTtd;
    const capUtil = dmCap > 0 ? (billed / dmCap) * 100 : 0;

    totalTopline += num(p.toplineGdv);
    totalCollections += num(p.collectionsTtd);
    totalDmCap += dmCap;
    totalBilled += billed;
    totalPaid += paid;
    weightedCapUtil += capUtil * dmCap;

    const phase = p.revenueStatus || 'pre_revenue';
    phaseBreakdown[phase] = (phaseBreakdown[phase] || 0) + 1;

    const milestones = p.integrationSnapshot?.constructionMilestones;
    projectRows.push({
      projectId: p._id,
      name: p.name,
      toplineGdv: num(p.toplineGdv),
      collectionsTtd: num(p.collectionsTtd),
      collectionsPct: num(p.toplineGdv) > 0 ? (num(p.collectionsTtd) / num(p.toplineGdv)) * 100 : 0,
      dmCap,
      dmFeeBilled: billed,
      dmFeePaid: paid,
      recoveryRate: billed > 0 ? (paid / billed) * 100 : 0,
      capUtilPct: Math.round(capUtil * 10) / 10,
      constructionProgressPct: num(p.constructionProgressPct),
      latestMilestone: milestones?.latestAchieved?.label || '—',
      revenueStatus: phase
    });
  }

  const invoices = await db
    .collection(DM_COLLECTIONS.invoices)
    .find({ status: { $nin: ['REJECTED', 'DRAFT'] } })
    .sort({ periodMonth: 1 })
    .toArray();

  const monthlyTrend = {};
  invoices.forEach((inv) => {
    const m = inv.periodMonth || 'unknown';
    if (!monthlyTrend[m]) monthlyTrend[m] = { month: m, billed: 0, paid: 0, count: 0 };
    monthlyTrend[m].billed += num(inv.insideCapAmount) + num(inv.outsideCapAmount);
    monthlyTrend[m].paid += num(inv.paidAmount);
    monthlyTrend[m].count += 1;
  });

  const spvRows = spvs.map((s) => {
    const linked = projectRows.filter((p) => {
      const proj = projects.find((x) => x._id === p.projectId);
      return (proj?.spvIds || []).includes(s._id);
    });
    const billed = linked.reduce((sum, r) => sum + r.dmFeeBilled, 0);
    const paid = linked.reduce((sum, r) => sum + r.dmFeePaid, 0);
    return {
      spvId: s._id,
      spvName: s.spvName,
      projectCount: linked.length,
      dmFeeBilled: billed,
      dmFeePaid: paid,
      recoveryRate: billed > 0 ? Math.round((paid / billed) * 1000) / 10 : 0
    };
  });

  return {
    portfolio: {
      projectCount: projects.length,
      spvCount: spvs.length,
      totalTopline,
      totalCollections,
      collectionRate: totalTopline > 0 ? (totalCollections / totalTopline) * 100 : 0,
      totalDmCap,
      totalBilled,
      totalPaid,
      totalAccrued: Math.max(0, totalBilled - totalPaid),
      portfolioRecoveryRate: totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0,
      weightedCapUtilPct: totalDmCap > 0 ? weightedCapUtil / totalDmCap : 0,
      balanceEligible: Math.max(0, totalDmCap - totalBilled)
    },
    phaseBreakdown,
    projectRows: projectRows.sort((a, b) => b.capUtilPct - a.capUtilPct),
    spvRows,
    monthlyTrend: Object.values(monthlyTrend).sort((a, b) => a.month.localeCompare(b.month)),
    generatedAt: new Date().toISOString()
  };
}
