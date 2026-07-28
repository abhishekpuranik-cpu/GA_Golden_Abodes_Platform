/**
 * V3 DD Engine — pure deterministic logic (no DOM, no LLM).
 * Used by Node fixture tests and loaded by GA_OrgResourcePlanner_V3.html.
 */
export function ddNormName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function ddTextHaystack(...parts) {
  return ddNormName(parts.filter((p) => String(p || '').trim()).join(' | '));
}

export function ddMatchCarveOut(carveOuts, haystack) {
  const list = Array.isArray(carveOuts) ? carveOuts : [];
  const hits = [];
  list.forEach((c) => {
    if (!c) return;
    const names = [c.name, c.authority].concat(Array.isArray(c.aliases) ? c.aliases : []);
    const matched = names.some((n) => {
      const nn = ddNormName(n);
      return nn && haystack.indexOf(nn) >= 0;
    });
    if (matched) hits.push(c);
  });
  return hits;
}

export function ddResolveAuthorityCascade(eng, loc, ctx) {
  ctx = ctx || {};
  eng = eng || {};
  const meta = eng.authority_defaults_meta || {};
  const confTaluka = meta.confidence_taluka_default != null ? meta.confidence_taluka_default : 70;
  const confDistrict = meta.confidence_district_fallback != null ? meta.confidence_district_fallback : 50;
  const confConflict = meta.confidence_provisional_conflict != null ? meta.confidence_provisional_conflict : 50;

  const state = loc.state || '';
  const district = loc.district || '';
  const taluka = loc.taluka || '';
  const village = loc.village || '';
  const nVillage = ddNormName(village);
  const haystack = ddTextHaystack(
    ctx.projectLocation,
    village,
    loc.formatted,
    Array.isArray(ctx.localityHints) ? ctx.localityHints.join(' ') : ctx.localityHints
  );

  const hits = (eng.authority_register || []).filter((r) => {
    if (!r) return false;
    if (ddNormName(r.state) && state && ddNormName(r.state) !== ddNormName(state)) return false;
    if (ddNormName(r.district) && district && ddNormName(r.district) !== ddNormName(district)) return false;
    const names = [r.village].concat(Array.isArray(r.aliases) ? r.aliases : []);
    return names.some((n) => ddNormName(n) === nVillage && nVillage);
  });
  if (hits.length && nVillage) {
    hits.sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    const best = hits[0];
    const src = String(best.source_type || '');
    let conf = Number(best.confidence);
    if (!(conf >= 0)) conf = src === 'architect_opinion' ? 95 : 90;
    return {
      planning_authority: best.planning_authority,
      overlays: Array.isArray(best.overlays) ? best.overlays.slice() : [],
      rulebook_key: best.rulebook_key || null,
      confidence: conf,
      certainty: 'CONFIRMED',
      provisional: false,
      stale: false,
      match_level: 'village',
      carve_outs_hit: [],
      competing_authorities: [],
      reliability_note: ''
    };
  }

  // Wildcard taluka: empty taluka on rule matches any taluka in that district (e.g. Mumbai Suburban)
  const talukaHit = (eng.authority_defaults || []).find((d) => {
    if (!d) return false;
    if (d.state && state && ddNormName(d.state) !== ddNormName(state)) return false;
    if (d.district && district && ddNormName(d.district) !== ddNormName(district)) return false;
    const dt = ddNormName(d.taluka);
    if (!dt || dt === '*' || dt === 'any') return !!ddNormName(district);
    return dt === ddNormName(taluka) && !!ddNormName(taluka);
  });

  if (talukaHit && (ddNormName(taluka) || !ddNormName(talukaHit.taluka) || ddNormName(talukaHit.taluka) === '*' )) {
    const carveHits = ddMatchCarveOut(talukaHit.carve_outs, haystack);
    if (carveHits.length) {
      const competing = [];
      carveHits.forEach((c) => {
        const label = (c.authority || c.name || '') + (c.rulebook_key ? ' / ' + c.rulebook_key : '');
        if (label && competing.indexOf(label) < 0) competing.push(label);
      });
      const talukaLabel =
        (talukaHit.planning_authority || '') + (talukaHit.rulebook_key ? ' / ' + talukaHit.rulebook_key : '');
      if (talukaLabel && competing.indexOf(talukaLabel) < 0) competing.push(talukaLabel);
      return {
        planning_authority: null,
        overlays: Array.isArray(talukaHit.overlays) ? talukaHit.overlays.slice() : [],
        rulebook_key: null,
        confidence: confConflict,
        certainty: 'PROVISIONAL_CONFLICT',
        provisional: true,
        stale: false,
        match_level: 'taluka_carve_out',
        carve_outs_hit: carveHits,
        competing_authorities: competing,
        reliability_note: talukaHit.reliability_note || '',
        source_note: talukaHit.source_note || ''
      };
    }
    return {
      planning_authority: talukaHit.planning_authority,
      overlays: Array.isArray(talukaHit.overlays) ? talukaHit.overlays.slice() : [],
      rulebook_key: talukaHit.rulebook_key || null,
      confidence: confTaluka,
      certainty: 'PROVISIONAL',
      provisional: true,
      stale: false,
      match_level: 'taluka',
      carve_outs_hit: [],
      competing_authorities: [],
      reliability_note: talukaHit.reliability_note || '',
      source_note: talukaHit.source_note || ''
    };
  }

  const districtHit =
    (eng.district_fallbacks || []).find(
      (d) =>
        d &&
        ddNormName(d.district) === ddNormName(district) &&
        ddNormName(district) &&
        (!d.state || !state || ddNormName(d.state) === ddNormName(state))
    ) ||
    (eng.authority_defaults || []).find(
      (d) =>
        d &&
        (!d.taluka || !String(d.taluka).trim()) &&
        ddNormName(d.district) === ddNormName(district) &&
        ddNormName(district)
    );

  if (districtHit) {
    const dConf = districtHit.confidence != null ? Number(districtHit.confidence) : confDistrict;
    return {
      planning_authority: districtHit.planning_authority,
      overlays: Array.isArray(districtHit.overlays) ? districtHit.overlays.slice() : [],
      rulebook_key: districtHit.rulebook_key || null,
      confidence: dConf,
      certainty: dConf >= 80 ? 'CONFIRMED' : 'PROVISIONAL',
      provisional: dConf < 80,
      stale: false,
      match_level: 'district',
      carve_outs_hit: [],
      competing_authorities: [],
      reliability_note: districtHit.reliability_note || ''
    };
  }

  return {
    planning_authority: null,
    overlays: [],
    rulebook_key: null,
    confidence: 0,
    certainty: 'UNKNOWN',
    provisional: false,
    stale: false,
    match_level: 'none',
    carve_outs_hit: [],
    competing_authorities: []
  };
}

export function ddResolveRulebook(rulebooks, authorityName, overlays) {
  const auth = String(authorityName || '').trim();
  const ovs = Array.isArray(overlays) ? overlays : [];
  const books = rulebooks || [];

  function nameMatch(list, name) {
    const n = ddNormName(name);
    return (list || []).some((x) => ddNormName(x) === n);
  }

  // ESA / eco-fragile overlays delay deals — they do NOT remap the rulebook key.
  // Hill-station exclusion is authority-driven (Lonavala MC etc.), not overlay-driven.

  const dedicated = books.find((b) => b && nameMatch(b.applies_to_authorities, auth) && b.key !== 'UDCPR_2020');
  if (dedicated) {
    return {
      rulebook: dedicated,
      reason: 'authority_applies_to',
      exclusion: /EXCLUDED|MIDC|NAINA|DCPR|GLDBCR|CIDCO/i.test(dedicated.key),
      asserted: true
    };
  }

  const udcpr = books.find((b) => b && b.key === 'UDCPR_2020');
  if (udcpr && nameMatch(udcpr.excluded_authorities, auth)) {
    const exclBook =
      books.find((b) => b && b.key !== 'UDCPR_2020' && nameMatch(b.applies_to_authorities, auth)) ||
      books.find((b) => b && b.key === 'HILL_STATION_EXCLUDED');
    if (exclBook) return { rulebook: exclBook, reason: 'udcpr_exclusion', exclusion: true, asserted: true };
    return { rulebook: null, reason: 'excluded_no_book', exclusion: true, missing_key: true, asserted: false };
  }

  if (udcpr && auth) {
    return { rulebook: udcpr, reason: 'udcpr_default', exclusion: false, asserted: true };
  }

  return { rulebook: null, reason: 'unresolved', exclusion: false, missing_key: true, asserted: false };
}

/** Lookup permissible FSI from rulebook zones + road width. Missing zone → null (UNKNOWN). */
export function ddLookupPermissibleFsi(rulebook, zoneCode, roadWidthM) {
  if (!rulebook || !zoneCode || zoneCode === 'UNKNOWN' || zoneCode === 'other') return null;
  const zones = Array.isArray(rulebook.zones) ? rulebook.zones : [];
  const z = zones.find((x) => ddNormName(x.zone_code) === ddNormName(zoneCode));
  if (!z) return null;
  const road = Number(roadWidthM);
  const bands = Array.isArray(z.road_width_bands) ? z.road_width_bands : [];
  if (bands.length && Number.isFinite(road)) {
    const band = bands.find((b) => road >= Number(b.min_m || 0) && road < Number(b.max_m || 1e9));
    if (band && band.base_fsi != null) return Number(band.base_fsi);
  }
  if (z.base_fsi != null) return Number(z.base_fsi);
  return null;
}

/**
 * Residual max land Rate per Sq. Ft. — DD never invents FSI; supplies net area + FSI then computes.
 * Placeholders must not be used silently.
 */
export function ddComputeMaxLandRate(input) {
  const gross = Number(input.gross_area_sqft);
  const deduction = Number(input.deduction_area_sqft) || 0;
  const fsi = input.permissible_fsi;
  const zoneUnknown = !input.zone_code || input.zone_code === 'UNKNOWN';

  const econ = {
    targetMarginPct: input.targetMarginPct,
    softCostPct: input.softCostPct,
    realisableRatePerSqft: input.realisableRatePerSqft,
    constructionRate: input.constructionRate
  };

  const unset = Object.keys(econ).filter((k) => econ[k] == null || econ[k] === '' || !Number.isFinite(Number(econ[k])));
  if (unset.length) {
    return {
      ok: false,
      unknown: true,
      reason: 'config_unset',
      message: 'Land rate unavailable — economics config not set',
      unset_keys: unset,
      net_developable_area: Number.isFinite(gross) ? Math.max(0, gross - deduction) : null,
      buildable_area: null,
      maxLandRate: null
    };
  }

  if (!Number.isFinite(gross) || gross <= 0) {
    return {
      ok: false,
      unknown: true,
      reason: 'no_gross_area',
      message: 'Land rate unavailable — gross area not set',
      net_developable_area: null,
      buildable_area: null,
      maxLandRate: null
    };
  }

  const net = Math.max(0, gross - deduction);
  if (zoneUnknown || fsi == null || !Number.isFinite(Number(fsi))) {
    return {
      ok: false,
      unknown: true,
      reason: 'zone_not_read',
      message: 'Zone not read',
      net_developable_area: net,
      buildable_area: null,
      maxLandRate: null,
      gross_area: gross,
      deduction_area: deduction
    };
  }

  const permissible = Number(fsi);
  const buildable = net * permissible;
  const gdv = buildable * Number(econ.realisableRatePerSqft);
  const construction = buildable * Number(econ.constructionRate);
  const softCosts = construction * Number(econ.softCostPct);
  const targetProfit = gdv * Number(econ.targetMarginPct);
  const residual = gdv - construction - softCosts - targetProfit;
  const maxLandRate = residual / gross;

  const conf = Number(input.confidence);
  const bandPct = input.range_band_pct != null ? Number(input.range_band_pct) : 8;
  const asRange = !(conf >= 80);

  const result = {
    ok: true,
    unknown: false,
    gross_area: gross,
    deduction_area: deduction,
    net_developable_area: net,
    permissible_fsi: permissible,
    buildable_area: buildable,
    gdv,
    construction,
    softCosts,
    targetProfit,
    residual,
    confidence: conf,
    label: 'Rate per Sq. Ft.'
  };

  if (asRange) {
    const pct = bandPct / 100;
    result.maxLandRate = {
      low: maxLandRate * (1 - pct),
      high: maxLandRate * (1 + pct)
    };
    result.is_range = true;
  } else {
    result.maxLandRate = maxLandRate;
    result.is_range = false;
  }
  return result;
}

function fmtRate(v) {
  if (v == null) return 'n/a';
  if (typeof v === 'object' && v.low != null) {
    return `Rs ${Math.round(v.low)}–${Math.round(v.high)}`;
  }
  return `Rs ${Math.round(Number(v))}`;
}

function interpolate(tpl, vars) {
  return String(tpl || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

function listHas(list, name) {
  const n = ddNormName(name);
  if (!n) return false;
  return (list || []).some((x) => {
    const xn = ddNormName(x);
    return xn && (xn === n || xn.indexOf(n) >= 0 || n.indexOf(xn) >= 0);
  });
}

function overlayHit(overlays, want) {
  return (overlays || []).some((o) => {
    const a = ddNormName(o);
    const b = ddNormName(want);
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  });
}

/**
 * Stage 7 recommendation — never auto-decides. DEAD only from closed list at conf ≥90.
 * PROVISIONAL alone never drives an outcome.
 */
export function ddRecommend(facts, rulesPack) {
  facts = facts || {};
  rulesPack = rulesPack || {};
  const outcomes = new Set();
  const flags = [];
  const bandPct = rulesPack.range_band_pct != null ? rulesPack.range_band_pct : 8;
  const delayWeeks = rulesPack.delay_weeks || {};

  const certainty = facts.certainty || 'UNKNOWN';
  const confidence = Number(facts.confidence) || 0;
  const overlays = Array.isArray(facts.overlays) ? facts.overlays : [];
  const competing = Array.isArray(facts.competing_authorities) ? facts.competing_authorities : [];
  const auth = facts.planning_authority || '';
  const rulebookKey = facts.rulebook_key || '';
  const exclusion = !!facts.rulebook_exclusion;
  const zoneCode = facts.zone_code || 'UNKNOWN';
  const zoneLabel = facts.zone_label || '';
  const tenure = facts.tenure_class || '';
  const factFlags = Array.isArray(facts.flags) ? facts.flags : [];
  const reservation = !!facts.reservation;
  const maxLand = facts.max_land_rate; // number | {low,high} | null
  const maxLandUnknown = !!facts.max_land_rate_unknown;
  const maxLandMessage = facts.max_land_rate_message || '';
  const askRate = facts.ask_rate_per_sqft != null ? Number(facts.ask_rate_per_sqft) : null;

  function pushFlag(rule, extraVars) {
    if (!rule || !rule.consequence_template) return; // no template → no flag
    const vars = Object.assign(
      {
        rulebook_key: rulebookKey || '—',
        overlay: (overlays && overlays[0]) || '—',
        competing_text: competing.join('; ') || '—',
        authorities_text: competing.join('; ') || auth || '—',
        max_land_rate_text: maxLandUnknown ? maxLandMessage || 'unavailable' : fmtRate(maxLand),
        gap_text: 'gap n/a',
        delay_weeks_low: '',
        delay_weeks_high: '',
        what: rule.what,
        why: rule.why,
        cost: rule.cost
      },
      extraVars || {}
    );
    if (askRate != null && maxLand != null && !maxLandUnknown) {
      const mid = typeof maxLand === 'object' ? (maxLand.low + maxLand.high) / 2 : Number(maxLand);
      if (mid > 0 && askRate > 0) {
        const gap = ((askRate - mid) / askRate) * 100;
        vars.gap_text = `${gap >= 0 ? gap.toFixed(0) : Math.abs(gap).toFixed(0)}% ${gap >= 0 ? 'above' : 'below'} ask`;
      }
    }
    const what = interpolate(rule.what, vars);
    const why = interpolate(rule.why, vars);
    const cost = interpolate(rule.cost, vars);
    const line = interpolate(rule.consequence_template, Object.assign({}, vars, { what, why, cost }));
    flags.push({
      id: rule.id,
      outcome: rule.outcome,
      severity: rule.outcome === 'DEAD' ? 1 : rule.outcome === 'REPRICED' ? 2 : rule.outcome === 'DELAYED' ? 3 : 4,
      consequence: line,
      what,
      why,
      cost
    });
  }

  function delayFor(key) {
    const d = delayWeeks[key];
    if (!d) return null;
    return { low: d.low, high: d.high };
  }

  // DEAD — closed list, conf ≥ 90, never from PROVISIONAL / raster zone alone
  const provisionalBlocksDead = certainty === 'PROVISIONAL' || certainty === 'PROVISIONAL_CONFLICT';
  const zoneIsRaster = confidence < 90 && facts.zone_source === 'analyst_read';

  (rulesPack.dead_rules || []).forEach((rule) => {
    if (provisionalBlocksDead || zoneIsRaster) return;
    if (confidence < (rule.min_confidence || 90) && !(facts.dead_evidence_confidence >= 90)) return;
    const m = rule.match || {};
    let hit = false;
    if (m.zone_codes && listHas(m.zone_codes, zoneCode)) hit = true;
    if (m.zone_labels && listHas(m.zone_labels, zoneLabel)) hit = true;
    if (m.flags && m.flags.some((f) => listHas(factFlags, f))) hit = true;
    if (m.tenure_classes && listHas(m.tenure_classes, tenure)) hit = true;
    if (m.overlays && m.overlays.some((o) => overlayHit(overlays, o))) hit = true;
    if (rule.require_no_conversion_route && hit && facts.conversion_route) hit = false;
    // Evidence confidence gate for DEAD
    const evidConf = Number(facts.dead_evidence_confidence != null ? facts.dead_evidence_confidence : confidence);
    if (hit && evidConf >= 90) {
      outcomes.add('DEAD');
      pushFlag(rule);
    }
  });

  // REPRICED — exclusion must be asserted OR a hill-station exclusion is named in competing carve-outs.
  // MIDC/NAINA/CIDCO conflict alone is DELAYED, not REPRICED.
  const hillExclusionFlagged = competing.some((c) => /HILL_STATION|Lonavala/i.test(String(c)));
  const exclusionDrivesReprice = (exclusion && certainty !== 'PROVISIONAL_CONFLICT') || (exclusion && hillExclusionFlagged) || hillExclusionFlagged;

  (rulesPack.repriced_rules || []).forEach((rule) => {
    const m = rule.match || {};
    let hit = false;
    if (m.rulebook_exclusion && exclusionDrivesReprice) hit = true;
    if (m.reservation && reservation) hit = true;
    if (m.tenure_classes && listHas(m.tenure_classes, tenure)) hit = true;
    // PROVISIONAL alone cannot drive
    if (certainty === 'PROVISIONAL') return;
    if (hit) {
      if (maxLandUnknown || maxLand == null) {
        // REPRICED without a number → OPEN with config error instead
        flags.push({
          id: rule.id + '_config',
          outcome: 'OPEN',
          severity: 5,
          consequence: maxLandMessage || 'Land rate unavailable — economics config not set',
          config_error: true
        });
      } else {
        outcomes.add('REPRICED');
        pushFlag(rule);
      }
    }
  });

  // DELAYED
  (rulesPack.delayed_rules || []).forEach((rule) => {
    const m = rule.match || {};
    let hit = false;
    let delayKey = rule.delay_key || null;
    let overlayUsed = null;
    let hitViaCompeting = false;
    let hitViaOverlay = false;
    if (m.overlays) {
      for (const o of m.overlays) {
        if (overlayHit(overlays, o)) {
          hit = true;
          hitViaOverlay = true;
          overlayUsed = o;
          if (rule.delay_key_from_overlay) delayKey = o;
          break;
        }
      }
    }
    if (m.rulebook_keys && listHas(m.rulebook_keys, rulebookKey)) {
      hit = true;
      if (!delayKey) delayKey = rule.delay_key || rulebookKey;
    }
    if (m.authorities && listHas(m.authorities, auth)) hit = true;
    if (m.competing_has) {
      const compHit = m.competing_has.some((a) => competing.some((c) => ddNormName(c).indexOf(ddNormName(a)) >= 0));
      if (compHit) {
        hit = true;
        hitViaCompeting = true;
        if (rule.delay_key_from_authority) {
          const found = m.competing_has.find((a) => competing.some((c) => ddNormName(c).indexOf(ddNormName(a)) >= 0));
          delayKey = found || delayKey;
        }
      }
    }
    // PROVISIONAL never drives an outcome on its own — overlays from a provisional
    // taluka default are not sufficient. CONFLICT competing authorities may DELAYED.
    if (certainty === 'PROVISIONAL') return;
    if (certainty === 'PROVISIONAL_CONFLICT' && hitViaOverlay && !hitViaCompeting && !(m.rulebook_keys && listHas(m.rulebook_keys, rulebookKey))) {
      // allow overlay DELAYED on conflict when hill/ESA is part of the conflict story (e.g. Maval)
      // keep hit
    }
    if (hit) {
      const dw = delayFor(delayKey) || delayFor('CRZ') || { low: null, high: null };
      if (dw.low == null) {
        // delay weeks must come from config — if missing, still flag but note
        pushFlag(rule, { delay_weeks_low: '?', delay_weeks_high: '?', overlay: overlayUsed || delayKey || '—' });
      } else {
        outcomes.add('DELAYED');
        pushFlag(rule, {
          delay_weeks_low: dw.low,
          delay_weeks_high: dw.high,
          overlay: overlayUsed || delayKey || '—'
        });
      }
    }
  });

  // Flag-only (PROVISIONAL_CONFLICT) — never a verdict driver
  (rulesPack.flag_only_rules || []).forEach((rule) => {
    const m = rule.match || {};
    if (m.certainty && m.certainty.indexOf(certainty) >= 0) {
      pushFlag(rule);
    }
  });

  // If REPRICED was wanted but config unset left only OPEN config flags, ensure OPEN
  const hasConfigError = flags.some((f) => f.config_error);
  if (!outcomes.size) outcomes.add('OPEN');
  if (hasConfigError && outcomes.has('REPRICED')) outcomes.delete('REPRICED');
  if (hasConfigError && !outcomes.size) outcomes.add('OPEN');

  // Hard rule: automatic layer never produces DEAD without ≥90 evidence — already gated
  // Nothing auto-decides
  flags.sort((a, b) => a.severity - b.severity);

  const list = Array.from(outcomes);
  // Prefer showing REPRICED+DELAYED together; OPEN alone if nothing else; DEAD if present
  const ordered = [];
  if (list.includes('DEAD')) ordered.push('DEAD');
  if (list.includes('REPRICED')) ordered.push('REPRICED');
  if (list.includes('DELAYED')) ordered.push('DELAYED');
  if (!ordered.length) ordered.push('OPEN');

  return {
    outcomes: ordered,
    flags,
    awaiting_human_decision: true,
    auto_decided: false,
    band_pct: bandPct,
    plain_language: flags
      .filter((f) => f.outcome !== 'FLAG' || certainty === 'PROVISIONAL_CONFLICT')
      .slice(0, 3)
      .map((f) => f.consequence)
      .join(' ')
  };
}

export const DD_ZONE_SEED = [
  'R1',
  'R2',
  'R3',
  'R4',
  'C1',
  'C2',
  'I1',
  'I2',
  'Amenity',
  'Green / Open Space',
  'NDZ',
  'Agriculture',
  'Agricultural No-Development Zone',
  'Public / Semi-public',
  'Transport',
  'CRZ',
  'other'
];

export function ddDefaultRulebookSeed() {
  return [
    {
      key: 'UDCPR_2020',
      version: '2020.1',
      applies_to_authorities: [],
      excluded_authorities: [
        'MCGM',
        'MIDC',
        'NAINA',
        'JNPT',
        'Hill Station Municipal Councils',
        'Lonavala MC',
        'Lonavala Municipal Council'
      ],
      zones: [
        { zone_code: 'R1', zone_label: 'Residential R1', base_fsi: 1.1 },
        { zone_code: 'R2', zone_label: 'Residential R2', base_fsi: 1.1 },
        { zone_code: 'NDZ', zone_label: 'No Development Zone', base_fsi: 0 }
      ]
    },
    {
      key: 'HILL_STATION_EXCLUDED',
      version: '1.0',
      applies_to_authorities: ['Lonavala MC', 'Lonavala Municipal Council', 'Hill Station Municipal Councils'],
      excluded_authorities: [],
      zones: [{ zone_code: 'R1', zone_label: 'Residential', base_fsi: 0.6 }]
    },
    {
      key: 'MIDC',
      version: '1.0',
      applies_to_authorities: ['MIDC'],
      excluded_authorities: [],
      zones: []
    },
    {
      key: 'NAINA',
      version: '1.0',
      applies_to_authorities: ['NAINA'],
      excluded_authorities: [],
      zones: []
    },
    {
      key: 'CIDCO',
      version: '1.0',
      applies_to_authorities: ['CIDCO'],
      excluded_authorities: [],
      zones: []
    },
    {
      key: 'GLDBCR_2010',
      version: '2010.1',
      applies_to_authorities: ['Goa TCP', 'NGPDA', 'Goa TCP (Regional Plan 2021)'],
      excluded_authorities: [],
      zones: []
    },
    {
      key: 'DCPR_2034',
      version: '2034.1',
      applies_to_authorities: ['MCGM'],
      excluded_authorities: [],
      zones: []
    },
    {
      key: 'CANTONMENT',
      version: '1.0',
      applies_to_authorities: ['Cantonment Board'],
      excluded_authorities: [],
      zones: []
    }
  ];
}
