import { Router } from 'express';
import mongoose from 'mongoose';
import HiringOffer from '../../models/hiring/Offer.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringRequisition from '../../models/hiring/Requisition.js';
import { attachHiringUser, actorId, logHiringActivity } from '../../lib/hiring/activity.js';
import { requireHiringWrite } from '../../lib/hiring/access.js';
import { assertPaise, notDeletedFilter } from '../../lib/hiring/validate.js';
import { isValidStageTransition } from '../../lib/hiring/stages.js';

const router = Router();

router.use(attachHiringUser);

async function onOfferAccepted(offer, by) {
  const candidate = await HiringCandidate.findById(offer.candidateId);
  if (!candidate) return;
  if (candidate.currentStageNumber !== 7) {
    const from = candidate.currentStageNumber;
    candidate.currentStageNumber = 7;
    candidate.stageEnteredAt = new Date();
    await candidate.save();
    await logHiringActivity({
      refType: 'candidate',
      refId: candidate._id,
      action: 'hired',
      detail: `offer accepted (${from} → 7)`,
      by
    });
  }
  const requisition = await HiringRequisition.findById(offer.requisitionId);
  if (!requisition) return;
  const hired = await HiringCandidate.countDocuments({
    requisitionId: requisition._id,
    isDeleted: false,
    currentStageNumber: 7
  });
  if (hired >= (requisition.headcount || 1) && requisition.status !== 'Closed') {
    await logHiringActivity({
      refType: 'requisition',
      refId: requisition._id,
      action: 'headcount_filled',
      detail: `${hired}/${requisition.headcount}`,
      by
    });
  }
}

router.get('/:id', async (req, res) => {
  try {
    const offer = await HiringOffer.findOne(notDeletedFilter({ _id: req.params.id })).lean();
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    res.json(offer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireHiringWrite, async (req, res) => {
  try {
    const candidate = await HiringCandidate.findOne(notDeletedFilter({ _id: req.body.candidateId }));
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    const existing = await HiringOffer.findOne({ candidateId: candidate._id, isDeleted: false });
    if (existing) return res.status(422).json({ error: 'Offer already exists for candidate' });
    const requisition = await HiringRequisition.findById(candidate.requisitionId).lean();
    const createdBy = actorId(req);
    const doc = await HiringOffer.create({
      candidateId: candidate._id,
      requisitionId: candidate.requisitionId,
      entityTag: requisition.entityTag,
      fixedCtcPaise: assertPaise(req.body.fixedCtcPaise, 'fixedCtcPaise'),
      variablePaise: assertPaise(req.body.variablePaise, 'variablePaise') ?? 0,
      designationOffered: req.body.designationOffered,
      joiningDate: req.body.joiningDate ? new Date(req.body.joiningDate) : null,
      status: 'Draft',
      offerLetterDriveFileId: req.body.offerLetterDriveFileId,
      createdBy: new mongoose.Types.ObjectId(createdBy)
    });
    if (isValidStageTransition(candidate.currentStageNumber, 6)) {
      candidate.currentStageNumber = 6;
      candidate.stageEnteredAt = new Date();
      await candidate.save();
    }
    await logHiringActivity({
      refType: 'offer',
      refId: doc._id,
      action: 'created',
      by: createdBy
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', requireHiringWrite, async (req, res) => {
  try {
    const doc = await HiringOffer.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Offer not found' });
    const prev = doc.status;
    const fields = ['designationOffered', 'joiningDate', 'offerLetterDriveFileId', 'status'];
    for (const key of fields) {
      if (req.body[key] !== undefined) {
        if (key === 'joiningDate') doc.joiningDate = req.body.joiningDate ? new Date(req.body.joiningDate) : null;
        else doc[key] = req.body[key];
      }
    }
    if (req.body.fixedCtcPaise !== undefined) doc.fixedCtcPaise = assertPaise(req.body.fixedCtcPaise, 'fixedCtcPaise');
    if (req.body.variablePaise !== undefined) doc.variablePaise = assertPaise(req.body.variablePaise, 'variablePaise') ?? 0;
    await doc.save();
    const by = actorId(req);
    if (req.body.status === 'Accepted' && prev !== 'Accepted') {
      await onOfferAccepted(doc, by);
    }
    await logHiringActivity({
      refType: 'offer',
      refId: doc._id,
      action: 'status_change',
      detail: doc.status,
      by
    });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
