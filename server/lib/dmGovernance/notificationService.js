import { DM_COLLECTIONS } from './collections.js';
import { buildProjectFilter } from './access.js';

/**
 * Build live notification feed from risks, triggers, approvals, and sync health.
 * @param {import('mongodb').Db} db
 * @param {object} user
 */
export async function buildNotificationFeed(db, user) {
  const filter = buildProjectFilter(user);
  const projects = await db.collection(DM_COLLECTIONS.projects).find(filter).toArray();
  const projectIds = projects.map((p) => p._id);
  const now = new Date();
  const alerts = [];

  const risks = await db
    .collection(DM_COLLECTIONS.riskExceptions)
    .find({ status: 'open', ...(projectIds.length ? { projectId: { $in: projectIds } } : {}) })
    .sort({ severity: -1, updatedAt: -1 })
    .limit(30)
    .toArray();

  risks.forEach((r) => {
    alerts.push({
      id: `alert_risk_${r._id}`,
      type: 'risk',
      severity: r.severity,
      projectId: r.projectId,
      title: r.message,
      detail: r.suggestedAction,
      href: '/app/dm-governance/risks',
      at: r.updatedAt || now
    });
  });

  const triggers = await db
    .collection(DM_COLLECTIONS.billingTriggers)
    .find({ status: 'pending', ...(projectIds.length ? { projectId: { $in: projectIds } } : {}) })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  triggers.forEach((t) => {
    alerts.push({
      id: `alert_trig_${t._id}`,
      type: 'billing_trigger',
      severity: t.triggerType === 'construction_milestone' ? 'high' : 'medium',
      projectId: t.projectId,
      title: t.message,
      detail: t.triggerType,
      href: '/app/dm-governance/integrations',
      at: t.createdAt || now
    });
  });

  const pendingInvoices = await db
    .collection(DM_COLLECTIONS.invoices)
    .find({
      status: { $in: ['FINANCE_REVIEW', 'PROJECT_REVIEW'] },
      ...(projectIds.length ? { projectId: { $in: projectIds } } : {})
    })
    .sort({ updatedAt: -1 })
    .limit(15)
    .toArray();

  pendingInvoices.forEach((inv) => {
    alerts.push({
      id: `alert_inv_${inv._id}`,
      type: 'approval',
      severity: inv.requiresLeadershipApproval ? 'high' : 'medium',
      projectId: inv.projectId,
      title: `Invoice ${inv.invoiceNo} awaiting ${inv.status.replace(/_/g, ' ').toLowerCase()}`,
      detail: `₹${(inv.totalAmount || 0).toLocaleString('en-IN')}`,
      href: `/app/dm-governance/invoices/${inv._id}`,
      at: inv.updatedAt || now
    });
  });

  projects.forEach((p) => {
    const lastSync = p.integrationSnapshot?.cashflow?.syncedAt;
    if (!lastSync) {
      alerts.push({
        id: `alert_sync_${p._id}`,
        type: 'integration',
        severity: 'medium',
        projectId: p._id,
        title: `${p.name} — Cashflow never synced`,
        detail: 'Run integration sync',
        href: `/app/dm-governance/projects/${p._id}`,
        at: now
      });
      return;
    }
    const days = (now - new Date(lastSync)) / (24 * 3600 * 1000);
    if (days > 7) {
      alerts.push({
        id: `alert_sync_${p._id}`,
        type: 'integration',
        severity: 'low',
        projectId: p._id,
        title: `${p.name} — Cashflow sync stale (${Math.round(days)}d)`,
        detail: 'Run full integration sync',
        href: '/app/dm-governance/integrations',
        at: new Date(lastSync)
      });
    }
  });

  const stored = await db
    .collection(DM_COLLECTIONS.notifications)
    .find({ acknowledged: false, ...(projectIds.length ? { projectId: { $in: [...projectIds, null] } } : {}) })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  stored.forEach((n) => {
    alerts.push({
      id: n._id,
      type: n.type || 'system',
      severity: n.severity || 'low',
      projectId: n.projectId,
      title: n.title,
      detail: n.detail,
      href: n.href,
      at: n.createdAt || now,
      acknowledged: n.acknowledged
    });
  });

  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  alerts.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

  const summary = {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    high: alerts.filter((a) => a.severity === 'high').length,
    pendingApprovals: pendingInvoices.length,
    pendingTriggers: triggers.length,
    openRisks: risks.length
  };

  return { alerts: alerts.slice(0, 50), summary, generatedAt: now.toISOString() };
}

/**
 * Persist a system notification (e.g. milestone achieved).
 * @param {import('mongodb').Db} db
 * @param {object} note
 */
export async function emitNotification(db, note) {
  const id = note._id || `ntf_${Date.now().toString(36)}`;
  const doc = {
    _id: id,
    type: note.type || 'system',
    severity: note.severity || 'medium',
    projectId: note.projectId || null,
    title: note.title,
    detail: note.detail || '',
    href: note.href || null,
    acknowledged: false,
    createdAt: new Date()
  };
  await db.collection(DM_COLLECTIONS.notifications).updateOne({ _id: id }, { $set: doc }, { upsert: true });
  return doc;
}
