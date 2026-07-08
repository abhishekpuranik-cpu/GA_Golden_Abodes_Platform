import { Router } from 'express';
import mongoose from 'mongoose';
import HiringInterview from '../../models/hiring/Interview.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringRequisition from '../../models/hiring/Requisition.js';
import { attachHiringUser, actorId, logHiringActivity } from '../../lib/hiring/activity.js';
import { requireHiringWrite } from '../../lib/hiring/access.js';
import { notDeletedFilter } from '../../lib/hiring/validate.js';
import { isValidStageTransition } from '../../lib/hiring/stages.js';

const router = Router();

router.use(attachHiringUser);

async function applyInterviewOutcome(candidate, outcome) {
  if (outcome === 'Advance') {
    const next = candidate.currentStageNumber < 4 ? 4 : Math.min(candidate.currentStageNumber + 1, 5);
    if (isValidStageTransition(candidate.currentStageNumber, next)) {
      candidate.currentStageNumber = next;
      candidate.stageEnteredAt = new Date();
    }
  } else if (outcome === 'Reject' && isValidStageTransition(candidate.currentStageNumber, 8)) {
    candidate.currentStageNumber = 8;
    candidate.stageEnteredAt = new Date();
  }
  await candidate.save();
}

router.get('/', async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.requisitionId) filter.requisitionId = req.query.requisitionId;
    if (req.query.upcoming === 'true') {
      filter.scheduledAt = { $gte: new Date() };
      filter.outcome = 'Pending';
    }
    const interviews = await HiringInterview.find(filter).sort({ scheduledAt: 1 }).lean();
    const candIds = [...new Set(interviews.map((i) => String(i.candidateId)))];
    const candidates = await HiringCandidate.find({ _id: { $in: candIds } }).select('name requisitionId').lean();
    const candMap = Object.fromEntries(candidates.map((c) => [String(c._id), c]));
    const enriched = interviews.map((i) => ({
      ...i,
      candidateName: candMap[String(i.candidateId)]?.name
    }));
    res.json({ interviews: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireHiringWrite, async (req, res) => {
  try {
    const candidate = await HiringCandidate.findOne(notDeletedFilter({ _id: req.body.candidateId }));
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    const requisition = await HiringRequisition.findById(candidate.requisitionId).lean();
    const createdBy = actorId(req);
    const doc = await HiringInterview.create({
      candidateId: candidate._id,
      requisitionId: candidate.requisitionId,
      entityTag: requisition.entityTag,
      round: req.body.round,
      panel: req.body.panel || [],
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
      mode: req.body.mode || 'in-person',
      scorecard: req.body.scorecard || [],
      createdBy: new mongoose.Types.ObjectId(createdBy)
    });
    await logHiringActivity({
      refType: 'interview',
      refId: doc._id,
      action: 'scheduled',
      detail: `round ${doc.round}`,
      by: createdBy
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', requireHiringWrite, async (req, res) => {
  try {
    const doc = await HiringInterview.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Interview not found' });
    if (req.body.panel) doc.panel = req.body.panel;
    if (req.body.scheduledAt) doc.scheduledAt = new Date(req.body.scheduledAt);
    if (req.body.mode) doc.mode = req.body.mode;
    if (req.body.scorecard) doc.scorecard = req.body.scorecard;
    const prevOutcome = doc.outcome;
    if (req.body.outcome) doc.outcome = req.body.outcome;
    await doc.save();
    if (req.body.outcome && req.body.outcome !== prevOutcome && ['Advance', 'Reject'].includes(req.body.outcome)) {
      const candidate = await HiringCandidate.findById(doc.candidateId);
      if (candidate) {
        await applyInterviewOutcome(candidate, req.body.outcome);
        await logHiringActivity({
          refType: 'candidate',
          refId: candidate._id,
          action: 'interview_outcome',
          detail: req.body.outcome,
          by: actorId(req)
        });
      }
    }
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
