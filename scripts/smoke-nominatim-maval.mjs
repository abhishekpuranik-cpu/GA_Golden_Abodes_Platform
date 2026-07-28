/**
 * Live Nominatim smoke — real reverse geocode for a Maval coordinate.
 * Does not require Mongo; hits Nominatim directly with required User-Agent.
 */
import { parseNominatimResult } from '../server/lib/v3DdGeocode.js';

const lat = 18.74820;
const lng = 73.40210; // near Lonavala / Maval belt

const url =
  'https://nominatim.openstreetmap.org/reverse?' +
  new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '18'
  }).toString();

const ua = 'GoldenAbodes-V3DD/1.0 (notifications@goldenabodes.com)';
const r = await fetch(url, {
  headers: { 'User-Agent': ua, Accept: 'application/json' }
});
if (!r.ok) {
  console.error('Nominatim HTTP', r.status);
  process.exit(1);
}
const payload = await r.json();
const parsed = parseNominatimResult(payload);
console.log(
  JSON.stringify(
    {
      ok: true,
      lat,
      lng,
      village: parsed.village,
      taluka: parsed.taluka,
      district: parsed.district,
      state: parsed.state,
      formatted: parsed.formatted,
      status: parsed.status
    },
    null,
    2
  )
);
if (!parsed.village) {
  console.error('No village resolved');
  process.exit(2);
}
