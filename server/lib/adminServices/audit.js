import { ensureMongo } from '../mongo.js';

const COLLECTION = 'adminServicesAuditLogs';

/**
 * Platform-style audit writer for Admin Services (no shared vault audit existed).
 */
export async function writeAdminServicesAudit(entry) {
  const db = await ensureMongo();
  if (!db) return null;
  const doc = {
    at: new Date(),
    entityType: String(entry.entityType || ''),
    entityId: String(entry.entityId || ''),
    action: String(entry.action || 'update'),
    userId: entry.userId ? String(entry.userId) : null,
    userEmail: entry.userEmail || null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason || null,
    meta: entry.meta || null
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function ensureAuditIndexes() {
  const db = await ensureMongo();
  if (!db) return;
  await db.collection(COLLECTION).createIndex({ entityType: 1, entityId: 1, at: -1 });
  await db.collection(COLLECTION).createIndex({ at: -1 });
}
