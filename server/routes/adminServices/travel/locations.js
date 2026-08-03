import { Router } from 'express';
import TravelLocation from '../../../models/adminServices/travel/Location.js';
import TravelTrip from '../../../models/adminServices/travel/Trip.js';
import { canTravelAdmin, canApprove, requirePerm } from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { LOCATION_CATEGORIES, ENTITY_TAGS } from '../../../lib/adminServices/constants.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';

const router = Router();

function parsePage(q) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query);
    const filter = notDeletedFilter();
    if (req.query.entityTag) filter.entityTag = req.query.entityTag;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) {
      filter.name = { $regex: String(req.query.search), $options: 'i' };
    }
    const [locations, total] = await Promise.all([
      TravelLocation.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      TravelLocation.countDocuments(filter)
    ]);
    res.json({ locations, page, limit, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requirePerm(canTravelAdmin, 'TRAVEL.ADMIN required'), async (req, res) => {
  try {
    const { entityTag, name, category, lat, lng, address, linkedProjectId, isActive } = req.body || {};
    if (!ENTITY_TAGS.includes(entityTag)) return res.status(400).json({ error: 'Invalid entityTag' });
    if (!LOCATION_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
    const doc = await TravelLocation.create({
      entityTag,
      name: String(name || '').trim(),
      category,
      lat: Number(lat),
      lng: Number(lng),
      address: address || '',
      linkedProjectId: linkedProjectId || null,
      isActive: isActive !== false,
      createdBy: req.authUser.id || req.authUser._id
    });
    await writeAdminServicesAudit({
      entityType: 'travelLocation',
      entityId: String(doc._id),
      action: 'create',
      userId: req.authUser.id,
      userEmail: req.authUser.email,
      after: { name: doc.name, entityTag }
    });
    res.status(201).json({ location: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Location name already exists for entity' });
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/:id', requirePerm((u) => canTravelAdmin(u) || canApprove(u), 'ADMIN or APPROVE required'), async (req, res) => {
  try {
    const doc = await TravelLocation.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const fields = ['name', 'category', 'lat', 'lng', 'address', 'linkedProjectId', 'isActive'];
    for (const f of fields) {
      if (req.body[f] !== undefined) doc[f] = req.body[f];
    }
    doc.updatedBy = req.authUser.id || req.authUser._id;
    await doc.save();
    res.json({ location: doc });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', requirePerm(canTravelAdmin, 'TRAVEL.ADMIN required'), async (req, res) => {
  try {
    const used = await TravelTrip.countDocuments(notDeletedFilter({ route: req.params.id }));
    if (used > 0) return res.status(409).json({ error: 'Location used in trips', tripCount: used });
    const doc = await TravelLocation.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    doc.deletedBy = req.authUser.id || req.authUser._id;
    await doc.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
