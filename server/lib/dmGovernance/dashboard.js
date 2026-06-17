import { DM_COLLECTIONS } from './collections.js';
import { buildProjectFilter } from './access.js';
import { sumProjectBillingTotals } from './calculationEngine.js';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build consolidated dashboard metrics.
 * @param {import('mongodb').Db} db
 * @param {object} user
 */
export async function buildDashboardConsolidated(db, user) {
  const filter = buildProjectFilter(user);
  const projects = await db.collection(DM_COLLECTIONS.projects).find(filter).toArray();
  const spvs = await db.collection(DM_COLLECTIONS.spvs).find({ billingStatus: { $ne: 'archived' } }).toArray();

  let totalTopline = 0;
  let totalCollections = 0;
  let maxEligibleDmFee = 0;
  let dmFeeBilled = 0;
  let dmFeePaid = 0;
  let preRevenueOutstanding = 0;

  const projectCards = await Promise.all(
    projects.map(async (p) => {
      const totals = await sumProjectBillingTotals(db, p._id);
      const billed = totals.dmFeeBilledTtd;
      const paid = totals.dmFeePaidTtd;
      const outstanding = Math.max(0, billed - paid);

      const eligibleBase =
        p.eligibleBaseType === 'collections_ttd'
          ? num(p.collectionsTtd)
          : p.eligibleBaseType === 'agreement_value'
            ? num(p.agreementValue, num(p.toplineGdv))
            : num(p.toplineGdv);
      const capPct = num(p.dmCapPct, 10) / 100;
      const dmCap = eligibleBase * capPct;

      totalTopline += num(p.toplineGdv);
      totalCollections += num(p.collectionsTtd);
      maxEligibleDmFee += dmCap;
      dmFeeBilled += billed;
      dmFeePaid += paid;
      if (p.revenueStatus === 'pre_revenue') preRevenueOutstanding += outstanding;

      const capUtilPct = dmCap > 0 ? (billed / dmCap) * 100 : 0;
      let riskStatus = p.riskStatus || 'green';
      if (!p.activeBillingConfigId) riskStatus = 'red';
      else if (capUtilPct >= 90) riskStatus = 'amber';
      else if (outstanding > 0 && p.revenueStatus === 'pre_revenue') riskStatus = 'amber';

      return {
        projectId: p._id,
        projectCode: p.projectCode,
        name: p.name,
        spvIds: p.spvIds || [],
        projectPhase: p.projectPhase,
        revenueStatus: p.revenueStatus,
        toplineGdv: num(p.toplineGdv),
        collectionsTtd: num(p.collectionsTtd),
        constructionProgressPct: num(p.constructionProgressPct),
        dmCap,
        dmFeeBilled: billed,
        dmFeePaid: paid,
        dmFeeOutstanding: outstanding,
        balanceDmEligible: Math.max(0, dmCap - billed),
        billingModelType: p.billingModelType || 'HYBRID_GA',
        capUtilPct: Math.round(capUtilPct * 10) / 10,
        riskStatus,
        nextBillingTrigger:
          p.revenueStatus === 'pre_revenue' ? 'Monthly retainer' : 'Collection-linked slab',
        launchStatus: p.launchDate ? 'launched' : 'pre_launch'
      };
    })
  );

  const spvCards = spvs.map((s) => {
    const linked = projectCards.filter((p) => (p.spvIds || []).includes(s._id));
    const billed = linked.reduce((sum, p) => sum + p.dmFeeBilled, 0);
    const paid = linked.reduce((sum, p) => sum + p.dmFeePaid, 0);
    return {
      spvId: s._id,
      spvCode: s.spvCode,
      spvName: s.spvName,
      projectCount: linked.length,
      dmFeeBilled: billed,
      dmFeePaid: paid,
      dmFeeOutstanding: Math.max(0, billed - paid),
      billingStatus: s.billingStatus,
      agreementStatus: s.agreementStatus
    };
  });

  const pendingApprovals = await db.collection(DM_COLLECTIONS.invoices).countDocuments({
    status: { $in: ['FINANCE_REVIEW', 'PROJECT_REVIEW'] }
  });

  return {
    summary: {
      activeSpvs: spvs.filter((s) => s.billingStatus === 'active').length,
      activeProjects: projects.length,
      totalTopline,
      totalCollections,
      maxEligibleDmFee,
      dmFeeBilledTtd: dmFeeBilled,
      dmFeePaidTtd: dmFeePaid,
      dmFeeAccrued: Math.max(0, dmFeeBilled - dmFeePaid),
      balanceDmEligible: Math.max(0, maxEligibleDmFee - dmFeeBilled),
      preRevenueOutstanding,
      costPlusOutstanding: 0,
      totalGstBilled: 0,
      exceptionsPending: projects.filter((p) => !p.activeBillingConfigId).length,
      delayedPayments: projectCards.filter((p) => p.dmFeeOutstanding > 0).length,
      pendingApprovals
    },
    projectCards,
    spvCards,
    charts: {
      dmBilledVsCap: projectCards.map((p) => ({
        name: p.name,
        billed: p.dmFeeBilled,
        cap: p.dmCap
      })),
      collectionsVsRecovery: projectCards.map((p) => ({
        name: p.name,
        collections: p.collectionsTtd,
        billed: p.dmFeeBilled
      }))
    },
    generatedAt: new Date().toISOString()
  };
}
