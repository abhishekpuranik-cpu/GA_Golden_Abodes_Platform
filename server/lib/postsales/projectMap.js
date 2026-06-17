/** Map Cashflow V1 project ids / names → Post Sales project + entity. */
export const POST_SALES_PROJECTS = [
  { name: 'Golden HQ', entity: 'GAPL', location: 'PCMC, Pune' },
  { name: 'NKG Wakad', entity: 'PAD', location: 'Wakad, Pune' },
  { name: 'Wakad GA', entity: 'NBD', location: 'Wakad, Pune' },
  { name: 'Anantam Signature', entity: 'GV', location: 'Goa' },
  { name: 'Anantam Waves', entity: 'NP', location: 'Dona Paula, Goa' },
  { name: 'Paradise', entity: 'PAD', location: 'Goa' },
];

const V1_ID_MAP = {
  P001: 'Anantam Signature',
  P002: 'Anantam Waves',
  P003: 'Wakad GA',
  P009: 'Paradise',
};

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function resolvePostSalesProject(v1ProjectId, cfg = {}, manualProj = null) {
  const byId = V1_ID_MAP[String(v1ProjectId || '').trim()];
  if (byId) {
    const row = POST_SALES_PROJECTS.find((p) => p.name === byId);
    if (row) return { ...row, v1ProjectId: String(v1ProjectId) };
  }

  const names = [
    manualProj?.name,
    cfg?.projName,
    cfg?.projectName,
  ].filter(Boolean);

  for (const raw of names) {
    const n = slug(raw);
    if (!n) continue;
    if (n.includes('paradise')) return matchName('Paradise', v1ProjectId);
    if (n.includes('signature') || n.includes('anantamsignature')) return matchName('Anantam Signature', v1ProjectId);
    if (n.includes('wave')) return matchName('Anantam Waves', v1ProjectId);
    if (n.includes('goldenhq') || n.includes('goldenh') || n.includes('gapl')) return matchName('Golden HQ', v1ProjectId);
    if (n.includes('nkg') || n.includes('nkgwakad')) return matchName('NKG Wakad', v1ProjectId);
    if (n.includes('wakadga') || n.includes('wakad')) return matchName('Wakad GA', v1ProjectId);
    if (n.includes('avisa')) return matchName('Wakad GA', v1ProjectId);

    for (const p of POST_SALES_PROJECTS) {
      const ps = slug(p.name);
      if (ps === n || n.includes(ps) || ps.includes(n)) return { ...p, v1ProjectId: String(v1ProjectId || '') };
    }
  }

  return null;
}

function matchName(name, v1ProjectId) {
  const row = POST_SALES_PROJECTS.find((p) => p.name === name);
  return row ? { ...row, v1ProjectId: String(v1ProjectId || '') } : null;
}

export function normUnitKey(unitNo) {
  return String(unitNo || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function parseUnitNumber(unitNo, building) {
  const raw = String(unitNo || '').trim();
  const b = String(building || '').trim();
  if (!raw) return b || '—';
  if (b && !raw.toLowerCase().includes(b.toLowerCase())) return `${b}-${raw}`.replace(/\s+/g, '-');
  return raw;
}
