import { Router } from 'express';
import AdminServicesTab from '../../models/adminServices/Tab.js';
import TravelTrip from '../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../models/adminServices/travel/Claim.js';
import { canOpenTab, canApprove, canVerify } from '../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../lib/adminServices/mongoose.js';

const router = Router();

router.get('/tabs', async (req, res) => {
  try {
    const user = req.authUser;
    const all = await AdminServicesTab.find({}).sort({ sortOrder: 1 }).lean();
    const tabs = all.filter((t) => t.isEnabled && canOpenTab(user, t));
    res.json({ tabs });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list tabs' });
  }
});

router.get('/tabs/counts', async (req, res) => {
  try {
    const user = req.authUser;
    const counts = {};
    if (canApprove(user) || canVerify(user)) {
      const pendingClaims = await TravelClaim.countDocuments(notDeletedFilter({
        status: { $in: canApprove(user) ? ['VERIFIED', 'SUBMITTED'] : ['SUBMITTED'] }
      }));
      const exceptions = await TravelTrip.countDocuments(notDeletedFilter({
        exceptionFlags: { $exists: true, $ne: [] },
        status: { $nin: ['REJECTED', 'DRAFT'] }
      }));
      counts.travel = pendingClaims + exceptions;
    } else {
      counts.travel = 0;
    }
    res.json({ counts });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load counts' });
  }
});

router.get('/meta', async (req, res) => {
  const user = req.authUser;
  const { ENTITY_TAGS } = await import('../../lib/adminServices/constants.js');
  const {
    canClaim, canVerify, canApprove, canTravelAdmin, canSettle, canViewTravel
  } = await import('../../lib/adminServices/access.js');
  res.json({
    entityTags: ENTITY_TAGS,
    permissions: {
      view: canViewTravel(user),
      claim: canClaim(user),
      verify: canVerify(user),
      approve: canApprove(user),
      admin: canTravelAdmin(user),
      settle: canSettle(user)
    },
    user: user ? { id: user.id || user._id, email: user.email, name: user.name } : null
  });
});

export default router;
