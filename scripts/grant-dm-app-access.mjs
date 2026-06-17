import { ensureMongo, closeMongo } from '../server/lib/mongo.js';

const db = await ensureMongo();
if (!db) {
  console.error('Mongo unavailable');
  process.exit(1);
}

await db.collection('auth_roles').updateMany(
  { _id: { $in: ['admin', 'viewer'] } },
  { $addToSet: { allowedApps: 'dm_spv_governance' } }
);
await db.collection('auth_users').updateMany(
  { roleIds: 'admin' },
  { $addToSet: { allowedApps: 'dm_spv_governance' } }
);

const admin = await db.collection('auth_roles').findOne({ _id: 'admin' });
console.log('Updated. Admin allowedApps:', (admin?.allowedApps || []).join(', '));
await closeMongo();
