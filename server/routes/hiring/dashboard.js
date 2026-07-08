import { Router } from 'express';
import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringOffer from '../../models/hiring/Offer.js';
import HiringInterview from '../../models/hiring/Interview.js';
import { notDeletedFilter } from '../../lib/hiring/validate.js';
import { STAGE_LABELS } from '../../lib/hiring/constants.js';
import { buildReqFilter } from './reports.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const reqFilter = buildReqFilter(req.query);
    const requisitions = await HiringRequisition.find(reqFilter).select('_id reqCode role status headcount location projectName entityTag department bandMinPaise bandMaxPaise createdAt fulfilledAt').lean();

    const candFilter = notDeletedFilter();
    if (req.query.entityTag) candFilter.entityTag = req.query.entityTag;
    if (req.query.location || req.query.projectName || req.query.department) {
      const reqIds = requisitions.map((r) => r._id);
      candFilter.requisitionId = { $in: reqIds };
    }

    const funnelByReq = await Promise.all(requisitions.map(async (r) => {
      const stages = await HiringCandidate.aggregate([
        { $match: { requisitionId: r._id, isDeleted: false } },
        { $group: { _id: '$currentStageNumber', count: { $sum: 1 } } }
      ]);
      const pipeline = {};
      stages.forEach((s) => { pipeline[s._id] = s.count; });
      const hired = pipeline[7] || 0;
      return {
        requisitionId: r._id,
        reqCode: r.reqCode,
        role: r.role,
        status: r.status,
        location: r.location,
        projectName: r.projectName,
        entityTag: r.entityTag,
        pipeline,
        hired,
        headcount: r.headcount,
        fulfilled: r.status === 'Hiring Fulfilled' || hired >= (r.headcount || 1)
      };
    }));

    const now = Date.now();
    const candidates = await HiringCandidate.find(candFilter).select('currentStageNumber stageEnteredAt source requisitionId').lean();
    const timeInStage = {};
    Object.keys(STAGE_LABELS).forEach((s) => {
      const n = Number(s);
      const inStage = candidates.filter((c) => c.currentStageNumber === n);
      if (!inStage.length) {
        timeInStage[n] = { label: STAGE_LABELS[n], avgDays: 0, count: 0 };
        return;
      }
      const totalDays = inStage.reduce((sum, c) => {
        const entered = c.stageEnteredAt ? new Date(c.stageEnteredAt).getTime() : now;
        return sum + (now - entered) / (1000 * 60 * 60 * 24);
      }, 0);
      timeInStage[n] = {
        label: STAGE_LABELS[n],
        avgDays: Math.round((totalDays / inStage.length) * 10) / 10,
        count: inStage.length
      };
    });

    const sourceMix = await HiringCandidate.aggregate([
      { $match: candFilter },
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]);

    const offers = await HiringOffer.find(notDeletedFilter()).select('status requisitionId').lean();
    const offerInScope = offers.filter((o) => {
      if (!req.query.entityTag && !req.query.location && !req.query.projectName) return true;
      return requisitions.some((r) => String(r._id) === String(o.requisitionId));
    });
    const offerStats = {
      total: offerInScope.length,
      sent: offerInScope.filter((o) => o.status === 'Sent').length,
      accepted: offerInScope.filter((o) => o.status === 'Accepted').length,
      declined: offerInScope.filter((o) => o.status === 'Declined').length,
      conversionRate: offerInScope.length
        ? Math.round((offerInScope.filter((o) => o.status === 'Accepted').length / offerInScope.length) * 1000) / 10
        : 0
    };

    const openReqs = requisitions.filter((r) => !['Closed', 'Cancelled', 'Hiring Fulfilled'].includes(r.status));
    const fulfilledReqs = requisitions.filter((r) => r.status === 'Hiring Fulfilled');
    const totalHeadcount = requisitions.reduce((s, r) => s + (r.headcount || 1), 0);
    const totalHired = funnelByReq.reduce((s, r) => s + r.hired, 0);
    const activeCandidates = candidates.filter((c) => c.currentStageNumber >= 1 && c.currentStageNumber <= 7).length;

    const upcomingInterviews = await HiringInterview.countDocuments({
      ...notDeletedFilter(),
      scheduledAt: { $gte: new Date() },
      outcome: 'Pending'
    });

    const filterOptions = await HiringRequisition.aggregate([
      { $match: notDeletedFilter() },
      {
        $group: {
          _id: null,
          locations: { $addToSet: '$location' },
          projects: { $addToSet: '$projectName' },
          departments: { $addToSet: '$department' },
          entityTags: { $addToSet: '$entityTag' }
        }
      }
    ]);
    const opts = filterOptions[0] || {};

    res.json({
      kpis: {
        openRequisitions: openReqs.length,
        fulfilledRequisitions: fulfilledReqs.length,
        totalRequisitions: requisitions.length,
        totalHeadcount,
        totalHired,
        fillRate: totalHeadcount ? Math.round((totalHired / totalHeadcount) * 1000) / 10 : 0,
        activeCandidates,
        upcomingInterviews,
        offersAccepted: offerStats.accepted,
        offerConversionRate: offerStats.conversionRate
      },
      funnelByRequisition: funnelByReq,
      timeInStage,
      sourceMix: sourceMix.map((r) => ({ source: r._id, count: r.count })),
      offerConversion: offerStats,
      filterOptions: {
        locations: (opts.locations || []).filter(Boolean).sort(),
        projects: (opts.projects || []).filter(Boolean).sort(),
        departments: (opts.departments || []).filter(Boolean).sort(),
        entityTags: (opts.entityTags || []).filter(Boolean).sort()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
