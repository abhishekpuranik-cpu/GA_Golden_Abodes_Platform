/**
 * Cascade guards + taluka normalisation + seed updates (items 0–7).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ddResolveAuthorityCascade,
  ddResolveRulebook,
  ddRecommend,
  ddRecommendWithBranches,
  ddDefaultRulebookSeed,
  ddComputeMaxLandRate,
  ddTalukaNamesMatch,
  ddNormTaluka
} from '../client/public/legacy/dd_data/dd_engine_logic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../client/public/legacy/dd_data/authority_defaults.json'), 'utf8')
);
const rulesPack = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../client/public/legacy/dd_data/recommendation_rules.json'), 'utf8')
);

function engFrom(packOverride) {
  const p = packOverride || pack;
  return {
    authority_defaults: p.rules,
    district_fallbacks: p.district_fallbacks,
    authority_register: [],
    authority_defaults_meta: {
      confidence_taluka_default: p.confidence_taluka_default,
      confidence_district_fallback: p.confidence_district_fallback,
      confidence_provisional_conflict: p.confidence_provisional_conflict
    }
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function recommendFrom(auth, extras = {}) {
  const rulebooks = ddDefaultRulebookSeed();
  let exclusion = false;
  let rbKey = '';
  if (auth.certainty === 'PROVISIONAL_CONFLICT') {
    exclusion = (auth.carve_outs_hit || []).some((c) => /HILL_STATION|EXCLUDED/i.test(c.rulebook_key || ''));
    rbKey = (auth.carve_outs_hit || []).map((c) => c.rulebook_key).filter(Boolean)[0] || '';
  } else if (auth.planning_authority) {
    const rb = ddResolveRulebook(rulebooks, auth.planning_authority, auth.overlays || []);
    exclusion = !!rb.exclusion;
    rbKey = rb.rulebook ? rb.rulebook.key : '';
  }
  const land = ddComputeMaxLandRate({
    gross_area_sqft: 40000,
    deduction_area_sqft: 0,
    permissible_fsi: exclusion ? 0.6 : 1.1,
    zone_code: exclusion ? 'R1' : 'UNKNOWN',
    targetMarginPct: 0.2,
    softCostPct: 0.15,
    realisableRatePerSqft: 9000,
    constructionRate: 3500,
    confidence: auth.confidence,
    range_band_pct: 8
  });
  return ddRecommend(
    {
      certainty: auth.certainty,
      confidence: auth.confidence,
      planning_authority: auth.planning_authority,
      overlays: auth.overlays || [],
      competing_authorities: auth.competing_authorities || [],
      rulebook_key: rbKey,
      rulebook_exclusion: exclusion,
      zone_code: extras.zone_code || 'UNKNOWN',
      degradation_flag: auth.degradation_flag || null,
      max_land_rate: land.ok ? land.maxLandRate : null,
      max_land_rate_unknown: !land.ok,
      max_land_rate_message: land.message || '',
      ask_rate_per_sqft: 2050
    },
    rulesPack
  );
}

const eng = engFrom();

// --- 0. MATCH_DEGRADED fixtures ---
// Simulate BEFORE alias fix: exact-match only engine would fail; with current engine
// aliases ARE present — so test degradation by feeding a nonsense taluka in Pune
// that won't match even after normalisation.
{
  const degraded = ddResolveAuthorityCascade(
    eng,
    {
      state: 'Maharashtra',
      district: 'Pune',
      taluka: 'Mawal Subdistrict',
      village: '',
      geocoded_locality: 'Lonavala'
    },
    { projectLocation: 'Lonavala' }
  );
  // AFTER alias fix this should NOT be degraded — Mawal→Maval
  assert(degraded.certainty === 'PROVISIONAL_CONFLICT', 'after-alias Mawal Subdistrict → conflict, got ' + degraded.certainty);
  assert(degraded.confidence === 50, 'conflict conf 50');
  assert((degraded.competing_authorities || []).some((c) => /Lonavala/i.test(c)), 'Lonavala competing');
  assert((degraded.competing_authorities || []).some((c) => /PMRDA/i.test(c)), 'PMRDA competing');
  const rec = recommendFrom(degraded);
  assert(rec.outcomes.includes('REPRICED') && rec.outcomes.includes('DELAYED'), 'live-style REPRICED+DELAYED');
  console.log('OK after-alias Mawal Subdistrict →', degraded.certainty, rec.outcomes.join('+'));
}

// BEFORE alias fix: same raw string, aliases disabled → MATCH_DEGRADED @30
{
  const before = ddResolveAuthorityCascade(
    eng,
    {
      state: 'Maharashtra',
      district: 'Pune',
      taluka: 'Mawal Subdistrict',
      village: '',
      geocoded_locality: 'Lonavala'
    },
    { projectLocation: 'Lonavala', skipTalukaAliases: true }
  );
  assert(before.certainty === 'MATCH_DEGRADED', 'BEFORE alias → MATCH_DEGRADED, got ' + before.certainty);
  assert(before.confidence === 30, 'BEFORE conf 30');
  assert(/Mawal Subdistrict/.test(before.degradation_flag || ''), 'raw Mawal Subdistrict in flag');
  const recBefore = recommendFrom(before);
  assert(recBefore.outcomes.includes('OPEN'), 'BEFORE → OPEN');
  assert(recBefore.flags[0].id === 'match_degraded', 'BEFORE flag first');
  console.log('OK BEFORE-alias Mawal Subdistrict → MATCH_DEGRADED @30');
}

// True district fallback — district with no taluka rules (invent empty district)
{
  const engEmpty = engFrom({
    ...pack,
    rules: pack.rules.filter((r) => r.district !== 'Nashik'),
    district_fallbacks: [
      ...pack.district_fallbacks,
      { state: 'Maharashtra', district: 'Nashik', planning_authority: 'Collector', rulebook_key: 'UDCPR_2020', confidence: 50 }
    ]
  });
  // ensure no Nashik taluka rules
  engEmpty.authority_defaults = engEmpty.authority_defaults.filter((r) => r.district !== 'Nashik');
  const fb = ddResolveAuthorityCascade(
    engEmpty,
    { state: 'Maharashtra', district: 'Nashik', taluka: 'Igatpuri', geocoded_locality: 'Igatpuri', village: '' },
    {}
  );
  assert(fb.certainty === 'PROVISIONAL' || fb.certainty === 'CONFIRMED', 'true fallback certainty');
  assert(fb.match_level === 'district', 'true fallback match_level district, got ' + fb.match_level);
  assert(fb.confidence === 50, 'true fallback conf 50');
  assert(fb.planning_authority === 'Collector', 'collector');
  console.log('OK true district fallback @50');
}

// --- 2. Alias pair fixtures ---
const pairs = [
  ['Maval', 'Mawal'],
  ['Haveli', 'Havali'],
  ['Mulshi', 'Mulashi'],
  ['Shirur', 'Shirur-Ghodnadi'],
  ['Velhe', 'Rajgad'],
  ['Ambarnath', 'Ambernath'],
  ['Bardez', 'Bardes'],
  ['Tiswadi', 'Ilhas'],
  ['Salcete', 'Salsette']
];
for (const [a, b] of pairs) {
  assert(ddTalukaNamesMatch(a, b), `alias pair ${a}/${b}`);
  assert(ddTalukaNamesMatch(a, a + ' Subdistrict'), `suffix ${a} Subdistrict`);
  assert(ddTalukaNamesMatch(a, a + ' Taluka'), `suffix ${a} Taluka`);
}
console.log('OK', pairs.length, 'taluka alias pairs + suffixes');

// --- 4. Wakad under Mulshi ---
{
  const w = ddResolveAuthorityCascade(
    eng,
    { state: 'Maharashtra', district: 'Pune', taluka: 'Mulshi', village: '', geocoded_locality: 'Wakad' },
    { projectLocation: 'Wakad' }
  );
  assert(w.certainty === 'PROVISIONAL_CONFLICT', 'Wakad Mulshi conflict');
  assert((w.competing_authorities || []).some((c) => /PCMC/i.test(c)), 'Wakad → PCMC');
  console.log('OK Wakad Mulshi → PCMC conflict');
}

// --- 5. NAINA village ---
{
  const n = ddResolveAuthorityCascade(
    eng,
    { state: 'Maharashtra', district: 'Raigad', taluka: 'Panvel', village: '', geocoded_locality: 'Palaspe' },
    { projectLocation: 'Palaspe' }
  );
  assert(n.certainty === 'PROVISIONAL_CONFLICT', 'Palaspe NAINA conflict');
  assert((n.competing_authorities || []).some((c) => /NAINA/i.test(c)), 'NAINA named');
  console.log('OK Palaspe → NAINA conflict');
}

// --- 6. Panchgani / Mahabaleshwar / Matheran ---
{
  const p = ddResolveAuthorityCascade(
    eng,
    { state: 'Maharashtra', district: 'Satara', taluka: 'Wai', village: '', geocoded_locality: 'Panchgani' },
    { projectLocation: 'Panchgani' }
  );
  assert(p.certainty === 'PROVISIONAL_CONFLICT', 'Panchgani conflict got ' + p.certainty);
  assert((p.competing_authorities || []).some((c) => /Panchgani/i.test(c)), 'Panchgani MC');
  const m = ddResolveAuthorityCascade(
    eng,
    { state: 'Maharashtra', district: 'Raigad', taluka: 'Karjat', village: '', geocoded_locality: 'Matheran' },
    { projectLocation: 'Matheran' }
  );
  assert(m.certainty === 'PROVISIONAL_CONFLICT', 'Matheran conflict');
  assert((m.competing_authorities || []).some((c) => /Matheran/i.test(c)), 'Matheran MC');
  const sataraFb = pack.district_fallbacks.some((d) => d.district === 'Satara');
  assert(sataraFb, 'Satara district fallback present');
  console.log('OK Panchgani + Matheran hill stations; Satara fallback');
}

// --- 7. BSNA rulebook seed ---
{
  const books = ddDefaultRulebookSeed();
  assert(books.some((b) => b.key === 'UDCPR_2020_BSNA'), 'UDCPR_2020_BSNA seeded');
  const rb = ddResolveRulebook(books, 'MMRDA (BSNA)', []);
  assert(rb.rulebook && rb.rulebook.key === 'UDCPR_2020_BSNA', 'BSNA resolves');
  console.log('OK UDCPR_2020_BSNA rulebook');
}

// --- Khandala under Maval ---
{
  const k = ddResolveAuthorityCascade(
    eng,
    { state: 'Maharashtra', district: 'Pune', taluka: 'Maval', village: '', geocoded_locality: 'Khandala' },
    { projectLocation: 'Khandala' }
  );
  assert(k.certainty === 'PROVISIONAL_CONFLICT', 'Khandala conflict');
  assert((k.competing_authorities || []).some((c) => /Lonavala/i.test(c)), 'Khandala → Lonavala MC');
  console.log('OK Khandala → Lonavala MC carve-out');
}

// --- Branch-labelled outcomes under PROVISIONAL_CONFLICT (live Maval pin style) ---
{
  const maval = ddResolveAuthorityCascade(
    eng,
    {
      state: 'Maharashtra',
      district: 'Pune',
      taluka: 'Mawal Subdistrict',
      village: '',
      geocoded_locality: 'Lonavala'
    },
    { projectLocation: 'Lonavala' }
  );
  assert(maval.certainty === 'PROVISIONAL_CONFLICT', 'Maval pin conflict');
  assert((maval.competing_authorities || []).length >= 2, 'Maval has ≥2 competing');

  // Production-like: unset economics → maxLand UNKNOWN (no hardcoded rates)
  const landUnknown = ddComputeMaxLandRate({
    gross_area_sqft: 40000,
    deduction_area_sqft: 0,
    permissible_fsi: 0.6,
    zone_code: 'R1',
    targetMarginPct: null,
    softCostPct: null,
    realisableRatePerSqft: null,
    constructionRate: null,
    confidence: 50,
    range_band_pct: 8
  });
  assert(landUnknown.unknown === true, 'unset econ → UNKNOWN');
  assert(/economics config not set/i.test(landUnknown.message || ''), 'UNKNOWN message from config');

  const exclusion = (maval.carve_outs_hit || []).some((c) => /HILL_STATION|EXCLUDED/i.test(c.rulebook_key || ''));
  const rbKey = (maval.carve_outs_hit || []).map((c) => c.rulebook_key).filter(Boolean)[0] || '';
  const facts = {
    certainty: maval.certainty,
    confidence: maval.confidence,
    planning_authority: maval.planning_authority,
    overlays: maval.overlays || [],
    competing_authorities: maval.competing_authorities || [],
    rulebook_key: rbKey,
    rulebook_exclusion: exclusion,
    zone_code: 'UNKNOWN',
    max_land_rate: null,
    max_land_rate_unknown: true,
    max_land_rate_message: landUnknown.message,
    ask_rate_per_sqft: null
  };
  const branched = ddRecommendWithBranches(facts, rulesPack, ddDefaultRulebookSeed());
  assert(branched.worst_case === true, 'worst_case badge');
  assert(Array.isArray(branched.branches) && branched.branches.length >= 2, 'both branches rendered');
  const lonavala = branched.branches.find((b) => /Lonavala/i.test(b.authority || b.label || ''));
  const pmrda = branched.branches.find((b) => /PMRDA/i.test(b.authority || b.label || ''));
  assert(lonavala, 'Lonavala MC branch present');
  assert(pmrda, 'PMRDA branch present');
  assert(lonavala.outcomes.includes('REPRICED'), 'Lonavala → REPRICED');
  assert(lonavala.outcomes.includes('DELAYED'), 'Lonavala → DELAYED');
  assert(lonavala.amount_unavailable && /Repriced/i.test(lonavala.amount_unavailable.message || ''), 'Lonavala amount unavailable line');
  assert(pmrda.outcomes.includes('OPEN') && pmrda.outcomes.length === 1, 'PMRDA → OPEN alone, got ' + pmrda.outcomes.join('+'));
  assert(branched.outcomes.includes('REPRICED') && branched.outcomes.includes('DELAYED'), 'overall worst = REPRICED+DELAYED');
  assert(/Confirming the authority moves this from REPRICED\+DELAYED to OPEN/i.test(branched.conflict_worth || ''), 'conflict worth line, got: ' + branched.conflict_worth);
  console.log('OK Maval pin branch outcomes', {
    lonavala: lonavala.outcomes.join('+'),
    pmrda: pmrda.outcomes.join('+'),
    worth: branched.conflict_worth
  });
}

console.log('\n=== ALL GUARD / ALIAS / SEED FIXTURES PASSED ===');
console.log('rules=', pack.rules.length, 'fallbacks=', pack.district_fallbacks.length);
