import { Router } from 'express';
import { ObjectId } from 'mongodb';
import TravelRateCard from '../../../models/adminServices/travel/RateCard.js';
import TravelPolicyConfig from '../../../models/adminServices/travel/PolicyConfig.js';
import TravelApprovalChain from '../../../models/adminServices/travel/ApprovalChain.js';
import { canTravelAdmin, requirePerm } from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { VEHICLE_TYPES, ENTITY_TAGS, PERMS, APP_ID } from '../../../lib/adminServices/constants.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';
import { ensureMongo } from '../../../lib/mongo.js';

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
    const overlap = await TravelRateCard.findOne(notDeletedFilter({
      entityTag,
      vehicleType,
      effectiveFrom: { $lte: to || new Date('9999-12-31') },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: from } }]
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

router.get('/chains', async (_req, res) => {
  try {
    const chains = await TravelApprovalChain.find(notDeletedFilter({ isActive: true })).sort({ updatedAt: -1 }).lean();
    const db = await ensureMongo();
    const ids = [...new Set(chains.flatMap((c) => [
      String(c.employeeUserId),
      ...(c.levels || []).map((l) => String(l.approverUserId))
    ]))];
    const oids = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const users = db && oids.length
      ? await db.collection('auth_users').find({ _id: { $in: oids } }).project({ email: 1, name: 1 }).toArray()
      : [];
    const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
    res.json({
      chains: chains.map((c) => ({
        ...c,
        employee: byId[String(c.employeeUserId)] || null,
        levels: (c.levels || []).map((l) => ({
          ...l,
          approver: byId[String(l.approverUserId)] || null
        }))
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/chains', async (req, res) => {
  try {
    const { employeeUserId, levels, entityTag, notes } = req.body || {};
    if (!employeeUserId) return res.status(400).json({ error: 'employeeUserId required' });
    if (!Array.isArray(levels) || levels.length < 1) {
      return res.status(400).json({ error: 'levels[] required (L1…Ln)' });
    }
    const normalized = levels.map((l, i) => ({
      level: Number(l.level) || i + 1,
      approverUserId: l.approverUserId,
      label: l.label || `L${i + 1}`
    }));
    for (const l of normalized) {
      if (!l.approverUserId) return res.status(400).json({ error: 'Each level needs approverUserId' });
      if (String(l.approverUserId) === String(employeeUserId)) {
        return res.status(400).json({ error: 'Approver cannot be the employee (BR-04)' });
      }
    }
    const scope = entityTag || '';
    const doc = await TravelApprovalChain.findOneAndUpdate(
      notDeletedFilter({ employeeUserId, entityTag: scope }),
      {
        $set: {
          employeeUserId,
          entityTag: scope,
          levels: normalized,
          notes: notes || '',
          isActive: true,
          updatedBy: req.authUser.id || req.authUser._id
        },
        $setOnInsert: { createdBy: req.authUser.id || req.authUser._id }
      },
      { upsert: true, new: true }
    );

    const db = await ensureMongo();
    if (db) {
      for (const l of normalized) {
        if (!ObjectId.isValid(String(l.approverUserId))) continue;
        await db.collection('auth_users').updateOne(
          { _id: new ObjectId(String(l.approverUserId)) },
          {
            $addToSet: {
              allowedApps: APP_ID,
              permissions: { $each: [PERMS.TRAVEL_VIEW, PERMS.TRAVEL_APPROVE] }
            }
          }
        );
      }
    }

    await writeAdminServicesAudit({
      entityType: 'travelApprovalChain',
      entityId: String(doc._id),
      action: 'upsert',
      userId: req.authUser.id,
      userEmail: req.authUser.email,
      after: { employeeUserId, levels: normalized }
    });
    res.json({ chain: doc });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/users-lookup', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const db = await ensureMongo();
    if (!db) return res.json({ users: [] });
    const filter = { status: { $ne: 'disabled' } };
    if (q) {
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { email: { $regex: esc, $options: 'i' } },
        { name: { $regex: esc, $options: 'i' } }
      ];
    }
    const users = await db.collection('auth_users').find(filter)
      .project({ email: 1, name: 1 }).limit(30).toArray();
    res.json({
      users: users.map((u) => ({ id: String(u._id), email: u.email, name: u.name }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
