/**
 * Vault attention inbox — items that need the signed-in user's action.
 * Auth-only (any vault user). Each item links into the right app screen.
 */
import { Router } from 'express';
import { userHasApp } from './auth.js';
import {
  canApprove, canVerify, isTravelOpsStaff, hasAdminServicesApp
} from '../lib/adminServices/access.js';
import { notDeletedFilter } from '../lib/adminServices/mongoose.js';
import { ensureAdminServicesMongoose } from '../lib/adminServices/mongoose.js';

export const vaultAttentionRouter = Router();

vaultAttentionRouter.get('/attention', async (req, res) => {
  const user = req.authUser;
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const items = [];
  const started = Date.now();

  try {
    if (hasAdminServicesApp(user) || isTravelOpsStaff(user)) {
      await ensureAdminServicesMongoose();
      const TravelClaim = (await import('../models/adminServices/travel/Claim.js')).default;
      const TravelTrip = (await import('../models/adminServices/travel/Trip.js')).default;

      if (canApprove(user) || canVerify(user)) {
        const claimStatuses = canApprove(user) ? ['VERIFIED', 'SUBMITTED'] : ['SUBMITTED'];
        const [claimCount, verifyCount, excCount] = await Promise.all([
          TravelClaim.countDocuments(notDeletedFilter({ status: { $in: claimStatuses } })),
          canVerify(user)
            ? TravelTrip.countDocuments(notDeletedFilter({ status: 'SUBMITTED' }))
            : Promise.resolve(0),
          canApprove(user)
            ? TravelTrip.countDocuments(notDeletedFilter({
              exceptionFlags: { $exists: true, $ne: [] },
              status: { $nin: ['REJECTED', 'DRAFT'] }
            }))
            : Promise.resolve(0)
        ]);

        if (claimCount > 0 && canApprove(user)) {
          items.push({
            id: 'as-approvals',
            appId: 'admin_services',
            kind: 'approval',
            title: 'Travel claims awaiting approval',
            detail: `${claimCount} claim${claimCount === 1 ? '' : 's'} need your review`,
            count: claimCount,
            href: '/app/admin-services/travel/approvals',
            priority: 1
          });
        }
        if (verifyCount > 0 && canVerify(user)) {
          items.push({
            id: 'as-verify',
            appId: 'admin_services',
            kind: 'task',
            title: 'Trips awaiting verification',
            detail: `${verifyCount} trip${verifyCount === 1 ? '' : 's'} in the verification queue`,
            count: verifyCount,
            href: '/app/admin-services/travel/verify',
            priority: 2
          });
        }
        if (excCount > 0 && canApprove(user)) {
          items.push({
            id: 'as-exceptions',
            appId: 'admin_services',
            kind: 'exception',
            title: 'Travel exceptions open',
            detail: `${excCount} flagged trip${excCount === 1 ? '' : 's'} need accept/reject`,
            count: excCount,
            href: '/app/admin-services/travel/approvals',
            priority: 1
          });
        }
      }
    }

    // Post-Sales my-tasks teaser (placeholder count via lightweight try)
    if (userHasApp(user, 'post_sales')) {
      items.push({
        id: 'ps-tasks',
        appId: 'post_sales',
        kind: 'task',
        title: 'Post-Sales tasks',
        detail: 'Open My Tasks to clear today’s checklist',
        count: null,
        href: '/app/post-sales/my-tasks',
        priority: 3,
        placeholder: true
      });
    }

    // Hiring placeholder for staff
    if (userHasApp(user, 'hiring') && (isTravelOpsStaff(user) || userHasApp(user, 'hiring'))) {
      items.push({
        id: 'hr-pipeline',
        appId: 'hiring',
        kind: 'task',
        title: 'Hiring pipeline',
        detail: 'Review requisitions and interviews',
        count: null,
        href: '/app/hiring',
        priority: 4,
        placeholder: true
      });
    }
  } catch (err) {
    console.warn('[vault-attention]', err?.message || err);
  }

  items.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const actionable = items.filter((i) => (i.count != null && i.count > 0) || i.placeholder);
  const badge = items.reduce((s, i) => s + (Number(i.count) || 0), 0);

  res.setHeader('Cache-Control', 'private, max-age=20');
  res.json({
    items: actionable,
    badge,
    generatedAt: new Date().toISOString(),
    ms: Date.now() - started
  });
});
