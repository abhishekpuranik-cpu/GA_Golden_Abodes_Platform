import { Router } from 'express';
import TravelTrip from '../../../models/adminServices/travel/Trip.js';
import {
  canClaim, canVerify, canTravelAdmin, requirePerm
} from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { buildTripComputed, assertNotSelfActor } from '../../../lib/adminServices/travelRules.js';
import { applyTransition, TRIP_TRANSITIONS } from '../../../lib/adminServices/approvalEngine.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';

const router = Router();

function uid(user) {
  return user?.id || user?._id;
}

function parsePage(q) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query);
    const filter = notDeletedFilter();
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    else if (!canVerify(req.authUser) && !canTravelAdmin(req.authUser)) {
      filter.employeeId = uid(req.authUser);
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.exception) filter.exceptionFlags = req.query.exception;
    if (req.query.period) {
      const [y, m] = String(req.query.period).split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      filter.travelDate = { $gte: start, $lt: end };
    }
    const [trips, total] = await Promise.all([
      TravelTrip.find(filter).sort({ travelDate: -1 }).skip(skip).limit(limit).lean(),
      TravelTrip.countDocuments(filter)
    ]);
    res.json({ trips, page, limit, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requirePerm((u) => canClaim(u) || canTravelAdmin(u), 'CLAIM required'), async (req, res) => {
  try {
    const body = req.body || {};
    // BR-01: discard client distance
    const employeeId = body.employeeId || uid(req.authUser);
    if (!canTravelAdmin(req.authUser) && String(employeeId) !== String(uid(req.authUser))) {
      return res.status(403).json({ error: 'Can only create trips for self' });
    }
    const computed = await buildTripComputed({
      ...body,
      employeeId,
      employeeEntityTag: body.employeeEntityTag || body.entityTag
    }, {
      user: req.authUser,
      confirmDuplicate: !!body.confirmDuplicate
    });
    const { preview, ...fields } = computed;
    const doc = await TravelTrip.create({
      ...fields,
      status: 'DRAFT',
      createdBy: uid(req.authUser)
    });
    res.status(201).json({ trip: doc, breakdown: preview });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code,
      exceptionFlags: err.exceptionFlags
    });
  }
});

router.patch('/:id', requirePerm((u) => canClaim(u) || canTravelAdmin(u), 'CLAIM required'), async (req, res) => {
  try {
    const doc = await TravelTrip.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!['DRAFT', 'RETURNED'].includes(doc.status)) {
      return res.status(409).json({ error: 'Only DRAFT/RETURNED trips can be edited' });
    }
    if (!canTravelAdmin(req.authUser) && String(doc.employeeId) !== String(uid(req.authUser))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const computed = await buildTripComputed({
      entityTag: req.body.entityTag ?? doc.entityTag,
      employeeId: doc.employeeId,
      travelDate: req.body.travelDate ?? doc.travelDate,
      purpose: req.body.purpose ?? doc.purpose,
      purposeNote: req.body.purposeNote ?? doc.purposeNote,
      vehicleType: req.body.vehicleType ?? doc.vehicleType,
      route: req.body.route ?? doc.route,
      isRoundTrip: req.body.isRoundTrip ?? doc.isRoundTrip,
      isOverride: req.body.isOverride ?? doc.isOverride,
      overrideReason: req.body.overrideReason ?? doc.overrideReason,
      claimedDistanceMetres: req.body.claimedDistanceMetres,
      distanceMetres: req.body.distanceMetres,
      ancillary: req.body.ancillary ?? doc.ancillary,
      remarks: req.body.remarks ?? doc.remarks,
      departmentId: req.body.departmentId ?? doc.departmentId,
      employeeEntityTag: req.body.employeeEntityTag || doc.entityTag
    }, { user: req.authUser, confirmDuplicate: true });

    Object.assign(doc, (({ preview, ...rest }) => rest)(computed));
    doc.updatedBy = uid(req.authUser);
    await doc.save();
    res.json({ trip: doc });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

async function transitionTrip(req, res, action) {
  try {
    const doc = await TravelTrip.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const comment = String(req.body?.comment || '');
    if ((action === 'return' || action === 'reject') && !comment.trim()) {
      return res.status(400).json({ error: 'comment required' });
    }
    if (action === 'submit') {
      if (!canClaim(req.authUser) && !canTravelAdmin(req.authUser)) {
        return res.status(403).json({ error: 'CLAIM required' });
      }
      if (String(doc.employeeId) !== String(uid(req.authUser)) && !canTravelAdmin(req.authUser)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      // Snapshot rate already on doc; keep BR-03
    }
    if (action === 'verify') {
      if (!canVerify(req.authUser)) return res.status(403).json({ error: 'VERIFY required' });
      assertNotSelfActor(uid(req.authUser), doc.employeeId, 'verify');
    }
    applyTransition(doc, TRIP_TRANSITIONS, action, { by: uid(req.authUser), comment });
    doc.updatedBy = uid(req.authUser);
    await doc.save();
    await writeAdminServicesAudit({
      entityType: 'travelTrip',
      entityId: String(doc._id),
      action,
      userId: uid(req.authUser),
      userEmail: req.authUser.email,
      reason: comment,
      after: { status: doc.status }
    });
    res.json({ trip: doc });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}

router.post('/:id/submit', (req, res) => transitionTrip(req, res, 'submit'));
router.post('/:id/verify', (req, res) => transitionTrip(req, res, 'verify'));
router.post('/:id/return', (req, res) => transitionTrip(req, res, 'return'));
router.post('/:id/reject', (req, res) => transitionTrip(req, res, 'reject'));

router.delete('/:id', requirePerm((u) => canClaim(u) || canTravelAdmin(u), 'CLAIM required'), async (req, res) => {
  try {
    const doc = await TravelTrip.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.status !== 'DRAFT') return res.status(409).json({ error: 'Only DRAFT trips can be deleted' });
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.deletedBy = uid(req.authUser);
    await doc.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
