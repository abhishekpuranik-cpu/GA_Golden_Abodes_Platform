/**
 * DD Engine Deploy 1 — 11 stubbed location fixtures (cascade + recommendation).
 * Stubs geocoder; does not call Nominatim.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ddResolveAuthorityCascade,
  ddResolveRulebook,
  ddRecommend,
  ddComputeMaxLandRate,
  ddDefaultRulebookSeed
} from '../client/public/legacy/dd_data/dd_engine_logic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../client/public/legacy/dd_data/authority_defaults.json'), 'utf8')
);
const rulesPack = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../client/public/legacy/dd_data/recommendation_rules.json'), 'utf8')
);

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
const rulebooks = ddDefaultRulebookSeed();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runFixture(loc, extras = {}) {
  const auth = ddResolveAuthorityCascade(eng, loc, {
    projectLocation: extras.projectLocation || loc.village,
    localityHints: [loc.village, loc.locality].filter(Boolean)
  });

  let rulebook = { rulebook: null, exclusion: false, asserted: false, reason: 'none' };
  if (auth.certainty === 'PROVISIONAL_CONFLICT') {
    // flagged, not asserted — may still surface exclusion from carve-out competing rulebooks
    const carveRbs = (auth.carve_outs_hit || []).map((c) => c.rulebook_key).filter(Boolean);
    rulebook = {
      rulebook: carveRbs.includes('HILL_STATION_EXCLUDED')
        ? rulebooks.find((b) => b.key === 'HILL_STATION_EXCLUDED')
        : carveRbs.includes('MIDC')
          ? rulebooks.find((b) => b.key === 'MIDC')
          : null,
      exclusion: carveRbs.some((k) => /EXCLUDED|MIDC|NAINA|CIDCO|GLDBCR/i.test(k)),
      asserted: false,
      reason: 'conflict_not_asserted',
      flagged_keys: carveRbs
    };
  } else if (auth.planning_authority) {
    rulebook = ddResolveRulebook(rulebooks, auth.planning_authority, auth.overlays);
  }

  const competing = auth.competing_authorities || [];
  const overlays = Array.isArray(auth.overlays) ? auth.overlays.slice() : [];
  if (extras.addOverlays) extras.addOverlays.forEach((o) => overlays.push(o));

  // Economics for REPRICED number when exclusion fires
  const econOk = extras.economics !== false;
  const land = econOk
    ? ddComputeMaxLandRate({
        gross_area_sqft: extras.gross_sqft || 40000,
        deduction_area_sqft: extras.deduction || 0,
        permissible_fsi: extras.fsi != null ? extras.fsi : rulebook.exclusion ? 0.6 : 1.1,
        zone_code: extras.zone_code || (rulebook.exclusion ? 'R1' : 'UNKNOWN'),
        targetMarginPct: 0.2,
        softCostPct: 0.15,
        realisableRatePerSqft: 9000,
        constructionRate: 3500,
        confidence: 70,
        range_band_pct: 8
      })
    : ddComputeMaxLandRate({
        gross_area_sqft: 40000,
        deduction_area_sqft: 0,
        permissible_fsi: 1.1,
        zone_code: 'R1',
        targetMarginPct: null,
        softCostPct: null,
        realisableRatePerSqft: null,
        constructionRate: null,
        confidence: 70
      });

  const rec = ddRecommend(
    {
      certainty: auth.certainty,
      confidence: auth.confidence,
      planning_authority: auth.planning_authority,
      overlays,
      competing_authorities: competing,
      rulebook_key: rulebook.rulebook ? rulebook.rulebook.key : auth.rulebook_key || '',
      rulebook_exclusion: !!rulebook.exclusion,
      zone_code: extras.zone_code || 'UNKNOWN',
      reservation: !!extras.reservation,
      tenure_class: extras.tenure_class || '',
      flags: extras.flags || [],
      max_land_rate: land.ok ? land.maxLandRate : null,
      max_land_rate_unknown: !land.ok,
      max_land_rate_message: land.message || '',
      ask_rate_per_sqft: extras.ask || 2050,
      reliability_note: auth.reliability_note || ''
    },
    rulesPack
  );

  return { auth, rulebook, land, rec, overlays, competing };
}

const results = [];

function record(n, label, out, checks) {
  const row = {
    n,
    label,
    authority: out.auth.planning_authority,
    certainty: out.auth.certainty,
    confidence: out.auth.confidence,
    competing: out.competing,
    rulebook: out.rulebook.rulebook ? out.rulebook.rulebook.key : out.rulebook.reason,
    rulebook_asserted: !!out.rulebook.asserted,
    overlays: out.overlays,
    outcomes: out.rec.outcomes,
    flags: out.rec.flags.map((f) => ({ id: f.id, outcome: f.outcome, consequence: f.consequence })),
    awaiting_human: out.rec.awaiting_human_decision,
    auto_decided: out.rec.auto_decided,
    land: out.land.ok ? out.land.maxLandRate : out.land.message
  };
  results.push(row);
  checks(out, row);
  console.log(
    `\n#${n} ${label}\n  auth=${row.certainty} ${row.authority || '—'} @${row.confidence}` +
      (row.competing.length ? ` competing=[${row.competing.join('; ')}]` : '') +
      `\n  rulebook=${row.rulebook} asserted=${row.rulebook_asserted}` +
      `\n  overlays=${JSON.stringify(row.overlays)}` +
      `\n  outcomes=${row.outcomes.join('+')}` +
      `\n  flags=${row.flags.length} awaiting_human=${row.awaiting_human}`
  );
}

// 1 Kusgaon Bk / Maval — Lonavala carve-out
record(
  1,
  'Maval / Kusgaon Bk',
  runFixture(
    { state: 'Maharashtra', district: 'Pune', taluka: 'Maval', village: 'Kusgaon Bk', locality: 'Kusgaon' },
    { projectLocation: 'Kusgaon Lonavala', zone_code: 'R1', fsi: 0.6 }
  ),
  (out) => {
    assert(out.auth.certainty === 'PROVISIONAL_CONFLICT', '1 certainty');
    assert(out.auth.confidence === 50, '1 conf');
    assert(out.competing.some((c) => /Lonavala/i.test(c)), '1 Lonavala');
    assert(out.competing.some((c) => /PMRDA/i.test(c)), '1 PMRDA');
    assert(!out.rulebook.asserted, '1 rulebook not asserted');
    assert(out.rec.outcomes.includes('REPRICED') || out.rec.outcomes.includes('DELAYED'), '1 has REPRICED or DELAYED');
    // Expect both when exclusion + ESA overlay on Maval
    assert(out.rec.outcomes.includes('DELAYED'), '1 DELAYED from ESA/hill');
    assert(out.rec.outcomes.includes('REPRICED'), '1 REPRICED from exclusion');
  }
);

// 2 Hinjewadi
record(
  2,
  'Mulshi / Hinjewadi',
  runFixture(
    { state: 'Maharashtra', district: 'Pune', taluka: 'Mulshi', village: 'Hinjewadi' },
    { projectLocation: 'Hinjewadi' }
  ),
  (out) => {
    assert(out.auth.certainty === 'PROVISIONAL_CONFLICT', '2 conflict');
    assert(out.competing.some((c) => /MIDC/i.test(c)), '2 MIDC');
    assert(out.competing.some((c) => /PMRDA/i.test(c)), '2 PMRDA');
    assert(!out.rulebook.asserted, '2 not asserted');
    assert(out.rec.outcomes.includes('DELAYED'), '2 DELAYED');
    assert(!out.rec.outcomes.includes('DEAD'), '2 not DEAD');
  }
);

// 3 Pirangut
record(
  3,
  'Mulshi / Pirangut',
  runFixture({ state: 'Maharashtra', district: 'Pune', taluka: 'Mulshi', village: 'Pirangut' }, {}),
  (out) => {
    assert(out.auth.planning_authority === 'PMRDA', '3 PMRDA');
    assert(out.auth.certainty === 'PROVISIONAL', '3 PROVISIONAL');
    assert(out.auth.confidence === 70, '3 conf 70');
    assert(out.rulebook.rulebook && out.rulebook.rulebook.key === 'UDCPR_2020', '3 UDCPR');
    // PROVISIONAL alone must not drive — OPEN expected (ESA overlay on Mulshi may DELAYED)
    // Mulshi has ESA_WESTERN_GHATS_WEST overlay on taluka default — that CAN drive DELAYED
    if (out.overlays.some((o) => /ESA/i.test(o))) {
      assert(out.rec.outcomes.includes('DELAYED') || out.rec.outcomes.includes('OPEN'), '3 ESA path');
    } else {
      assert(out.rec.outcomes.includes('OPEN'), '3 OPEN');
    }
  }
);

// 4 Wakad — deliberate seed-bug report (do not fix)
const wakad = runFixture(
  { state: 'Maharashtra', district: 'Pune', taluka: 'Mulshi', village: 'Wakad' },
  { projectLocation: 'Wakad' }
);
record(4, 'Mulshi / Wakad (seed-bug probe)', wakad, () => {
  /* report only */
});
console.log(
  '  FIXTURE 4 REPORT: cascade returned',
  JSON.stringify({
    certainty: wakad.auth.certainty,
    authority: wakad.auth.planning_authority,
    confidence: wakad.auth.confidence,
    match_level: wakad.auth.match_level,
    competing: wakad.competing,
    note:
      'Wakad is listed under Haveli PCMC carve-out aliases, not Mulshi. Mulshi carve-out only aliases PCMC without Wakad — so village name Wakad under Mulshi may miss PCMC conflict.'
  })
);

// 5 Kalher / Bhiwandi
record(
  5,
  'Bhiwandi / Kalher',
  runFixture(
    { state: 'Maharashtra', district: 'Thane', taluka: 'Bhiwandi', village: 'Kalher' },
    { projectLocation: 'Kalher BSNA' }
  ),
  (out) => {
    assert(out.auth.certainty === 'PROVISIONAL_CONFLICT', '5 conflict');
    assert(out.competing.some((c) => /BSNA/i.test(c)), '5 BSNA');
    assert(!out.rulebook.asserted, '5 not asserted');
    assert(out.rec.outcomes.includes('DELAYED'), '5 DELAYED');
  }
);

// 6 Kharghar
record(
  6,
  'Panvel / Kharghar',
  runFixture(
    { state: 'Maharashtra', district: 'Raigad', taluka: 'Panvel', village: 'Kharghar' },
    { projectLocation: 'Kharghar' }
  ),
  (out) => {
    assert(out.auth.certainty === 'PROVISIONAL_CONFLICT', '6 conflict');
    assert(out.competing.some((c) => /CIDCO/i.test(c)), '6 CIDCO');
    // NAINA / Panvel MC may also appear depending on carve-outs
    assert(!out.rulebook.asserted, '6 not asserted');
    assert(out.rec.outcomes.includes('DELAYED'), '6 DELAYED');
  }
);

// 7 Marol / Mumbai Suburban wildcard
record(
  7,
  'Andheri / Marol (wildcard taluka *)',
  runFixture(
    { state: 'Maharashtra', district: 'Mumbai Suburban', taluka: 'Andheri', village: 'Marol' },
    { projectLocation: 'Marol Andheri MIDC' }
  ),
  (out) => {
    assert(out.auth.certainty === 'PROVISIONAL_CONFLICT' || out.auth.planning_authority === 'MCGM', '7 matched suburban rule');
    if (out.auth.certainty === 'PROVISIONAL_CONFLICT') {
      assert(out.competing.some((c) => /MIDC/i.test(c)), '7 MIDC carve-out');
      assert(!out.rulebook.asserted || (out.rulebook.flagged_keys || []).includes('MIDC'), '7 MIDC not UDCPR');
    }
    assert(!(out.rulebook.rulebook && out.rulebook.rulebook.key === 'UDCPR_2020' && out.rulebook.asserted), '7 never asserts UDCPR');
    assert(out.rec.outcomes.includes('DELAYED') || out.rec.outcomes.includes('OPEN'), '7 DELAYED/OPEN');
  }
);

// 8 Calangute
record(
  8,
  'Bardez / Calangute',
  runFixture(
    { state: 'Goa', district: 'North Goa', taluka: 'Bardez', village: 'Calangute' },
    { projectLocation: 'Calangute', addOverlays: ['CRZ'] }
  ),
  (out) => {
    assert(out.auth.certainty === 'PROVISIONAL_CONFLICT', '8 conflict');
    assert(out.competing.some((c) => /NGPDA/i.test(c)), '8 NGPDA');
    // rulebook GLDBCR may be on carve-out, not asserted as taluka default
    assert(out.rec.outcomes.includes('DELAYED'), '8 DELAYED CRZ');
  }
);

// 9 Otur / Junnar
record(
  9,
  'Junnar / Otur',
  runFixture({ state: 'Maharashtra', district: 'Pune', taluka: 'Junnar', village: 'Otur' }, {}),
  (out) => {
    assert(/Collector/i.test(out.auth.planning_authority || ''), '9 Collector');
    assert(out.auth.confidence === 70, '9 conf');
    assert(out.rulebook.rulebook && out.rulebook.rulebook.key === 'UDCPR_2020', '9 UDCPR');
    // Collector PROVISIONAL — overlays empty on Junnar → OPEN
    assert(out.rec.outcomes.includes('OPEN') || out.rec.outcomes.every((o) => o !== 'DEAD'), '9 OPEN-ish');
  }
);

// 10 Panchgani / Wai — no taluka rule expected
record(
  10,
  'Wai / Panchgani',
  runFixture({ state: 'Maharashtra', district: 'Satara', taluka: 'Wai', village: 'Panchgani' }, {}),
  (out) => {
    assert(
      out.auth.certainty === 'UNKNOWN' || out.auth.match_level === 'district' || out.auth.match_level === 'none',
      '10 fallback or UNKNOWN'
    );
    assert(out.rec.outcomes.includes('OPEN') || !out.rec.outcomes.includes('DEAD'), '10 OPEN');
  }
);

// 11 geocode nothing
record(
  11,
  'geocode empty → UNKNOWN',
  runFixture({ state: '', district: '', taluka: '', village: '' }, {}),
  (out) => {
    assert(out.auth.certainty === 'UNKNOWN', '11 UNKNOWN');
    assert(out.rec.outcomes.includes('OPEN'), '11 OPEN');
    assert(out.rec.awaiting_human_decision === true, '11 human');
  }
);

// Cross-cutting asserts
results.forEach((r) => {
  assert(!r.outcomes.includes('DEAD'), `#${r.n} must not auto-DEAD`);
  assert(r.awaiting_human === true, `#${r.n} awaiting human`);
  assert(r.auto_decided === false, `#${r.n} not auto-decided`);
  if (r.outcomes.includes('REPRICED')) {
    const ok =
      (typeof r.land === 'object' && r.land != null) ||
      typeof r.land === 'number' ||
      (typeof r.land === 'string' && /unavailable|config|Zone/i.test(r.land));
    assert(ok, `#${r.n} REPRICED must have number or config message`);
  }
  r.flags.forEach((f) => {
    assert(f.consequence && String(f.consequence).length > 5, `#${r.n} flag ${f.id} needs consequence`);
  });
});

// PROVISIONAL alone: Pirangut without treating ESA — already covered; add pure PROVISIONAL with no overlays
const pure = runFixture(
  { state: 'Maharashtra', district: 'Pune', taluka: 'Junnar', village: 'Otur' },
  {}
);
assert(pure.auth.certainty === 'PROVISIONAL', 'pure provisional');
assert(!pure.rec.outcomes.includes('DEAD'), 'provisional never DEAD');
assert(!pure.rec.outcomes.includes('REPRICED') || pure.rulebook.exclusion, 'provisional alone no REPRICED');

console.log('\n=== ALL 11 FIXTURES COMPLETE ===');
console.log(
  JSON.stringify(
    {
      fixture4: {
        certainty: wakad.auth.certainty,
        authority: wakad.auth.planning_authority,
        confidence: wakad.auth.confidence,
        match_level: wakad.auth.match_level,
        competing: wakad.competing,
        outcomes: wakad.rec.outcomes
      },
      summary: results.map((r) => ({
        n: r.n,
        certainty: r.certainty,
        auth: r.authority,
        conf: r.confidence,
        rb: r.rulebook,
        outcomes: r.outcomes
      }))
    },
    null,
    2
  )
);
