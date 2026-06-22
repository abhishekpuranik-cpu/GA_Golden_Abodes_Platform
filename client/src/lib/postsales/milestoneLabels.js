const CONSTRUCTION_WORDS = [
  'electromechanical', 'waterproofing', 'installment', 'registration', 'possession',
  'electrical', 'mechanical', 'entrance', 'internal', 'external', 'plumbing',
  'staircase', 'foundation', 'completion', 'gypsum', 'plaster', 'terrace',
  'lobbies', 'lobby', 'fittings', 'fitting', 'water', 'pumps', 'pump', 'lift',
  'wells', 'floor', 'walls', 'brick', 'maintenance', 'charges', 'infra',
  'agreement', 'booking', 'disbursement', 'sanction', 'structure', 'slab',
  'plinth', 'brickwork', 'oc', 'cc', 'gst', 'stamp', 'duty', 'token',
].sort((a, b) => b.length - a.length);

function titleCase(s) {
  return String(s || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.replace(/^(\d+)(st|nd|rd|th)$/i, (_, n, suf) => `${n}${suf}`))
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function tokenizeConcatenated(raw) {
  const lower = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!lower) return '';
  const parts = [];
  let i = 0;
  while (i < lower.length) {
    let matched = '';
    for (const w of CONSTRUCTION_WORDS) {
      if (lower.startsWith(w, i) && w.length > matched.length) matched = w;
    }
    if (matched) {
      parts.push(matched);
      i += matched.length;
      continue;
    }
    let j = i + 1;
    while (j < lower.length) {
      let found = false;
      for (const w of CONSTRUCTION_WORDS) {
        if (lower.startsWith(w, j)) {
          found = true;
          break;
        }
      }
      if (found) break;
      j += 1;
    }
    parts.push(lower.slice(i, j));
    i = j;
  }
  return parts.join(' ');
}

export function formatMilestoneLabel(key) {
  let s = String(key || '').trim();
  if (!s) return 'Milestone';

  if (/^installment\d+$/i.test(s.replace(/\s/g, ''))) {
    return s.replace(/installment/i, 'Installment ').trim();
  }

  s = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1$2 ')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!/\s/.test(s) && s.length > 8) {
    let spaced = s.toLowerCase();
    for (const w of CONSTRUCTION_WORDS) {
      spaced = spaced.replace(new RegExp(w, 'g'), ` ${w} `);
    }
    s = spaced.replace(/\s+/g, ' ').trim();
  }

  if (!/\s/.test(s) && s.length > 12) {
    s = tokenizeConcatenated(s);
  }

  return titleCase(s);
}
