/**
 * Cascade tests against the real authority_defaults.json seed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../client/public/legacy/dd_data/authority_defaults.json'), 'utf8')
);

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function haystack(...parts) {
  return norm(parts.filter(Boolean).join(' | '));
}

function matchCarveOuts(carveOuts, hs) {
  const hits = [];
  for (const c of carveOuts || []) {
    const names = [c.name, c.authority].concat(c.aliases || []);
    if (names.some((n) => {
      const nn = norm(n);
      return nn && hs.includes(nn);
    })) hits.push(c);
  }
  return hits;
}

function resolve(eng, loc, ctx = {}) {
  const meta = eng.authority_defaults_meta || {};
  const confTaluka = meta.confidence_taluka_default ?? 70;
  const confConflict = meta.confidence_provisional_conflict ?? 50;
  const hs = haystack(ctx.projectLocation, loc.village, loc.taluka);

  const nVillage = norm(loc.village);
  const regHits = (eng.authority_register || []).filter((r) => {
    const names = [r.village].concat(r.aliases || []);
    return names.some((n) => norm(n) === nVillage && nVillage);
  });
  if (regHits.length) {
    return { certainty: 'CONFIRMED', confidence: regHits[0].confidence || 95, match_level: 'village' };
  }

  const talukaHit = (eng.authority_defaults || []).find(
    (d) =>
      norm(d.taluka) === norm(loc.taluka) &&
      (!d.district || !loc.district || norm(d.district) === norm(loc.district))
  );
  if (talukaHit) {
    const carve = matchCarveOuts(talukaHit.carve_outs, hs);
    if (carve.length) {
      return {
        certainty: 'PROVISIONAL_CONFLICT',
        confidence: confConflict,
        match_level: 'taluka_carve_out',
        planning_authority: null,
        competing: carve.map((c) => c.authority)
      };
    }
    return {
      certainty: 'PROVISIONAL',
      confidence: confTaluka,
      match_level: 'taluka',
      planning_authority: talukaHit.planning_authority
    };
  }

  const df = (eng.district_fallbacks || []).find((d) => norm(d.district) === norm(loc.district));
  if (df) {
    return {
      certainty: (df.confidence ?? 50) >= 80 ? 'CONFIRMED' : 'PROVISIONAL',
      confidence: df.confidence ?? 50,
      match_level: 'district',
      planning_authority: df.planning_authority
    };
  }
  return { certainty: 'UNKNOWN', confidence: 0, match_level: 'none' };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const eng = {
  authority_defaults: pack.rules,
  district_fallbacks: pack.district_fallbacks,
  authority_register: [],
  authority_defaults_meta: {
    confidence_taluka_default: pack.confidence_taluka_default,
    confidence_district_fallback: pack.confidence_district_fallback,
    confidence_provisional_conflict: pack.confidence_provisional_conflict
  }
};

assert(pack.rules.length === 42, `expected 42 rules, got ${pack.rules.length}`);
assert(pack.district_fallbacks.length === 8, 'expected 8 district fallbacks');

let r = resolve(eng, { village: 'Somewhere', taluka: 'Mulshi', district: 'Pune', state: 'Maharashtra' }, {});
assert(r.certainty === 'PROVISIONAL' && r.planning_authority === 'PMRDA' && r.confidence === 70, 'Mulshi default PMRDA');

r = resolve(
  eng,
  { village: 'Hinjewadi', taluka: 'Mulshi', district: 'Pune', state: 'Maharashtra' },
  { projectLocation: 'Hinjewadi Pune' }
);
assert(r.certainty === 'PROVISIONAL_CONFLICT' && r.planning_authority == null, 'Hinjewadi carve-out → conflict');
assert(r.competing.includes('MIDC'), 'competing includes MIDC');

r = resolve(
  eng,
  { village: 'X', taluka: 'Maval', district: 'Pune', state: 'Maharashtra' },
  { projectLocation: 'Lonavala' }
);
assert(r.certainty === 'PROVISIONAL_CONFLICT', 'Lonavala in Maval → conflict');

r = resolve(eng, { village: 'X', taluka: 'UnknownTaluka', district: 'Pune', state: 'Maharashtra' }, {});
assert(r.match_level === 'district' && r.planning_authority.includes('Collector'), 'Pune district fallback');

r = resolve(eng, { village: 'X', taluka: 'Y', district: 'Mumbai City', state: 'Maharashtra' }, {});
assert(r.certainty === 'CONFIRMED' && r.planning_authority === 'MCGM' && r.confidence === 90, 'Mumbai City MCGM');

eng.authority_register = [
  { village: 'Nande', aliases: ['Nande Budruk'], planning_authority: 'PMRDA', confidence: 95, source_type: 'architect_opinion' }
];
r = resolve(
  eng,
  { village: 'Nande Budruk', taluka: 'Mulshi', district: 'Pune' },
  { projectLocation: 'Hinjewadi' }
);
assert(r.certainty === 'CONFIRMED' && r.match_level === 'village', 'architect register beats carve-out');

console.log('authority_defaults seed cascade tests OK', {
  rules: pack.rules.length,
  fallbacks: pack.district_fallbacks.length,
  version: pack.version
});
