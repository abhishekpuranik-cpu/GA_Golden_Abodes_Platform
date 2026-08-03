import { Router } from 'express';
import TravelRateCard from '../../../models/adminServices/travel/RateCard.js';
import TravelPolicyConfig from '../../../models/adminServices/travel/PolicyConfig.js';
import { canTravelAdmin, requirePerm } from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { VEHICLE_TYPES, ENTITY_TAGS } from '../../../lib/adminServices/constants.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';

const router = Router();

router.use(requirePerm(canTravelAdmin, 'TRAVEL.ADMIN required'));

router.get('/policy', async (req, res) => {
  try {
    const entityTag = req.query.entityTag || 'PAD';
    const policy = await TravelPolicyConfig.findOne(notDeletedFilter({ entityTag })).lean();
    res.json({ policy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/policy/:entityTag', async (req, res) => {
  try {
    if (!ENTITY_TAGS.includes(req.params.entityTag)) {
      return res.status(400).json({ error: 'Invalid entityTag' });
    }
    const doc = await TravelPolicyConfig.findOne(notDeletedFilter({ entityTag: req.params.entityTag }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const fields = [
      'roadFactor', 'dailyCapKm', 'monthlyCapKm', 'backdatingWindowDays',
      'homeToOfficeClaimable', 'requireReceiptAboveAncillaryPaise',
      'finalApproverUserId', 'alternateApproverUserId', 'verifierAssignments'
    ];
    for (const f of fields) {
      if (req.body[f] !== undefined) doc[f] = req.body[f];
    }
    doc.updatedBy = req.authUser.id || req.authUser._id;
    await doc.save();
    await writeAdminServicesAudit({
      entityType: 'travelPolicyConfig',
      entityId: String(doc._id),
      action: 'update',
      userId: req.authUser.id,
      userEmail: req.authUser.email,
      after: req.body
    });
    res.json({ policy: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/rates', async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.entityTag) filter.entityTag = req.query.entityTag;
    const rates = await TravelRateCard.find(filter).sort({ effectiveFrom: -1 }).lean();
    res.json({ rates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rates', async (req, res) => {
  try {
    const { entityTag, vehicleType, ratePerKmPaise, effectiveFrom, effectiveTo, notes } = req.body || {};
    if (!ENTITY_TAGS.includes(entityTag)) return res.status(400).json({ error: 'Invalid entityTag' });
    if (!VEHICLE_TYPES.includes(vehicleType)) return res.status(400).json({ error: 'Invalid vehicleType' });
    const from = new Date(effectiveFrom);
    const to = effectiveTo ? new Date(effectiveTo) : null;

    // No overlapping active rows
    const overlap = await TravelRateCard.findOne(notDeletedFilter({
      entityTag,
      vehicleType,
      effectiveFrom: { $lte: to || new Date('9999-12-31') },
      $or: [
        { effectiveTo: null },
        { effectiveTo: { $gte: from } }
      ]
    }));
    if (overlap) {
      return res.status(409).json({ error: 'Rate card overlaps existing row for entity+vehicle', existingId: overlap._id });
    }

    const doc = await TravelRateCard.create({
      entityTag,
      vehicleType,
      ratePerKmPaise: Math.round(Number(ratePerKmPaise)),
      effectiveFrom: from,
      effectiveTo: to,
      notes: notes || '',
      createdBy: req.authUser.id || req.authUser._id
    });
    res.status(201).json({ rate: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
