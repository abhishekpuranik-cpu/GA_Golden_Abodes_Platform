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

      if (canApprove(user) || canVerify(user) || isTravelOpsStaff(user)) {
        const { CLAIM_AWAITING_STATUSES } = await import('../lib/adminServices/constants.js');
        const { parseAwaitingLevel } = await import('../lib/adminServices/approvalChain.js');
        const { canTravelAdmin } = await import('../lib/adminServices/access.js');
        const actor = String(user.id || user._id);

        const [awaitingRows, verifyCount, excCount] = await Promise.all([
          TravelClaim.find(notDeletedFilter({ status: { $in: CLAIM_AWAITING_STATUSES } }))
            .select({ pendingApprovalLevel: 1, status: 1, approvalChainSnapshot: 1 })
            .limit(200)
            .lean(),
          canVerify(user)
            ? TravelTrip.countDocuments(notDeletedFilter({ status: 'SUBMITTED' }))
            : Promise.resolve(0),
          canApprove(user) || canTravelAdmin(user)
            ? TravelTrip.countDocuments(notDeletedFilter({
              exceptionFlags: { $exists: true, $ne: [] },
              status: { $nin: ['REJECTED', 'DRAFT'] }
            }))
            : Promise.resolve(0)
        ]);

        const claimCount = awaitingRows.filter((c) => {
          if (canTravelAdmin(user)) return true;
          const level = c.pendingApprovalLevel || parseAwaitingLevel(c.status);
          const step = (c.approvalChainSnapshot || []).find((l) => l.level === level);
          return step && String(step.approverUserId) === actor;
        }).length;

        if (claimCount > 0) {
          items.push({
            id: 'as-approvals',
            appId: 'admin_services',
            kind: 'approval',
            title: 'Travel claims awaiting your approval',
            detail: `${claimCount} claim${claimCount === 1 ? '' : 's'} at your level`,
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
