import { Router } from 'express';
import TravelTrip from '../../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../../models/adminServices/travel/Claim.js';
import TravelApprovalChain from '../../../models/adminServices/travel/ApprovalChain.js';
import { canApprove, canVerify, canTravelAdmin, canSettle, canViewTravel, requirePerm } from '../../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../../lib/adminServices/mongoose.js';
import { writeAdminServicesAudit } from '../../../lib/adminServices/audit.js';
import { parseAwaitingLevel } from '../../../lib/adminServices/approvalChain.js';
import { CLAIM_AWAITING_STATUSES } from '../../../lib/adminServices/constants.js';
import { sendXlsx, sendSimplePdf, rowsToAoa, aoaToPdfLines } from '../../../lib/adminServices/exportWorkbook.js';

const router = Router();

function uid(user) {
  return user?.id || user?._id;
}

async function loadPendingClaims(user) {
  const actor = String(uid(user));
  const awaiting = await TravelClaim.find(notDeletedFilter({
    status: { $in: CLAIM_AWAITING_STATUSES }
  })).sort({ claimPeriod: -1 }).limit(200).lean();

  const forMe = awaiting.filter((c) => {
    const level = c.pendingApprovalLevel || parseAwaitingLevel(c.status);
    const step = (c.approvalChainSnapshot || []).find((l) => l.level === level);
    if (canTravelAdmin(user)) return true;
    return step && String(step.approverUserId) === actor;
  });

  let verifyQueue = [];
  if (canVerify(user)) {
    verifyQueue = await TravelClaim.find(notDeletedFilter({ status: 'SUBMITTED' }))
      .sort({ claimPeriod: -1 }).limit(50).lean();
  }

  let payQueue = [];
  if (canSettle(user) || canTravelAdmin(user)) {
    payQueue = await TravelClaim.find(notDeletedFilter({ status: 'APPROVED' }))
      .sort({ claimPeriod: -1 }).limit(50).lean();
  }

  return { forMe, claims: [...forMe, ...verifyQueue, ...payQueue] };
}

router.get('/pending', async (req, res) => {
  try {
    if (!canViewTravel(req.authUser) && !canApprove(req.authUser) && !canVerify(req.authUser)) {
      return res.status(403).json({ error: 'Travel access required' });
    }
    const { forMe, claims } = await loadPendingClaims(req.authUser);
    res.json({ claims, awaitingCount: forMe.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    if (!canViewTravel(req.authUser)) {
      return res.status(403).json({ error: 'Travel access required' });
    }
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const { claims } = await loadPendingClaims(req.authUser);
    const headers = [
      'claimPeriod', 'status', 'entityTag', 'tripCount', 'totalDistanceMetres',
      'verifiedPercent', 'exceptionCount', 'grandTotalPaise', 'pendingApprovalLevel'
    ];
    const rows = claims.map((c) => ({
      claimPeriod: c.claimPeriod,
      status: c.status,
      entityTag: c.entityTag,
      tripCount: c.tripCount,
      totalDistanceMetres: c.totalDistanceMetres,
      verifiedPercent: c.verifiedPercent,
      exceptionCount: c.exceptionCount,
      grandTotalPaise: c.grandTotalPaise,
      pendingApprovalLevel: c.pendingApprovalLevel || ''
    }));
    const aoa = rowsToAoa(headers, rows);
    if (format === 'pdf') {
      return sendSimplePdf(res, {
        title: 'Pending travel approvals',
        filename: 'travel-approvals-pending.pdf',
        lines: aoaToPdfLines(aoa)
      });
    }
    return sendXlsx(res, 'travel-approvals-pending.xlsx', [{ name: 'Approvals', aoa }]);
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
    if (!canApprove(req.authUser) && !canTravelAdmin(req.authUser)) {
      return res.status(403).json({ error: 'APPROVE required' });
    }
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
      const from = trip.status;
      trip.status = 'REJECTED';
      trip.stateHistory.push({
        from,
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

/** Who am I the L1/L2 for? — helps Approvals UI */
router.get('/my-direct-reports', async (req, res) => {
  try {
    const actor = uid(req.authUser);
    const chains = await TravelApprovalChain.find(notDeletedFilter({
      isActive: true,
      'levels.approverUserId': actor
    })).lean();
    res.json({
      reports: chains.map((c) => ({
        employeeUserId: c.employeeUserId,
        myLevels: (c.levels || []).filter((l) => String(l.approverUserId) === String(actor)).map((l) => l.level),
        chain: c.levels
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
