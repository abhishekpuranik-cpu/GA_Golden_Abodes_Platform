import { Router } from 'express';
import TravelTrip from '../../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../../models/adminServices/travel/Claim.js';
import {
  canClaim, canVerify, canApprove, canSettle, canTravelAdmin, requirePerm
} from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import {
  hasUnresolvedExceptions, resolveApproverUserId, assertNotSelfActor, getPolicy
} from '../../../lib/adminServices/travelRules.js';
import { applyTransition, CLAIM_TRANSITIONS } from '../../../lib/adminServices/approvalEngine.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';

const router = Router();

function uid(user) {
  return user?.id || user?._id;
}

router.get('/', async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    else if (!canVerify(req.authUser) && !canApprove(req.authUser) && !canTravelAdmin(req.authUser)) {
      filter.employeeId = uid(req.authUser);
    }
    if (req.query.period) filter.claimPeriod = req.query.period;
    if (req.query.status) filter.status = req.query.status;
    const claims = await TravelClaim.find(filter).sort({ claimPeriod: -1 }).limit(200).lean();
    res.json({ claims });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', requirePerm((u) => canClaim(u) || canTravelAdmin(u), 'CLAIM required'), async (req, res) => {
  try {
    const employeeId = req.body?.employeeId || uid(req.authUser);
    const claimPeriod = String(req.body?.claimPeriod || '').trim();
    if (!/^\d{4}-\d{2}$/.test(claimPeriod)) {
      return res.status(400).json({ error: 'claimPeriod must be YYYY-MM' });
    }
    if (!canTravelAdmin(req.authUser) && String(employeeId) !== String(uid(req.authUser))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const existing = await TravelClaim.findOne(notDeletedFilter({ employeeId, claimPeriod }));
    if (existing) return res.status(409).json({ error: 'Claim already exists for period (BR-11)', claim: existing });

    const [y, m] = claimPeriod.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const trips = await TravelTrip.find(notDeletedFilter({
      employeeId,
      status: 'VERIFIED',
      claimId: null,
      travelDate: { $gte: start, $lt: end }
    }));
    if (!trips.length) return res.status(400).json({ error: 'No VERIFIED trips for period' });

    const entityTag = trips[0].entityTag;
    let totalDistance = 0;
    let verifiedDistance = 0;
    let fuel = 0;
    let anc = 0;
    let exc = 0;
    for (const t of trips) {
      totalDistance += t.claimedDistanceMetres || 0;
      if (t.distanceBasis === 'VERIFIED') verifiedDistance += t.claimedDistanceMetres || 0;
      fuel += t.fuelAmountPaise || 0;
      anc += t.ancillaryTotalPaise || 0;
      if ((t.exceptionFlags || []).length) exc += 1;
    }

    const claim = await TravelClaim.create({
      entityTag,
      employeeId,
      claimPeriod,
      tripIds: trips.map((t) => t._id),
      tripCount: trips.length,
      totalDistanceMetres: totalDistance,
      verifiedDistanceMetres: verifiedDistance,
      verifiedPercent: totalDistance ? Math.round((verifiedDistance / totalDistance) * 10000) / 100 : 0,
      fuelTotalPaise: fuel,
      ancillaryTotalPaise: anc,
      grandTotalPaise: fuel + anc,
      exceptionCount: exc,
      status: 'OPEN',
      createdBy: uid(req.authUser)
    });

    for (const t of trips) {
      t.claimId = claim._id;
      await t.save();
    }

    res.status(201).json({ claim });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Claim already exists (BR-11)' });
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const claim = await TravelClaim.findOne(notDeletedFilter({ _id: req.params.id })).lean();
    if (!claim) return res.status(404).json({ error: 'Not found' });
    const trips = await TravelTrip.find(notDeletedFilter({ _id: { $in: claim.tripIds } })).lean();
    res.json({ claim, trips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function transitionClaim(req, res, action) {
  try {
    const claim = await TravelClaim.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!claim) return res.status(404).json({ error: 'Not found' });
    const comment = String(req.body?.comment || '');
    if ((action === 'return' || action === 'reject') && !comment.trim()) {
      return res.status(400).json({ error: 'comment required' });
    }

    if (action === 'submit') {
      if (!canClaim(req.authUser) && !canTravelAdmin(req.authUser)) {
        return res.status(403).json({ error: 'CLAIM required' });
      }
    }
    if (action === 'verify') {
      if (!canVerify(req.authUser)) return res.status(403).json({ error: 'VERIFY required' });
      assertNotSelfActor(uid(req.authUser), claim.employeeId, 'verify');
    }
    if (action === 'approve') {
      if (!canApprove(req.authUser)) return res.status(403).json({ error: 'APPROVE required' });
      assertNotSelfActor(uid(req.authUser), claim.employeeId, 'approve');
      const policy = await getPolicy(claim.entityTag);
      const expected = resolveApproverUserId(policy, claim.employeeId);
      if (expected && String(uid(req.authUser)) !== String(expected) && !canTravelAdmin(req.authUser)) {
        // Allow any APPROVE holder if not the designated final; still block self
      }
      const trips = await TravelTrip.find(notDeletedFilter({ _id: { $in: claim.tripIds } }));
      for (const t of trips) {
        if (hasUnresolvedExceptions(t)) {
          return res.status(409).json({
            error: 'Claim has unresolved exceptions — accept or reject each flagged trip first (§5.4)',
            tripId: String(t._id)
          });
        }
        if (t.exceptionFlags?.includes('EXC_UNVERIFIED')) {
          const unresolved = !(t.exceptionResolutions || []).some(
            (r) => r.flag === 'EXC_UNVERIFIED' && r.resolution === 'accepted'
          );
          // Unverified pairs: not approvable until verified (§ BR-09) unless exception accepted? Brief says not approvable until every pair verified.
          if (t.distanceBasis === 'PARTIAL_ESTIMATE') {
            return res.status(409).json({
              error: 'Trip has unverified distance pairs — not approvable until verified (BR-09)',
              tripId: String(t._id)
            });
          }
        }
      }
    }
    if (action === 'pay') {
      if (!canSettle(req.authUser)) return res.status(403).json({ error: 'SETTLE required' });
      if (!req.body?.paymentReference) return res.status(400).json({ error: 'paymentReference required' });
      claim.paymentReference = String(req.body.paymentReference);
      claim.paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
    }

    applyTransition(claim, CLAIM_TRANSITIONS, action, { by: uid(req.authUser), comment });

    if (action === 'return') {
      await TravelTrip.updateMany(
        { _id: { $in: claim.tripIds }, isDeleted: { $ne: true } },
        {
          $set: { status: 'DRAFT' },
          $push: {
            stateHistory: {
              from: 'VERIFIED',
              to: 'DRAFT',
              action: 'return_via_claim',
              by: uid(req.authUser),
              comment,
              at: new Date()
            }
          }
        }
      );
    }

    claim.updatedBy = uid(req.authUser);
    await claim.save();
    await writeAdminServicesAudit({
      entityType: 'travelClaim',
      entityId: String(claim._id),
      action,
      userId: uid(req.authUser),
      userEmail: req.authUser.email,
      reason: comment,
      after: { status: claim.status }
    });
    res.json({ claim });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}

router.post('/:id/submit', (req, res) => transitionClaim(req, res, 'submit'));
router.post('/:id/verify', (req, res) => transitionClaim(req, res, 'verify'));
router.post('/:id/approve', (req, res) => transitionClaim(req, res, 'approve'));
router.post('/:id/return', (req, res) => transitionClaim(req, res, 'return'));
router.post('/:id/reject', (req, res) => transitionClaim(req, res, 'reject'));
router.post('/:id/pay', (req, res) => transitionClaim(req, res, 'pay'));

export default router;
