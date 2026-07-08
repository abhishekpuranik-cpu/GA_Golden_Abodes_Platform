import { Router } from 'express';
import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringOffer from '../../models/hiring/Offer.js';
import { notDeletedFilter } from '../../lib/hiring/validate.js';
import { STAGE_LABELS } from '../../lib/hiring/constants.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const reqFilter = notDeletedFilter();
    if (req.query.entityTag) reqFilter.entityTag = req.query.entityTag;
    const requisitions = await HiringRequisition.find(reqFilter).select('_id reqCode role status headcount').lean();

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
        pipeline,
        hired,
        headcount: r.headcount
      };
    }));

    const now = Date.now();
    const candidates = await HiringCandidate.find(notDeletedFilter()).select('currentStageNumber stageEnteredAt source').lean();
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
      { $match: notDeletedFilter() },
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]);

    const offers = await HiringOffer.find(notDeletedFilter()).select('status').lean();
    const offerStats = {
      total: offers.length,
      sent: offers.filter((o) => o.status === 'Sent').length,
      accepted: offers.filter((o) => o.status === 'Accepted').length,
      declined: offers.filter((o) => o.status === 'Declined').length,
      conversionRate: offers.length
        ? Math.round((offers.filter((o) => o.status === 'Accepted').length / offers.length) * 1000) / 10
        : 0
    };

    res.json({
      funnelByRequisition: funnelByReq,
      timeInStage,
      sourceMix: sourceMix.map((r) => ({ source: r._id, count: r.count })),
      offerConversion: offerStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
