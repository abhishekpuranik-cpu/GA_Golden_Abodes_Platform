import { Router } from 'express';
import { withDb } from '../lib/mongo.js';
import { DM_COLLECTIONS } from '../lib/dmGovernance/collections.js';
import { projectInScope, requireDmWrite, userCanDmTab, DM_TABS } from '../lib/dmGovernance/access.js';
import { runBillingScenario } from '../lib/dmGovernance/scenarioEngine.js';
import { buildNotificationFeed } from '../lib/dmGovernance/notificationService.js';
import { buildExecutiveSummary } from '../lib/dmGovernance/executiveAnalytics.js';
import { buildReportHtml } from '../lib/dmGovernance/reportExport.js';
import {
  syncConstructionMilestones,
  syncExecutionDashboard,
  pullConstructionMilestones
} from '../lib/dmGovernance/integrations/constructionMilestones.js';
import { detectBillingTriggers } from '../lib/dmGovernance/riskEngine.js';

export const dmGovernancePhase4Router = Router();

function userFromReq(req) {
  return req.authUser || null;
}

function deny(res, msg = 'Forbidden') {
  return res.status(403).json({ error: msg });
}

// ——— Scenario simulator ———
dmGovernancePhase4Router.post(
  '/projects/:id/scenarios/run',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!projectInScope(user, project)) return deny(res);
    try {
      const result = await runBillingScenario(db, req.params.id, req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  })
);

dmGovernancePhase4Router.get(
  '/projects/:id/scenarios',
  withDb(async (req, res, db) => {
    const list = await db
      .collection(DM_COLLECTIONS.scenarios)
      .find({ projectId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    res.json({ scenarios: list });
  })
);

// ——— Notifications / alerts ———
dmGovernancePhase4Router.get(
  '/alerts',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    const feed = await buildNotificationFeed(db, user);
    res.json(feed);
  })
);

dmGovernancePhase4Router.post(
  '/alerts/:id/ack',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    await db.collection(DM_COLLECTIONS.notifications).updateOne(
      { _id: req.params.id },
      { $set: { acknowledged: true, acknowledgedAt: new Date(), acknowledgedBy: user?.email } }
    );
    res.json({ ok: true });
  })
);

// ——— Executive analytics ———
dmGovernancePhase4Router.get(
  '/executive/summary',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!userCanDmTab(user, DM_TABS.CONSOLIDATED) && !userCanDmTab(user, DM_TABS.DASHBOARD)) {
      return deny(res, 'Executive view access denied');
    }
    const data = await buildExecutiveSummary(db, user);
    res.json(data);
  })
);

// ——— PDF / print export ———
dmGovernancePhase4Router.get(
  '/reports/:reportId/export',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    try {
      const { html, filename, title } = await buildReportHtml(db, req.params.reportId, user);
      if (req.query.format === 'json') {
        return res.json({ html, filename, title });
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(html);
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  })
);

// ——— Construction milestones ———
dmGovernancePhase4Router.get(
  '/projects/:id/milestones',
  withDb(async (req, res, db) => {
    const snap = await pullConstructionMilestones(db, req.params.id);
    if (!snap.ok) return res.status(400).json(snap);
    res.json(snap);
  })
);

dmGovernancePhase4Router.post(
  '/projects/:id/sync-milestones',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const result = await syncConstructionMilestones(db, req.params.id);
    if (!result.ok) return res.status(400).json(result);
    const triggers = await detectBillingTriggers(db, req.params.id, result.before, result.after);
    res.json({ ...result, triggers });
  })
);

dmGovernancePhase4Router.post(
  '/projects/:id/sync-execution',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const result = await syncExecutionDashboard(db, req.params.id);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  })
);
