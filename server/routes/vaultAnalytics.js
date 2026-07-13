import { Router } from 'express';
import { withDb } from '../lib/mongo.js';
import { resolveSession, userHasApp } from './auth.js';
import { APP_LABELS, runVaultAnalyticsAsk } from '../lib/vaultAnalyticsAsk.js';
import { hydrateVaultAskContext } from '../lib/vaultAskContextHydrate.js';

export const vaultAnalyticsRouter = Router();

/** Apps that may use vault Ask AI (must also pass userHasApp unless vault hub). */
const ASK_APP_IDS = new Set([
  'preconstruction',
  'post_sales',
  'hiring',
  'dm_spv_governance',
  'v1_cashflow',
  'v2_resource_planner',
  'v3_org_planner',
  'v3_project_acquisition',
  'sales_dashboard',
  'marketing_kpi',
  'finance_kpi',
  'finance_kpi_admin',
  'execution',
  'vault',
]);

function canAskApp(user, appId) {
  if (!user || !appId) return false;
  if (appId === 'vault') {
    return Array.isArray(user.allowedApps) && user.allowedApps.length > 0;
  }
  if (appId === 'finance_kpi_admin') {
    return userHasApp(user, 'finance_kpi_admin') || userHasApp(user, 'finance_kpi') || userHasApp(user, 'admin_security');
  }
  if (appId === 'v3_project_acquisition') {
    return userHasApp(user, 'v3_project_acquisition') || userHasApp(user, 'v3_org_planner');
  }
  if (appId === 'v3_org_planner') {
    return userHasApp(user, 'v3_org_planner') || userHasApp(user, 'v3_project_acquisition');
  }
  return userHasApp(user, appId);
}

/**
 * POST /api/vault/analytics-ask
 * Body: { appId, question, context, appLabel? }
 */
vaultAnalyticsRouter.post(
  '/vault/analytics-ask',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess) return res.status(401).json({ error: 'Unauthorized' });

    const appId = String(req.body?.appId || '').trim();
    const question = String(req.body?.question || '').trim();
    if (!appId || !ASK_APP_IDS.has(appId)) {
      return res.status(400).json({ error: 'Valid appId required' });
    }
    if (!canAskApp(sess.user, appId)) {
      return res.status(403).json({ error: 'Forbidden for this app' });
    }
    if (!question) return res.status(400).json({ error: 'question required' });
    if (question.length > 4000) return res.status(400).json({ error: 'question too long' });

    const rawContext = req.body?.context;
    if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)) {
      return res.status(400).json({ error: 'context object required' });
    }

    try {
      const { context, hydrated, quality } = await hydrateVaultAskContext(db, appId, rawContext);
      const result = await runVaultAnalyticsAsk({
        appId,
        question,
        context,
        appLabel: req.body?.appLabel || APP_LABELS[appId],
      });
      res.json({
        ok: true,
        ...result,
        skippedLlm: !!result.skippedLlm,
        contextHydrated: !!hydrated,
        contextQuality: result.contextQuality || quality || null,
        contextTotals: context?.totals || null,
        contextHotCount: Array.isArray(context?.hotItems)
          ? context.hotItems.length
          : Array.isArray(context?.hotTasks)
            ? context.hotTasks.length
            : 0,
      });
    } catch (e) {
      console.error('[vault-analytics]', e?.message || e);
      res.status(502).json({ error: e?.message || String(e) });
    }
  })
);
