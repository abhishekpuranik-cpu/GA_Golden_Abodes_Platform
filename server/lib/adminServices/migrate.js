import AdminServicesTab from '../../models/adminServices/Tab.js';
import TravelPolicyConfig from '../../models/adminServices/travel/PolicyConfig.js';
import TravelRateCard from '../../models/adminServices/travel/RateCard.js';
import {
  TAB_SEED, ENTITY_TAGS, PLACEHOLDER_RATES_PAISE, POLICY_DEFAULTS,
  APPROVER_LOOKUP_EMAIL, PERMS, VEHICLE_TYPES, APP_ID, APPROVAL_CHAIN_EMAIL_SEEDS
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
  const TravelApprovalChain = (await import('../../models/adminServices/travel/ApprovalChain.js')).default;
  await Promise.all([
    TravelLocation.syncIndexes(),
    TravelDistance.syncIndexes(),
    TravelTrip.syncIndexes(),
    TravelClaim.syncIndexes(),
    TravelApprovalChain.syncIndexes()
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

  // 5. Approval chains (email-resolved, idempotent)
  steps.approvalChains = await seedApprovalChainsFromEmails(db);

  return { ok: true, steps };
}

async function findUserByEmailOrName(db, email, nameHints = []) {
  if (!db) return null;
  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const byEmail = await db.collection('auth_users').findOne({
      email: em,
      status: { $ne: 'disabled' }
    });
    if (byEmail) return byEmail;
    // local-part match (mahesh@… / mahesh.xxx@…)
    const local = em.split('@')[0];
    if (local) {
      const fuzzy = await db.collection('auth_users').findOne({
        email: { $regex: `^${local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([.@]|$)`, $options: 'i' },
        status: { $ne: 'disabled' }
      });
      if (fuzzy) return fuzzy;
    }
  }
  for (const hint of nameHints) {
    const h = String(hint || '').trim();
    if (!h) continue;
    const byName = await db.collection('auth_users').findOne({
      name: { $regex: h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
      status: { $ne: 'disabled' }
    });
    if (byName) return byName;
  }
  return null;
}

/**
 * Seed standard L1→L2 chains from email config. Resolves users at runtime — no ObjectIds in code.
 */
export async function seedApprovalChainsFromEmails(db) {
  if (!db) db = await ensureMongo();
  if (!db) return { seeded: 0, skipped: true, reason: 'no db' };

  const TravelApprovalChain = (await import('../../models/adminServices/travel/ApprovalChain.js')).default;
  let seeds = APPROVAL_CHAIN_EMAIL_SEEDS;
  if (process.env.TRAVEL_CHAIN_SEED_JSON) {
    try {
      seeds = JSON.parse(process.env.TRAVEL_CHAIN_SEED_JSON);
    } catch (e) {
      console.warn('[admin-services] TRAVEL_CHAIN_SEED_JSON parse failed:', e.message);
    }
  }

  const nameHints = {
    employee: ['Mahesh'],
    l1: ['Akash'],
    l2: ['Abhishek', 'Puranik']
  };

  const results = [];
  for (const seed of seeds) {
    const employee = await findUserByEmailOrName(db, seed.employeeEmail, nameHints.employee);
    if (!employee) {
      results.push({ ok: false, employeeEmail: seed.employeeEmail, error: 'employee not found' });
      console.warn(`[admin-services] Chain seed skipped — employee not found: ${seed.employeeEmail} (also tried name Mahesh)`);
      continue;
    }
    const levels = [];
    let levelOk = true;
    for (const lv of seed.levels || []) {
      const hints = lv.level === 1 ? nameHints.l1 : lv.level === 2 ? nameHints.l2 : [];
      const u = await findUserByEmailOrName(db, lv.email, hints);
      if (!u) {
        levelOk = false;
        results.push({ ok: false, level: lv.level, email: lv.email, error: 'approver not found' });
        console.warn(`[admin-services] Chain seed skipped — L${lv.level} not found: ${lv.email}`);
        break;
      }
      levels.push({
        level: lv.level,
        approverUserId: u._id,
        label: lv.label || `L${lv.level}`
      });
      await db.collection('auth_users').updateOne(
        { _id: u._id },
        {
          $addToSet: {
            allowedApps: APP_ID,
            permissions: { $each: [PERMS.TRAVEL_VIEW, PERMS.TRAVEL_APPROVE] }
          }
        }
      );
    }
    if (!levelOk || !levels.length) continue;

    await TravelApprovalChain.findOneAndUpdate(
      { employeeUserId: employee._id, entityTag: '', isDeleted: false },
      {
        $set: {
          employeeUserId: employee._id,
          entityTag: '',
          levels,
          notes: seed.notes || 'Seeded approval chain',
          isActive: true
        }
      },
      { upsert: true }
    );
    // Employee needs claim access
    await db.collection('auth_users').updateOne(
      { _id: employee._id },
      {
        $addToSet: {
          allowedApps: APP_ID,
          permissions: { $each: [PERMS.TRAVEL_VIEW, PERMS.TRAVEL_CLAIM] }
        }
      }
    );
    results.push({
      ok: true,
      employee: employee.email,
      levels: levels.map((l) => ({ level: l.level, approverUserId: String(l.approverUserId) }))
    });
  }
  return { seeded: results.filter((r) => r.ok).length, results };
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
      await AdminServicesTab.updateOne({ key: 'travel' }, { $set: { isEnabled: true } });
      // Keep chains warm on every boot (idempotent)
      try {
        await seedApprovalChainsFromEmails();
      } catch (e) {
        console.warn('[admin-services] chain seed:', e?.message || e);
      }
      return { skipped: true };
    }
    return await migrateAdminServicesUp();
  } catch (err) {
    if (err.code === 'APPROVER_NOT_FOUND') {
      console.warn('[admin-services] Migration deferred:', err.message);
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
