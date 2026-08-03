import { Router } from 'express';
import TravelTrip from '../../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../../models/adminServices/travel/Claim.js';
import { canApprove, canVerify, requirePerm } from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';

const router = Router();

function uid(user) {
  return user?.id || user?._id;
}

router.get('/pending', requirePerm((u) => canApprove(u) || canVerify(u), 'VERIFY or APPROVE required'), async (req, res) => {
  try {
    const statuses = canApprove(req.authUser) ? ['VERIFIED', 'SUBMITTED'] : ['SUBMITTED'];
    const claims = await TravelClaim.find(notDeletedFilter({ status: { $in: statuses } }))
      .sort({ claimPeriod: -1 })
      .limit(100)
      .lean();
    res.json({ claims });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/exceptions', requirePerm((u) => canApprove(u) || canVerify(u), 'VERIFY or APPROVE required'), async (req, res) => {
  try {
    const trips = await TravelTrip.find(notDeletedFilter({
      exceptionFlags: { $exists: true, $ne: [] },
      status: { $nin: ['REJECTED', 'DRAFT'] }
    })).limit(200).lean();

    const grouped = {};
    for (const t of trips) {
      for (const f of t.exceptionFlags || []) {
        const resolved = (t.exceptionResolutions || []).some(
          (r) => r.flag === f && (r.resolution === 'accepted' || r.resolution === 'rejected')
        );
        if (resolved) continue;
        if (!grouped[f]) grouped[f] = [];
        grouped[f].push(t);
      }
    }
    res.json({ exceptions: grouped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function resolveException(req, res, resolution) {
  try {
    if (!canApprove(req.authUser)) return res.status(403).json({ error: 'APPROVE required' });
    const comment = String(req.body?.comment || '').trim();
    if (!comment) return res.status(400).json({ error: 'comment required' });
    const trip = await TravelTrip.findOne(notDeletedFilter({ _id: req.params.tripId }));
    if (!trip) return res.status(404).json({ error: 'Not found' });
    const flags = trip.exceptionFlags || [];
    for (const flag of flags) {
      const already = (trip.exceptionResolutions || []).find((r) => r.flag === flag);
      if (!already) {
        trip.exceptionResolutions.push({
          flag,
          resolution,
          by: uid(req.authUser),
          comment,
          at: new Date()
        });
      }
    }
    if (resolution === 'rejected') {
      trip.status = 'REJECTED';
      trip.stateHistory.push({
        from: trip.status,
        to: 'REJECTED',
        action: 'exception_reject',
        by: uid(req.authUser),
        comment,
        at: new Date()
      });
    }
    await trip.save();
    await writeAdminServicesAudit({
      entityType: 'travelTrip',
      entityId: String(trip._id),
      action: `exception_${resolution}`,
      userId: uid(req.authUser),
      userEmail: req.authUser.email,
      reason: comment
    });
    res.json({ trip });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

router.post('/exceptions/:tripId/accept', (req, res) => resolveException(req, res, 'accepted'));
router.post('/exceptions/:tripId/reject', (req, res) => resolveException(req, res, 'rejected'));

export default router;
