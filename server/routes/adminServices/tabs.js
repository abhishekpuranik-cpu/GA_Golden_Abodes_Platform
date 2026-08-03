import { Router } from 'express';
import AdminServicesTab from '../../models/adminServices/Tab.js';
import TravelLocation from '../../models/adminServices/travel/Location.js';
import TravelTrip from '../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../models/adminServices/travel/Claim.js';
import {
  canOpenTab, canApprove, canVerify, canClaim, canTravelAdmin, canSettle,
  canViewTravel, isTravelOpsStaff
} from '../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../lib/adminServices/mongoose.js';
import { ENTITY_TAGS, TAB_SEED } from '../../lib/adminServices/constants.js';

const router = Router();

let tabsCache = { at: 0, rows: null };

async function loadTabsCached() {
  const now = Date.now();
  if (tabsCache.rows && now - tabsCache.at < 60_000) return tabsCache.rows;
  try {
    const rows = await AdminServicesTab.find({}).sort({ sortOrder: 1 }).lean();
    if (rows?.length) {
      tabsCache = { at: now, rows };
      return rows;
    }
  } catch {
    /* fall through to seed */
  }
  return TAB_SEED.map((t) => ({ ...t }));
}

function buildMeta(user) {
  const staff = isTravelOpsStaff(user);
  return {
    entityTags: ENTITY_TAGS,
    permissions: {
      view: canViewTravel(user),
      claim: canClaim(user),
      verify: canVerify(user),
      approve: canApprove(user),
      admin: canTravelAdmin(user),
      settle: canSettle(user),
      staff
    },
    user: user ? { id: user.id || user._id, email: user.email, name: user.name } : null
  };
}

async function buildCounts(user) {
  const counts = { travel: 0 };
  if (!canApprove(user) && !canVerify(user)) return counts;
  const [pendingClaims, exceptions] = await Promise.all([
    TravelClaim.countDocuments(notDeletedFilter({
      status: { $in: canApprove(user) ? ['VERIFIED', 'SUBMITTED'] : ['SUBMITTED'] }
    })),
    TravelTrip.countDocuments(notDeletedFilter({
      exceptionFlags: { $exists: true, $ne: [] },
      status: { $nin: ['REJECTED', 'DRAFT'] }
    }))
  ]);
  counts.travel = pendingClaims + exceptions;
  return counts;
}

/** One-shot bootstrap — tabs + meta + counts + optional slim locations. Target <2s. */
router.get('/bootstrap', async (req, res) => {
  try {
    const user = req.authUser;
    const entityTag = String(req.query.entityTag || 'PAD');
    const wantLocs = String(req.query.locations || '1') !== '0';

    const all = await loadTabsCached();
    const tabs = all.filter((t) => t.isEnabled && canOpenTab(user, t));
    const meta = buildMeta(user);

    const jobs = [buildCounts(user)];
    if (wantLocs && meta.permissions.view) {
      jobs.push(
        TravelLocation.find(notDeletedFilter({ entityTag, isActive: { $ne: false } }))
          .select({ name: 1, category: 1, entityTag: 1 })
          .sort({ name: 1 })
          .limit(200)
          .lean()
      );
    } else {
      jobs.push(Promise.resolve([]));
    }

    const [counts, locations] = await Promise.all(jobs);
    res.setHeader('Cache-Control', 'private, max-age=15');
    res.json({ tabs, counts, meta, locations, entityTag });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Bootstrap failed' });
  }
});

router.get('/tabs', async (req, res) => {
  try {
    const all = await loadTabsCached();
    const tabs = all.filter((t) => t.isEnabled && canOpenTab(req.authUser, t));
    res.json({ tabs });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list tabs' });
  }
});

router.get('/tabs/counts', async (req, res) => {
  try {
    res.json({ counts: await buildCounts(req.authUser) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load counts' });
  }
});

router.get('/meta', async (req, res) => {
  res.json(buildMeta(req.authUser));
});

export default router;
