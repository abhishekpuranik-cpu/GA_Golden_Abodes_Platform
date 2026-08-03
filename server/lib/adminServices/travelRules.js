import mongoose from 'mongoose';
import TravelLocation from '../../models/adminServices/travel/Location.js';
import TravelDistance from '../../models/adminServices/travel/Distance.js';
import TravelRateCard from '../../models/adminServices/travel/RateCard.js';
import TravelTrip from '../../models/adminServices/travel/Trip.js';
import TravelPolicyConfig from '../../models/adminServices/travel/PolicyConfig.js';
import { haversineMetres, pairKey, fuelAmountPaise } from './haversine.js';
import { validateAncillaryReceipts } from './attachments.js';
import { notDeletedFilter } from './mongoose.js';
import { POLICY_DEFAULTS } from './constants.js';
import { writeAdminServicesAudit } from './audit.js';

export async function getPolicy(entityTag) {
  let doc = await TravelPolicyConfig.findOne(notDeletedFilter({ entityTag }));
  if (!doc) {
    doc = await TravelPolicyConfig.create({ entityTag, ...POLICY_DEFAULTS });
  }
  return doc;
}

export async function resolveRateCard(entityTag, vehicleType, travelDate) {
  const d = new Date(travelDate);
  const cards = await TravelRateCard.find(notDeletedFilter({
    entityTag,
    vehicleType,
    effectiveFrom: { $lte: d }
  })).sort({ effectiveFrom: -1 });

  for (const c of cards) {
    if (!c.effectiveTo || c.effectiveTo >= d) return c;
  }
  return null;
}

/**
 * Build ordered stop ids (with round-trip append).
 */
export function expandRoute(routeIds, isRoundTrip) {
  const ids = (routeIds || []).map((id) => String(id));
  if (ids.length < 2) {
    const err = new Error('route requires at least 2 stops');
    err.status = 400;
    throw err;
  }
  if (isRoundTrip) ids.push(ids[0]);
  return ids;
}

/**
 * Preview / compute distance from locked matrix. Discards any client distance (BR-01).
 */
export async function computeRouteDistance({ routeIds, isRoundTrip, roadFactor, discardClientDistance, clientDistance, user }) {
  if (clientDistance != null && discardClientDistance !== false) {
    await writeAdminServicesAudit({
      entityType: 'travelTrip',
      entityId: '',
      action: 'discard_client_distance',
      userId: user?.id || user?._id,
      userEmail: user?.email,
      meta: { clientDistance },
      reason: 'BR-01'
    });
  }

  const stops = expandRoute(routeIds, isRoundTrip);
  const locs = await TravelLocation.find({
    _id: { $in: stops },
    ...notDeletedFilter()
  }).lean();
  const byId = new Map(locs.map((l) => [String(l._id), l]));

  const legs = [];
  let totalMetres = 0;
  let claimableMetres = 0;
  let allVerified = true;
  const homeLegs = [];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const aId = stops[i];
    const bId = stops[i + 1];
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) {
      const err = new Error(`Unknown location in route: ${aId} → ${bId}`);
      err.status = 400;
      throw err;
    }

    const key = pairKey(aId, bId);
    let pair = await TravelDistance.findOne(notDeletedFilter({ pairKey: key }));
    if (!pair) {
      const straight = haversineMetres(a.lat, a.lng, b.lat, b.lng);
      const factor = Number(roadFactor) || POLICY_DEFAULTS.roadFactor;
      pair = await TravelDistance.create({
        pairKey: key,
        locationAId: aId < bId ? aId : bId,
        locationBId: aId < bId ? bId : aId,
        distanceMetres: Math.round(straight * factor),
        straightLineMetres: straight,
        isVerified: false,
        source: 'ESTIMATE'
      });
    }

    const metres = pair.distanceMetres;
    const verified = !!pair.isVerified;
    if (!verified) allVerified = false;

    const touchesHome = a.category === 'EMPLOYEE_HOME' || b.category === 'EMPLOYEE_HOME';
    legs.push({
      fromId: aId,
      toId: bId,
      fromName: a.name,
      toName: b.name,
      distanceMetres: metres,
      verified,
      source: pair.source,
      touchesHome
    });
    totalMetres += metres;
    if (touchesHome) homeLegs.push(i);
    else claimableMetres += metres;
  }

  return {
    stops,
    legs,
    totalMetres,
    claimableMetres,
    allVerified,
    homeLegs,
    basis: allVerified ? 'VERIFIED' : 'PARTIAL_ESTIMATE'
  };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function dateOnlyKey(d) {
  const x = new Date(d);
  return x.toISOString().slice(0, 10);
}

/**
 * Apply BR-01..BR-14 flags and compute money fields for a trip payload.
 */
export async function buildTripComputed(input, { user, confirmDuplicate = false }) {
  const {
    entityTag,
    employeeId,
    travelDate,
    purpose,
    purposeNote,
    vehicleType,
    route,
    isRoundTrip,
    isOverride,
    overrideReason,
    claimedDistanceMetres: clientClaimed,
    distanceMetres: clientDistance,
    ancillary,
    remarks,
    departmentId,
    employeeEntityTag
  } = input;

  if (clientDistance != null || clientClaimed != null) {
    /* BR-01 logged inside computeRouteDistance / below */
  }

  const policy = await getPolicy(entityTag);
  const preview = await computeRouteDistance({
    routeIds: route,
    isRoundTrip,
    roadFactor: policy.roadFactor,
    clientDistance: clientDistance ?? clientClaimed,
    discardClientDistance: true,
    user
  });

  let computed = preview.claimableMetres;
  const flags = new Set();

  // BR-08 home legs
  if (!policy.homeToOfficeClaimable && preview.homeLegs.length) {
    flags.add('EXC_HOME_LEG');
    computed = preview.claimableMetres;
  } else if (policy.homeToOfficeClaimable) {
    computed = preview.totalMetres;
  }

  // BR-09 unverified
  if (!preview.allVerified) flags.add('EXC_UNVERIFIED');

  // BR-13 cross entity
  if (employeeEntityTag && employeeEntityTag !== entityTag) {
    flags.add('EXC_CROSS_ENTITY');
  }

  // BR-06 backdating
  const today = startOfDay(new Date());
  const tDate = startOfDay(travelDate);
  const diffDays = Math.floor((today - tDate) / (24 * 3600 * 1000));
  if (diffDays > (policy.backdatingWindowDays || 0)) flags.add('EXC_BACKDATED');

  // BR-02 override
  let claimed = computed;
  let basis = preview.allVerified ? 'VERIFIED' : 'PARTIAL_ESTIMATE';
  let override = false;
  if (isOverride) {
    const reason = String(overrideReason || '');
    if (reason.trim().length < 15) {
      const err = new Error('overrideReason must be at least 15 characters (BR-02)');
      err.status = 400;
      throw err;
    }
    if (clientClaimed == null) {
      const err = new Error('claimedDistanceMetres required when isOverride');
      err.status = 400;
      throw err;
    }
    claimed = Math.round(Number(clientClaimed));
    override = true;
    basis = 'OVERRIDE';
    flags.add('EXC_OVERRIDE');
  }

  // BR-07 daily cap
  const dayStart = startOfDay(travelDate);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const dayTrips = await TravelTrip.find(notDeletedFilter({
    employeeId,
    travelDate: { $gte: dayStart, $lt: dayEnd },
    status: { $nin: ['REJECTED'] }
  })).lean();
  const dayTotalM = dayTrips.reduce((s, t) => s + (t.claimedDistanceMetres || 0), 0) + claimed;
  const dailyCapM = (policy.dailyCapKm || 150) * 1000;
  if (claimed > dailyCapM || dayTotalM > dailyCapM) flags.add('EXC_DAILY_CAP');

  // BR-05 duplicate
  const routeKey = expandRoute(route, isRoundTrip).join('|');
  const sameDay = dayTrips.filter((t) => {
    const r = expandRoute(t.route.map(String), t.isRoundTrip).join('|');
    return r === routeKey;
  });
  if (sameDay.length && !confirmDuplicate) {
    flags.add('EXC_DUPLICATE');
    const err = new Error('Duplicate trip for same date and route — confirm to proceed (BR-05)');
    err.status = 409;
    err.code = 'DUPLICATE_TRIP';
    err.exceptionFlags = [...flags];
    throw err;
  }
  if (sameDay.length) flags.add('EXC_DUPLICATE');

  // BR-03 rate snapshot
  const rateCard = await resolveRateCard(entityTag, vehicleType, travelDate);
  const ratePerKmPaise = rateCard ? rateCard.ratePerKmPaise : 0;

  // BR-10 receipts
  const anc = validateAncillaryReceipts(ancillary || [], policy.requireReceiptAboveAncillaryPaise);
  const ancillaryTotalPaise = anc.reduce((s, a) => s + (Number(a.amountPaise) || 0), 0);

  // BR-14
  const fuel = fuelAmountPaise(claimed, ratePerKmPaise);
  const totalClaimPaise = fuel + ancillaryTotalPaise;

  return {
    entityTag,
    employeeId,
    travelDate: tDate,
    purpose,
    purposeNote: purposeNote || '',
    vehicleType,
    route: route.map((id) => new mongoose.Types.ObjectId(id)),
    isRoundTrip: !!isRoundTrip,
    computedDistanceMetres: computed,
    claimedDistanceMetres: claimed,
    isOverride: override,
    overrideReason: override ? String(overrideReason) : '',
    distanceBasis: basis,
    ratePerKmPaise,
    fuelAmountPaise: fuel,
    ancillary: anc,
    ancillaryTotalPaise,
    totalClaimPaise,
    exceptionFlags: [...flags],
    remarks: remarks || '',
    departmentId: departmentId || '',
    preview
  };
}

export function hasUnresolvedExceptions(trip) {
  const flags = trip.exceptionFlags || [];
  if (!flags.length) return false;
  const resolved = new Set(
    (trip.exceptionResolutions || [])
      .filter((r) => r.resolution === 'accepted' || r.resolution === 'rejected')
      .map((r) => r.flag)
  );
  return flags.some((f) => !resolved.has(f));
}

/** BR-04: resolve who may approve a claim for this employee. */
export function resolveApproverUserId(policy, employeeId) {
  const finalId = policy.finalApproverUserId ? String(policy.finalApproverUserId) : null;
  const altId = policy.alternateApproverUserId ? String(policy.alternateApproverUserId) : null;
  const emp = String(employeeId);
  if (finalId && finalId === emp) {
    if (!altId) {
      const err = new Error(
        'Self-approval blocked (BR-04): alternateApproverUserId is not set on travelPolicyConfig'
      );
      err.status = 403;
      err.code = 'ALTERNATE_APPROVER_REQUIRED';
      throw err;
    }
    return altId;
  }
  return finalId;
}

export function assertNotSelfActor(actorId, employeeId, actionLabel) {
  if (String(actorId) === String(employeeId)) {
    const err = new Error(`No self-${actionLabel} (BR-04)`);
    err.status = 403;
    err.code = 'NO_SELF_APPROVAL';
    throw err;
  }
}

export { fuelAmountPaise, pairKey, haversineMetres, dateOnlyKey };
