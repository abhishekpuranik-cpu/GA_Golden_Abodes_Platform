import { Router } from 'express';
import TravelTrip from '../../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../../models/adminServices/travel/Claim.js';
import {
  canClaim, canVerify, canApprove, canSettle, canTravelAdmin, requirePerm, isTravelOpsStaff
} from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { hasUnresolvedExceptions, assertNotSelfActor } from '../../../lib/adminServices/travelRules.js';
import { applyTransition, CLAIM_TRANSITIONS } from '../../../lib/adminServices/approvalEngine.js';
import {
  snapshotChainForClaim,
  assertCanApproveLevel,
  applyLevelApprove,
  parseAwaitingLevel,
  awaitingStatus
} from '../../../lib/adminServices/approvalChain.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';
import { sendXlsx, sendSimplePdf, rowsToAoa, aoaToPdfLines } from '../../../lib/adminServices/exportWorkbook.js';

const router = Router();

function uid(user) {
  return user?.id || user?._id;
}

async function assertClaimApprovable(claim) {
  const trips = await TravelTrip.find(notDeletedFilter({ _id: { $in: claim.tripIds } }));
  for (const t of trips) {
    if (hasUnresolvedExceptions(t)) {
      const err = new Error('Claim has unresolved exceptions — accept or reject each flagged trip first');
      err.status = 409;
      err.tripId = String(t._id);
      throw err;
    }
    if (t.distanceBasis === 'PARTIAL_ESTIMATE') {
      const err = new Error('Trip has unverified distance pairs — not approvable until verified (BR-09)');
      err.status = 409;
      err.tripId = String(t._id);
      throw err;
    }
  }
}

/** Build / refresh an OPEN claim from SUBMITTED+VERIFIED trips in period. */
async function buildOrGetClaimForPeriod(employeeId, claimPeriod, actorId) {
  if (!/^\d{4}-\d{2}$/.test(claimPeriod)) {
    const err = new Error('claimPeriod must be YYYY-MM');
    err.status = 400;
    throw err;
  }
  let claim = await TravelClaim.findOne(notDeletedFilter({ employeeId, claimPeriod }));
  if (claim && !['OPEN', 'RETURNED'].includes(claim.status)) {
    return { claim, created: false };
  }

  const [y, m] = claimPeriod.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const trips = await TravelTrip.find(notDeletedFilter({
    employeeId,
    status: { $in: ['SUBMITTED', 'VERIFIED'] },
    $or: [{ claimId: null }, { claimId: { $exists: false } }, ...(claim ? [{ claimId: claim._id }] : [])],
    travelDate: { $gte: start, $lt: end }
  }));

  let usable = trips.filter((t) => !t.claimId || (claim && String(t.claimId) === String(claim._id)));
  if (!usable.length) {
    const drafts = await TravelTrip.countDocuments(notDeletedFilter({
      employeeId,
      status: { $in: ['DRAFT', 'RETURNED'] },
      travelDate: { $gte: start, $lt: end }
    }));
    const err = new Error(
      drafts
        ? `No submitted trips for ${claimPeriod}. Submit your draft trips first (${drafts} still draft/returned).`
        : `No submitted trips for ${claimPeriod}. Log and submit trips, then submit the monthly claim.`
    );
    err.status = 400;
    err.code = 'NO_TRIPS_FOR_CLAIM';
    throw err;
  }

  for (const t of usable) {
    if (t.status === 'SUBMITTED') {
      const from = t.status;
      t.status = 'VERIFIED';
      if (!Array.isArray(t.stateHistory)) t.stateHistory = [];
      t.stateHistory.push({
        from,
        to: 'VERIFIED',
        action: 'auto_verify_for_claim',
        by: actorId,
        comment: 'Auto-verified when generating monthly claim',
        at: new Date()
      });
      await t.save();
    }
  }

  usable = await TravelTrip.find(notDeletedFilter({
    _id: { $in: usable.map((t) => t._id) }
  }));

  const entityTag = usable[0].entityTag;
  let totalDistance = 0;
  let verifiedDistance = 0;
  let fuel = 0;
  let anc = 0;
  let exc = 0;
  for (const t of usable) {
    totalDistance += t.claimedDistanceMetres || 0;
    if (t.distanceBasis === 'VERIFIED') verifiedDistance += t.claimedDistanceMetres || 0;
    fuel += t.fuelAmountPaise || 0;
    anc += t.ancillaryTotalPaise || 0;
    if ((t.exceptionFlags || []).length) exc += 1;
  }

  const totals = {
    entityTag,
    tripIds: usable.map((t) => t._id),
    tripCount: usable.length,
    totalDistanceMetres: totalDistance,
    verifiedDistanceMetres: verifiedDistance,
    verifiedPercent: totalDistance ? Math.round((verifiedDistance / totalDistance) * 10000) / 100 : 0,
    fuelTotalPaise: fuel,
    ancillaryTotalPaise: anc,
    grandTotalPaise: fuel + anc,
    exceptionCount: exc
  };

  if (!claim) {
    claim = await TravelClaim.create({
      ...totals,
      employeeId,
      claimPeriod,
      status: 'OPEN',
      createdBy: actorId
    });
  } else {
    Object.assign(claim, totals);
    claim.status = 'OPEN';
    claim.updatedBy = actorId;
    await claim.save();
  }

  for (const t of usable) {
    t.claimId = claim._id;
    await t.save();
  }

  return { claim, created: true };
}

async function submitClaimDoc(claim, actor, comment = '') {
  const snap = await snapshotChainForClaim(claim.employeeId, claim.entityTag);
  claim.approvalChainSnapshot = snap;
  claim.pendingApprovalLevel = 1;
  claim.levelApprovals = [];
  const firstStatus = awaitingStatus(1);
  applyTransition(claim, CLAIM_TRANSITIONS, 'submit', { by: actor, comment });
  claim.status = firstStatus;
  claim.pendingApprovalLevel = 1;
  if (claim.stateHistory?.length) {
    claim.stateHistory[claim.stateHistory.length - 1].to = firstStatus;
  }
  claim.updatedBy = actor;
  await claim.save();
  return claim;
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

router.get('/export', requirePerm((u) => canClaim(u) || canApprove(u) || canTravelAdmin(u), 'export permission required'), async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const filter = notDeletedFilter();
    if (!canVerify(req.authUser) && !canApprove(req.authUser) && !canTravelAdmin(req.authUser)) {
      filter.employeeId = uid(req.authUser);
    } else if (req.query.employeeId) {
      filter.employeeId = req.query.employeeId;
    }
    if (req.query.period) filter.claimPeriod = req.query.period;
    const claims = await TravelClaim.find(filter).sort({ claimPeriod: -1 }).limit(500).lean();
    const headers = [
      'claimPeriod', 'status', 'entityTag', 'tripCount', 'totalDistanceMetres',
      'fuelTotalPaise', 'ancillaryTotalPaise', 'grandTotalPaise', 'paymentReference', 'pendingApprovalLevel'
    ];
    const rows = claims.map((c) => ({
      claimPeriod: c.claimPeriod,
      status: c.status,
      entityTag: c.entityTag,
      tripCount: c.tripCount,
      totalDistanceMetres: c.totalDistanceMetres,
      fuelTotalPaise: c.fuelTotalPaise,
      ancillaryTotalPaise: c.ancillaryTotalPaise,
      grandTotalPaise: c.grandTotalPaise,
      paymentReference: c.paymentReference || '',
      pendingApprovalLevel: c.pendingApprovalLevel || ''
    }));
    const aoa = rowsToAoa(headers, rows);
    const stamp = req.query.period || 'all';
    if (format === 'pdf') {
      return sendSimplePdf(res, {
        title: 'Travel claims',
        filename: `travel-claims-${stamp}.pdf`,
        lines: aoaToPdfLines(aoa)
      });
    }
    return sendXlsx(res, `travel-claims-${stamp}.xlsx`, [{ name: 'Claims', aoa }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', requirePerm((u) => canClaim(u) || canTravelAdmin(u), 'CLAIM required'), async (req, res) => {
  try {
    const employeeId = req.body?.employeeId || uid(req.authUser);
    const claimPeriod = String(req.body?.claimPeriod || '').trim();
    if (!canTravelAdmin(req.authUser) && String(employeeId) !== String(uid(req.authUser))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { claim } = await buildOrGetClaimForPeriod(employeeId, claimPeriod, uid(req.authUser));
    res.status(201).json({ claim });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Claim already exists (BR-11)' });
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

/** One-shot: generate (if needed) + submit for approval. */
router.post('/submit-month', requirePerm((u) => canClaim(u) || canTravelAdmin(u), 'CLAIM required'), async (req, res) => {
  try {
    const employeeId = req.body?.employeeId || uid(req.authUser);
    const claimPeriod = String(req.body?.claimPeriod || '').trim();
    if (!canTravelAdmin(req.authUser) && String(employeeId) !== String(uid(req.authUser))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    let claim = await TravelClaim.findOne(notDeletedFilter({ employeeId, claimPeriod }));
    if (!claim || ['OPEN', 'RETURNED'].includes(claim.status)) {
      const built = await buildOrGetClaimForPeriod(employeeId, claimPeriod, uid(req.authUser));
      claim = built.claim;
    } else if (!['OPEN', 'RETURNED'].includes(claim.status)) {
      return res.status(409).json({
        error: `Claim for ${claimPeriod} is already ${claim.status}`,
        claim,
        code: 'CLAIM_ALREADY_IN_FLIGHT'
      });
    }
    claim = await TravelClaim.findOne(notDeletedFilter({ _id: claim._id }));
    await submitClaimDoc(claim, uid(req.authUser), String(req.body?.comment || ''));
    await writeAdminServicesAudit({
      entityType: 'travelClaim',
      entityId: String(claim._id),
      action: 'submit-month',
      userId: uid(req.authUser),
      userEmail: req.authUser.email,
      after: { status: claim.status, pendingApprovalLevel: claim.pendingApprovalLevel }
    });
    res.json({
      claim,
      message: `Claim submitted — awaiting L1 approval`
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code, tripId: err.tripId });
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
      await submitClaimDoc(claim, uid(req.authUser), comment);
    } else if (action === 'verify') {
      if (!canVerify(req.authUser)) return res.status(403).json({ error: 'VERIFY required' });
      assertNotSelfActor(uid(req.authUser), claim.employeeId, 'verify');
      applyTransition(claim, CLAIM_TRANSITIONS, 'verify', { by: uid(req.authUser), comment });
      claim.updatedBy = uid(req.authUser);
      await claim.save();
    } else if (action === 'approve') {
      const actor = uid(req.authUser);
      const staff = isTravelOpsStaff(req.authUser) || canApprove(req.authUser);
      try {
        assertCanApproveLevel(claim, actor, { allowStaffOverride: true, isStaff: staff && canTravelAdmin(req.authUser) });
      } catch (e) {
        if (!canApprove(req.authUser) && !canTravelAdmin(req.authUser)) {
          const level = claim.pendingApprovalLevel || parseAwaitingLevel(claim.status);
          const step = (claim.approvalChainSnapshot || []).find((l) => l.level === level);
          if (!step || String(step.approverUserId) !== String(actor)) throw e;
          assertNotSelfActor(actor, claim.employeeId, 'approve');
        } else if (e.code === 'WRONG_APPROVER_LEVEL' && canTravelAdmin(req.authUser)) {
          // admin override OK
        } else if (e.code === 'WRONG_APPROVER_LEVEL') {
          throw e;
        } else {
          throw e;
        }
      }
      await assertClaimApprovable(claim);
      assertNotSelfActor(actor, claim.employeeId, 'approve');
      applyLevelApprove(claim, { by: actor, comment });
      claim.updatedBy = actor;
      await claim.save();
    } else if (action === 'return' || action === 'reject') {
      const level = parseAwaitingLevel(claim.status);
      if (level) {
        const actor = uid(req.authUser);
        const step = (claim.approvalChainSnapshot || []).find((l) => l.level === level);
        const allowed = (step && String(step.approverUserId) === String(actor))
          || canApprove(req.authUser)
          || canTravelAdmin(req.authUser);
        if (!allowed) return res.status(403).json({ error: 'Not allowed to return/reject at this level' });
      } else if (!canApprove(req.authUser) && !canVerify(req.authUser)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      applyTransition(claim, CLAIM_TRANSITIONS, action, { by: uid(req.authUser), comment });
      if (action === 'return') {
        claim.pendingApprovalLevel = null;
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
    } else if (action === 'pay') {
      if (!canSettle(req.authUser)) return res.status(403).json({ error: 'SETTLE required' });
      if (!req.body?.paymentReference) return res.status(400).json({ error: 'paymentReference required' });
      claim.paymentReference = String(req.body.paymentReference);
      claim.paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
      applyTransition(claim, CLAIM_TRANSITIONS, 'pay', { by: uid(req.authUser), comment });
      claim.updatedBy = uid(req.authUser);
      await claim.save();
    } else {
      return res.status(400).json({ error: `Unknown action ${action}` });
    }

    await writeAdminServicesAudit({
      entityType: 'travelClaim',
      entityId: String(claim._id),
      action,
      userId: uid(req.authUser),
      userEmail: req.authUser.email,
      reason: comment,
      after: { status: claim.status, pendingApprovalLevel: claim.pendingApprovalLevel }
    });
    res.json({ claim });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code, tripId: err.tripId });
  }
}

router.post('/:id/submit', (req, res) => transitionClaim(req, res, 'submit'));
router.post('/:id/verify', (req, res) => transitionClaim(req, res, 'verify'));
router.post('/:id/approve', (req, res) => transitionClaim(req, res, 'approve'));
router.post('/:id/return', (req, res) => transitionClaim(req, res, 'return'));
router.post('/:id/reject', (req, res) => transitionClaim(req, res, 'reject'));
router.post('/:id/pay', (req, res) => transitionClaim(req, res, 'pay'));

export default router;
