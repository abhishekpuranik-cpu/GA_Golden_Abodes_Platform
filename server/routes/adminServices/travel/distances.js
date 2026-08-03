import { Router } from 'express';
import TravelDistance from '../../../models/adminServices/travel/Distance.js';
import TravelLocation from '../../../models/adminServices/travel/Location.js';
import { canTravelAdmin, canApprove, requirePerm } from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { haversineMetres, pairKey } from '../../../lib/adminServices/haversine.js';
import { computeRouteDistance, getPolicy } from '../../../lib/adminServices/travelRules.js';
import { DISTANCE_SOURCES } from '../../../lib/adminServices/constants.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';

const router = Router();

router.get('/preview', async (req, res) => {
  try {
    const route = String(req.query.route || '').split(',').map((s) => s.trim()).filter(Boolean);
    const roundTrip = String(req.query.roundTrip || '') === 'true';
    const entityTag = req.query.entityTag || 'PAD';
    const policy = await getPolicy(entityTag);
    const preview = await computeRouteDistance({
      routeIds: route,
      isRoundTrip: roundTrip,
      roadFactor: policy.roadFactor,
      user: req.authUser
    });
    res.json(preview);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.verified === 'true') filter.isVerified = true;
    if (req.query.verified === 'false') filter.isVerified = false;
    const sort = req.query.sort === 'usage' ? { claimCount: -1 } : { updatedAt: -1 };
    const rows = await TravelDistance.find(filter).sort(sort).limit(500).lean();
    const locIds = [...new Set(rows.flatMap((r) => [String(r.locationAId), String(r.locationBId)]))];
    const locs = await TravelLocation.find({ _id: { $in: locIds } }).lean();
    const byId = Object.fromEntries(locs.map((l) => [String(l._id), l]));
    const distances = rows.map((r) => ({
      ...r,
      locationA: byId[String(r.locationAId)] || null,
      locationB: byId[String(r.locationBId)] || null
    }));
    res.json({ distances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requirePerm((u) => canTravelAdmin(u) || canApprove(u), 'ADMIN or APPROVE required'), async (req, res) => {
  try {
    const { locationAId, locationBId, entityTag } = req.body || {};
    if (!locationAId || !locationBId) return res.status(400).json({ error: 'locationAId and locationBId required' });
    const [a, b] = await Promise.all([
      TravelLocation.findOne(notDeletedFilter({ _id: locationAId })),
      TravelLocation.findOne(notDeletedFilter({ _id: locationBId }))
    ]);
    if (!a || !b) return res.status(404).json({ error: 'Location not found' });
    const key = pairKey(locationAId, locationBId);
    const existing = await TravelDistance.findOne(notDeletedFilter({ pairKey: key }));
    if (existing) return res.status(409).json({ error: 'Pair already exists', distance: existing });
    const policy = await getPolicy(entityTag || a.entityTag);
    const straight = haversineMetres(a.lat, a.lng, b.lat, b.lng);
    const doc = await TravelDistance.create({
      pairKey: key,
      locationAId: String(locationAId) < String(locationBId) ? locationAId : locationBId,
      locationBId: String(locationAId) < String(locationBId) ? locationBId : locationAId,
      straightLineMetres: straight,
      distanceMetres: Math.round(straight * (policy.roadFactor || 1.3)),
      isVerified: false,
      source: 'ESTIMATE',
      createdBy: req.authUser.id || req.authUser._id
    });
    res.status(201).json({ distance: doc });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/:id/verify', requirePerm((u) => canTravelAdmin(u) || canApprove(u), 'ADMIN or APPROVE required'), async (req, res) => {
  try {
    const { distanceMetres, source, reason } = req.body || {};
    if (!DISTANCE_SOURCES.includes(source)) return res.status(400).json({ error: 'Invalid source' });
    if (distanceMetres == null) return res.status(400).json({ error: 'distanceMetres required' });
    const doc = await TravelDistance.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.isVerified && !String(reason || '').trim()) {
      return res.status(400).json({ error: 'reason required when changing a verified distance' });
    }
    doc.revisionHistory.push({
      distanceMetres: doc.distanceMetres,
      source: doc.source,
      changedBy: req.authUser.id || req.authUser._id,
      changedAt: new Date(),
      reason: reason || 'verify'
    });
    doc.distanceMetres = Math.round(Number(distanceMetres));
    doc.source = source;
    doc.isVerified = true;
    doc.verifiedBy = req.authUser.id || req.authUser._id;
    doc.verifiedAt = new Date();
    doc.updatedBy = req.authUser.id || req.authUser._id;
    await doc.save();

    // Affects only DRAFT/SUBMITTED — never restates APPROVED/PAID (§4.2)
    await writeAdminServicesAudit({
      entityType: 'travelDistance',
      entityId: String(doc._id),
      action: 'verify',
      userId: req.authUser.id,
      userEmail: req.authUser.email,
      reason,
      after: { distanceMetres: doc.distanceMetres, isVerified: true }
    });
    res.json({ distance: doc });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/:id/unverify', requirePerm((u) => canTravelAdmin(u) || canApprove(u), 'ADMIN or APPROVE required'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'reason required' });
    const doc = await TravelDistance.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    doc.revisionHistory.push({
      distanceMetres: doc.distanceMetres,
      source: doc.source,
      changedBy: req.authUser.id || req.authUser._id,
      changedAt: new Date(),
      reason
    });
    doc.isVerified = false;
    doc.verifiedBy = null;
    doc.verifiedAt = null;
    await doc.save();
    res.json({ distance: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
