import AdminServicesTab from '../../models/adminServices/Tab.js';
import TravelPolicyConfig from '../../models/adminServices/travel/PolicyConfig.js';
import TravelRateCard from '../../models/adminServices/travel/RateCard.js';
import {
  TAB_SEED, ENTITY_TAGS, PLACEHOLDER_RATES_PAISE, POLICY_DEFAULTS,
  APPROVER_LOOKUP_EMAIL, PERMS, VEHICLE_TYPES, APP_ID
} from './constants.js';
import { ensureAdminServicesMongoose } from './mongoose.js';
import { ensureAuditIndexes } from './audit.js';
import { ensureMongo } from '../mongo.js';

export async function ensureAdminServicesIndexes() {
  await ensureAdminServicesMongoose();
  await Promise.all([
    AdminServicesTab.syncIndexes(),
    TravelPolicyConfig.syncIndexes(),
    TravelRateCard.syncIndexes()
  ]);
  const TravelLocation = (await import('../../models/adminServices/travel/Location.js')).default;
  const TravelDistance = (await import('../../models/adminServices/travel/Distance.js')).default;
  const TravelTrip = (await import('../../models/adminServices/travel/Trip.js')).default;
  const TravelClaim = (await import('../../models/adminServices/travel/Claim.js')).default;
  await Promise.all([
    TravelLocation.syncIndexes(),
    TravelDistance.syncIndexes(),
    TravelTrip.syncIndexes(),
    TravelClaim.syncIndexes()
  ]);
  await ensureAuditIndexes();
}

/**
 * Idempotent up migration for M9.
 * @returns {{ ok: boolean, steps: object }}
 */
export async function migrateAdminServicesUp() {
  await ensureAdminServicesMongoose();
  const steps = {};

  // 1. Tabs
  for (const row of TAB_SEED) {
    await AdminServicesTab.updateOne(
      { key: row.key },
      { $setOnInsert: row },
      { upsert: true }
    );
  }
  steps.tabs = await AdminServicesTab.countDocuments();

  // 2–3 indexes already via ensure
  await ensureAdminServicesIndexes();
  steps.indexes = true;

  // 3. Policy per entity
  const db = await ensureMongo();
  let approverId = null;
  if (db) {
    const user = await db.collection('auth_users').findOne({
      email: APPROVER_LOOKUP_EMAIL.toLowerCase(),
      status: { $ne: 'disabled' }
    });
    if (!user) {
      const err = new Error(
        `M9 migration failed: user ${APPROVER_LOOKUP_EMAIL} not found — cannot seed finalApproverUserId`
      );
      err.code = 'APPROVER_NOT_FOUND';
      throw err;
    }
    approverId = user._id;
    steps.approverResolved = String(approverId);

    // Seed permissions on that user (additive)
    await db.collection('auth_users').updateOne(
      { _id: user._id },
      {
        $addToSet: {
          allowedApps: APP_ID,
          permissions: {
            $each: [
              PERMS.TRAVEL_VIEW,
              PERMS.TRAVEL_CLAIM,
              PERMS.TRAVEL_VERIFY,
              PERMS.TRAVEL_APPROVE,
              PERMS.TRAVEL_ADMIN,
              PERMS.TRAVEL_SETTLE
            ]
          }
        }
      }
    );

    // Admin role gets app
    await db.collection('auth_roles').updateOne(
      { _id: 'admin' },
      { $addToSet: { allowedApps: APP_ID } }
    );
  }

  for (const entityTag of ENTITY_TAGS) {
    await TravelPolicyConfig.updateOne(
      { entityTag },
      {
        $setOnInsert: {
          entityTag,
          ...POLICY_DEFAULTS,
          finalApproverUserId: approverId
        }
      },
      { upsert: true }
    );
    // If policy exists without approver, set it once
    await TravelPolicyConfig.updateOne(
      { entityTag, finalApproverUserId: null },
      { $set: { finalApproverUserId: approverId } }
    );
  }
  steps.policies = await TravelPolicyConfig.countDocuments();

  // 4. Placeholder rate cards — current month 1st
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let rateUpserts = 0;
  for (const entityTag of ENTITY_TAGS) {
    for (const vehicleType of VEHICLE_TYPES) {
      const existing = await TravelRateCard.findOne({
        entityTag,
        vehicleType,
        effectiveFrom: monthStart,
        isDeleted: { $ne: true }
      });
      if (!existing) {
        await TravelRateCard.create({
          entityTag,
          vehicleType,
          ratePerKmPaise: PLACEHOLDER_RATES_PAISE[vehicleType],
          effectiveFrom: monthStart,
          effectiveTo: null,
          notes: 'PLACEHOLDER — confirm before go-live'
        });
        rateUpserts += 1;
      }
    }
  }
  steps.rateCardsCreated = rateUpserts;

  return { ok: true, steps };
}

/** Reversible down — soft-disables tabs and does not drop collections. */
export async function migrateAdminServicesDown({ dryRun = true } = {}) {
  await ensureAdminServicesMongoose();
  const tabCount = await AdminServicesTab.countDocuments();
  const policyCount = await TravelPolicyConfig.countDocuments({
    notes: { $exists: false }
  });
  const placeholderRates = await TravelRateCard.countDocuments({
    notes: 'PLACEHOLDER — confirm before go-live'
  });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      wouldDisableTabs: tabCount,
      wouldRemovePlaceholderRates: placeholderRates,
      policiesUntouched: policyCount
    };
  }

  await AdminServicesTab.updateMany({}, { $set: { isEnabled: false } });
  await TravelRateCard.updateMany(
    { notes: 'PLACEHOLDER — confirm before go-live' },
    { $set: { isDeleted: true, deletedAt: new Date() } }
  );
  return { ok: true, dryRun: false, tabsDisabled: tabCount, ratesSoftDeleted: placeholderRates };
}

export async function seedAdminServicesIfNeeded() {
  try {
    await ensureAdminServicesMongoose();
    const n = await AdminServicesTab.countDocuments();
    if (n >= TAB_SEED.length) {
      // Still ensure travel enabled
      await AdminServicesTab.updateOne({ key: 'travel' }, { $set: { isEnabled: true } });
      return { skipped: true };
    }
    return await migrateAdminServicesUp();
  } catch (err) {
    if (err.code === 'APPROVER_NOT_FOUND') {
      console.warn('[admin-services] Migration deferred:', err.message);
      // Seed tabs only so shell works; policy approver set when user exists
      for (const row of TAB_SEED) {
        await AdminServicesTab.updateOne({ key: row.key }, { $setOnInsert: row }, { upsert: true });
      }
      for (const entityTag of ENTITY_TAGS) {
        await TravelPolicyConfig.updateOne(
          { entityTag },
          { $setOnInsert: { entityTag, ...POLICY_DEFAULTS } },
          { upsert: true }
        );
      }
      return { deferred: true, reason: err.message };
    }
    throw err;
  }
}
