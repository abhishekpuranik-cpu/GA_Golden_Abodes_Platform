import { ObjectId } from 'mongodb';
import { ensureMongo } from '../mongo.js';
import { nextReqCode } from './counter.js';

const SEED_REQ_CODE = 'GA-REQ-001';
const SEED_METAVIEW_SEARCH_ID = '05b6cff6-79e3-11f1-b456-f314c9cd3604';

export async function seedHiringIfEmpty() {
  try {
    const db = await ensureMongo();
    if (!db) return { seeded: false, error: 'MongoDB unavailable' };

    const existing = await db.collection('hiring_requisitions').findOne({
      reqCode: SEED_REQ_CODE,
      isDeleted: { $ne: true }
    });
    if (existing) return { seeded: false };

    const admin = await db.collection('auth_users').findOne({ roleIds: 'admin' });
    const createdBy = admin?._id || new ObjectId('507f1f77bcf86cd799439011');

    await db.collection('hiring_counters').updateOne(
      { _id: 'hiring_req_code' },
      { $max: { seq: 1 } },
      { upsert: true }
    );

    const sourcingMode = process.env.METAVIEW_OAUTH_TOKEN ? 'auto' : 'manual';
    const now = new Date();

    await db.collection('hiring_requisitions').insertOne({
      reqCode: SEED_REQ_CODE,
      role: 'Post Sales / CRM Manager',
      department: 'Post Sales',
      projectName: 'Group (HQ)',
      location: 'Pune (PCMC)',
      bandMinPaise: 50000000,
      bandMaxPaise: 70000000,
      experienceMinYears: 5,
      experienceMaxYears: 10,
      brief: 'Own post-booking CRM pipeline, customer communication, and coordination with legal/finance for registrations and collections.',
      headcount: 1,
      status: 'Sourcing',
      entityTag: 'GAPL',
      metaviewSearchId: SEED_METAVIEW_SEARCH_ID,
      sourcingMode,
      isDeleted: false,
      deletedAt: null,
      createdBy,
      createdAt: now,
      updatedAt: now
    });

    console.log('[Hiring] Seed requisition GA-REQ-001 loaded');
    return { seeded: true };
  } catch (err) {
    console.warn('[Hiring] Seed skipped:', err.message);
    return { seeded: false, error: err.message };
  }
}

export { nextReqCode };
