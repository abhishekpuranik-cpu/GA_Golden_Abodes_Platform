/**
 * Parse entity references from Ask questions (unit / project / person).
 */

export function escapeRe(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * @returns {{ project: string|null, unitNumber: string|null, wantsCollections: boolean }}
 */
export function parsePostSalesEntityQuery(question) {
  const raw = String(question || '').trim();
  const q = raw.toLowerCase();
  const wantsCollections = /\b(collect|collection|collections|outstanding|demand|due|received|paid|gst)\b/i.test(raw);

  let unitNumber = null;
  // Require word boundary after "unit" so "units" (plural) does not capture "s" as the number
  const unitLabeled = raw.match(/\bunit\b\s*[#:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]*)/i);
  if (unitLabeled?.[1]) {
    const cand = unitLabeled[1].trim();
    // reject leftover words like "have", "with", "for"
    if (!/^(have|has|with|for|in|on|are|is|the|a|an|and|or|of|to)$/i.test(cand)) {
      unitNumber = cand;
    }
  }
  if (!unitNumber) {
    // e.g. "Paradise 701" or trailing floor-style numbers
    const bare = raw.match(/\b([A-Za-z]?\d{2,4}[A-Za-z]?)\b/);
    if (bare?.[1] && !/^\d{4}$/.test(bare[1])) unitNumber = bare[1];
    // allow pure 701
    if (!unitNumber) {
      const n = raw.match(/\b(\d{2,4})\b/);
      if (n) unitNumber = n[1];
    }
  }

  let project = null;
  const beforeUnit = raw.match(/^(.{2,60}?)\s+\bunit\b/i);
  if (beforeUnit?.[1]) {
    project = beforeUnit[1]
      .replace(/\b(collections?|outstanding|status|for|of|the|about|show|tell|me|what|is|are|how|much|which|units?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!project || project.length < 2) {
    const known = raw.match(/\b(paradise|heights|orchid|emerald|skyline|harmony|golden|abodes)\b/i);
    if (known) project = known[1];
  }
  if (project) {
    project = project.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();
    if (project.length < 2) project = null;
  }

  return { project, unitNumber, wantsCollections, raw };
}

export function unitNumberMatches(stored, asked) {
  const a = normKey(asked);
  const b = normKey(stored);
  if (!a || !b) return false;
  return b === a || b.endsWith(a) || a.endsWith(b) || b.includes(a);
}
