import { Router } from 'express';
import AdminServicesTab from '../../models/adminServices/Tab.js';
import TravelLocation from '../../models/adminServices/travel/Location.js';
import TravelTrip from '../../models/adminServices/travel/Trip.js';
import TravelClaim from '../../models/adminServices/travel/Claim.js';
import TravelApprovalChain from '../../models/adminServices/travel/ApprovalChain.js';
import {
  canOpenTab, canApprove, canVerify, canClaim, canTravelAdmin, canSettle,
  canViewTravel, isTravelOpsStaff
} from '../../lib/adminServices/access.js';
import { notDeletedFilter } from '../../lib/adminServices/mongoose.js';
import { ENTITY_TAGS, TAB_SEED, CLAIM_AWAITING_STATUSES } from '../../lib/adminServices/constants.js';
import { parseAwaitingLevel } from '../../lib/adminServices/approvalChain.js';

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

async function isDesignatedApprover(user) {
  if (!user) return false;
  if (canApprove(user) || canTravelAdmin(user) || isTravelOpsStaff(user)) return true;
  const actor = String(user.id || user._id || '');
  if (!actor) return false;
  const mongoose = (await import('mongoose')).default;
  const idFilter = mongoose.Types.ObjectId.isValid(actor)
    ? { $in: [actor, new mongoose.Types.ObjectId(actor)] }
    : actor;
  const n = await TravelApprovalChain.countDocuments(notDeletedFilter({
    isActive: true,
    'levels.approverUserId': idFilter
  }));
  return n > 0;
}

async function buildMeta(user) {
  const staff = isTravelOpsStaff(user);
  const approver = await isDesignatedApprover(user);
  return {
    entityTags: ENTITY_TAGS,
    permissions: {
      view: canViewTravel(user),
      claim: canClaim(user),
      verify: canVerify(user),
      approve: canApprove(user) || approver,
      admin: canTravelAdmin(user),
      settle: canSettle(user),
      staff,
      approver
    },
    user: user ? { id: user.id || user._id, email: user.email, name: user.name } : null
  };
}

async function buildCounts(user) {
  const counts = { travel: 0 };
  const actor = String(user?.id || user?._id || '');
  const [awaitingRows, exceptions] = await Promise.all([
    TravelClaim.find(notDeletedFilter({ status: { $in: CLAIM_AWAITING_STATUSES } }))
      .select({ pendingApprovalLevel: 1, status: 1, approvalChainSnapshot: 1 })
      .limit(200)
      .lean(),
    (canApprove(user) || canTravelAdmin(user))
      ? TravelTrip.countDocuments(notDeletedFilter({
        exceptionFlags: { $exists: true, $ne: [] },
        status: { $nin: ['REJECTED', 'DRAFT'] }
      }))
      : Promise.resolve(0)
  ]);
  const pendingClaims = awaitingRows.filter((c) => {
    if (canTravelAdmin(user)) return true;
    const level = c.pendingApprovalLevel || parseAwaitingLevel(c.status);
    const step = (c.approvalChainSnapshot || []).find((l) => l.level === level);
    return step && String(step.approverUserId) === actor;
  }).length;
  counts.travel = pendingClaims + (typeof exceptions === 'number' ? exceptions : 0);
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
    const meta = await buildMeta(user);

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
  try {
    res.json(await buildMeta(req.authUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
