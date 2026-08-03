import { EARTH_RADIUS_KM } from './constants.js';

/** Haversine distance in metres. R = 6371 km. Server-side only. */
export function haversineMetres(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c * 1000);
}

export function pairKey(idA, idB) {
  const a = String(idA);
  const b = String(idB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** BR-14: fuel = round(claimedDistanceMetres × ratePerKmPaise / 1000) once at trip level. */
export function fuelAmountPaise(claimedDistanceMetres, ratePerKmPaise) {
  const m = Number(claimedDistanceMetres) || 0;
  const r = Number(ratePerKmPaise) || 0;
  return Math.round((m * r) / 1000);
}
