/**
 * M9 unit tests — BR rules, haversine, approval engine, permissions.
 * Run: node scripts/test-m9-admin-services.mjs
 */
import assert from 'assert';
import { haversineMetres, fuelAmountPaise, pairKey } from '../server/lib/adminServices/haversine.js';
import {
  nextStatus, assertTransition, TRIP_TRANSITIONS, CLAIM_TRANSITIONS, applyTransition
} from '../server/lib/adminServices/approvalEngine.js';
import { canOpenTab, canViewTravel, canApprove, hasPerm } from '../server/lib/adminServices/access.js';
import { PERMS } from '../server/lib/adminServices/constants.js';
import { resolveApproverUserId, assertNotSelfActor } from '../server/lib/adminServices/travelRules.js';

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('M9 Admin Services tests\n');

// Haversine — reference pair labelled Pimpri-Chinchwad → Moshi corridor (~5.3 km)
{
  // Documented test fixtures (road corridor near PCMC / Moshi); straight-line target ~5.3 km
  const m = haversineMetres(18.6298, 73.7997, 18.6485, 73.8472);
  const km = m / 1000;
  assert.ok(km > 4.8 && km < 5.8, `expected ~5.3km, got ${km}`);
  ok(`Haversine Pimpri→Moshi reference ≈ ${km.toFixed(2)} km`);
}

// BR-14 rounding
{
  assert.strictEqual(fuelAmountPaise(5300, 400), Math.round((5300 * 400) / 1000));
  assert.strictEqual(fuelAmountPaise(1000, 1100), 1100);
  assert.ok(Number.isInteger(fuelAmountPaise(3333, 400)));
  ok('BR-14 fuel rounding is integer paise');
}

// pairKey stable
{
  assert.strictEqual(pairKey('b', 'a'), pairKey('a', 'b'));
  ok('pairKey is order-independent');
}

// Approval engine trip machine
{
  assert.strictEqual(nextStatus(TRIP_TRANSITIONS, 'DRAFT', 'submit'), 'SUBMITTED');
  assert.strictEqual(nextStatus(TRIP_TRANSITIONS, 'SUBMITTED', 'verify'), 'VERIFIED');
  assert.throws(() => assertTransition(TRIP_TRANSITIONS, 'DRAFT', 'approve'));
  const doc = { status: 'DRAFT', stateHistory: [] };
  applyTransition(doc, TRIP_TRANSITIONS, 'submit', { by: 'u1' });
  assert.strictEqual(doc.status, 'SUBMITTED');
  assert.strictEqual(doc.stateHistory.length, 1);
  ok('Trip state machine');
}

// Claim machine
{
  assert.strictEqual(nextStatus(CLAIM_TRANSITIONS, 'VERIFIED', 'approve'), 'APPROVED');
  assert.strictEqual(nextStatus(CLAIM_TRANSITIONS, 'APPROVED', 'pay'), 'PAID');
  ok('Claim state machine');
}

// Tab permission hide
{
  const tab = { key: 'travel', requiredPermission: PERMS.TRAVEL_VIEW, isEnabled: true };
  const noPerm = { permissions: [], roleIds: [], allowedApps: ['admin_services'] };
  assert.strictEqual(canOpenTab(noPerm, tab), false);
  assert.strictEqual(canViewTravel(noPerm), false);
  const claimer = { permissions: [PERMS.TRAVEL_CLAIM], roleIds: [], allowedApps: ['admin_services'] };
  assert.strictEqual(canOpenTab(claimer, tab), true);
  const fleet = { key: 'fleet', requiredPermission: 'ADMIN_SERVICES.FLEET.VIEW' };
  assert.strictEqual(canOpenTab(claimer, fleet), false);
  ok('Tab registry hides tabs without permission');
}

// BR-04 self-approval
{
  assert.throws(() => assertNotSelfActor('emp1', 'emp1', 'approve'));
  const policy = { finalApproverUserId: 'emp1', alternateApproverUserId: null };
  assert.throws(() => resolveApproverUserId(policy, 'emp1'));
  const withAlt = { finalApproverUserId: 'emp1', alternateApproverUserId: 'alt1' };
  assert.strictEqual(resolveApproverUserId(withAlt, 'emp1'), 'alt1');
  assert.strictEqual(resolveApproverUserId(withAlt, 'other'), 'emp1');
  ok('BR-04 self-approval / alternate approver');
}

// Permission strings
{
  const u = { permissions: [PERMS.TRAVEL_APPROVE], roleIds: [] };
  assert.strictEqual(canApprove(u), true);
  assert.strictEqual(hasPerm(u, PERMS.TRAVEL_ADMIN), false);
  ok('Fine-grained travel permissions');
}

console.log(`\n${passed} tests passed`);
