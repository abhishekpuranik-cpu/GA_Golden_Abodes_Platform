/**
 * Unit-test authority cascade + exclusions-first rulebook (Node mirror of client logic).
 */
function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function resolveCascade(eng, loc) {
  const nVillage = norm(loc.village);
  const hits = (eng.authority_register || []).filter((r) => {
    if (!r) return false;
    if (norm(r.state) && loc.state && norm(r.state) !== norm(loc.state)) return false;
    const names = [r.village].concat(Array.isArray(r.aliases) ? r.aliases : []);
    return names.some((n) => norm(n) === nVillage && nVillage);
  });
  if (hits.length && nVillage) {
    hits.sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    const best = hits[0];
    return {
      planning_authority: best.planning_authority,
      confidence: Number(best.confidence) || (best.source_type === 'architect_opinion' ? 95 : 90),
      certainty: 'CONFIRMED',
      provisional: false,
      match_level: 'village'
    };
  }
  const talukaHit = (eng.authority_defaults || []).find(
    (d) =>
      d &&
      norm(d.taluka) &&
      norm(d.taluka) === norm(loc.taluka) &&
      (!d.district || !loc.district || norm(d.district) === norm(loc.district))
  );
  if (talukaHit && norm(loc.taluka)) {
    return {
      planning_authority: talukaHit.planning_authority,
      confidence: 70,
      certainty: 'PROVISIONAL',
      provisional: true,
      match_level: 'taluka'
    };
  }
  const districtHit = (eng.authority_defaults || []).find(
    (d) =>
      d &&
      (!d.taluka || !String(d.taluka).trim()) &&
      norm(d.district) === norm(loc.district) &&
      norm(loc.district)
  );
  if (districtHit) {
    return {
      planning_authority: districtHit.planning_authority,
      confidence: 50,
      certainty: 'PROVISIONAL',
      provisional: true,
      match_level: 'district'
    };
  }
  return {
    planning_authority: null,
    confidence: 0,
    certainty: 'UNKNOWN',
    provisional: false,
    match_level: 'none'
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Empty tables → UNKNOWN (never UNMAPPED)
let r = resolveCascade({ authority_register: [], authority_defaults: [] }, {
  village: 'Mulshi',
  taluka: 'Mulshi',
  district: 'Pune',
  state: 'Maharashtra'
});
assert(r.certainty === 'UNKNOWN' && r.planning_authority === null, 'empty → UNKNOWN');

// District default
r = resolveCascade(
  {
    authority_register: [],
    authority_defaults: [{ id: '1', district: 'Pune', taluka: '', planning_authority: 'PMRDA', confidence: 50 }]
  },
  { village: 'X', taluka: 'Y', district: 'Pune', state: 'Maharashtra' }
);
assert(r.match_level === 'district' && r.confidence === 50 && r.provisional, 'district default');

// Taluka beats district
r = resolveCascade(
  {
    authority_register: [],
    authority_defaults: [
      { id: '1', district: 'Pune', taluka: '', planning_authority: 'PMRDA' },
      { id: '2', district: 'Pune', taluka: 'Mulshi', planning_authority: 'PCMC' }
    ]
  },
  { village: 'X', taluka: 'Mulshi', district: 'Pune', state: 'Maharashtra' }
);
assert(r.match_level === 'taluka' && r.planning_authority === 'PCMC' && r.confidence === 70, 'taluka default');

// Architect register beats defaults
r = resolveCascade(
  {
    authority_register: [
      {
        village: 'Nande',
        aliases: ['Nande Budruk'],
        district: 'Pune',
        planning_authority: 'PMRDA',
        source_type: 'architect_opinion',
        confidence: 95
      }
    ],
    authority_defaults: [{ district: 'Pune', taluka: '', planning_authority: 'Collector' }]
  },
  { village: 'Nande Budruk', taluka: 'Mulshi', district: 'Pune', state: 'Maharashtra' }
);
assert(r.match_level === 'village' && r.certainty === 'CONFIRMED' && r.confidence === 95, 'architect register via alias');

console.log('authority cascade tests OK');
