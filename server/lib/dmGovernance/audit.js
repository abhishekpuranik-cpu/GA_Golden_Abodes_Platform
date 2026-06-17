import { DM_COLLECTIONS } from './collections.js';

/**
 * @param {import('mongodb').Db} db
 * @param {object} entry
 */
export async function writeDmAudit(db, entry) {
  const doc = {
    at: new Date(),
    entityType: String(entry.entityType || ''),
    entityId: String(entry.entityId || ''),
    action: String(entry.action || 'update'),
    userId: entry.userId || null,
    userEmail: entry.userEmail || null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason || null,
    meta: entry.meta || null
  };
  await db.collection(DM_COLLECTIONS.auditLogs).insertOne(doc);
  return doc;
}
