/** Parse Indian salary strings to integer paise. Returns null if unparseable. */
export function parseCtcToPaise(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/₹|rs\.?|inr/gi, '').replace(/\s+/g, ' ').trim();

  const lpaMatch = s.match(/^([\d,]+(?:\.\d+)?)\s*(?:lpa|lacs?|lakhs?)$/i);
  if (lpaMatch) {
    const n = parseFloat(lpaMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100000 * 100);
  }

  const crMatch = s.match(/^([\d,]+(?:\.\d+)?)\s*(?:cr|crore)$/i);
  if (crMatch) {
    const n = parseFloat(crMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 10000000 * 100);
  }

  const digits = s.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!digits) return null;
  const n = parseFloat(digits);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1000) return Math.round(n * 100000 * 100);
  return Math.round(n * 100);
}

export function normalizePhone(raw) {
  if (raw == null || raw === '') return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length ? digits : null;
}

export function normalizeEmail(raw) {
  if (raw == null || raw === '') return null;
  const e = String(raw).trim().toLowerCase();
  return e.includes('@') ? e : null;
}

export function parseNoticePeriodDays(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'immediate' || s === '0') return 0;
  if (s.includes('serving')) return 30;
  const month = s.match(/(\d+)\s*month/);
  if (month) return Number(month[1]) * 30;
  const day = s.match(/(\d+)\s*day/);
  if (day) return Number(day[1]);
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function normHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function pick(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function mapRowHeaders(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normHeader(k)] = v;
  }
  return out;
}

const Naukri_HEADERS = {
  name: ['name', 'candidate name', 'full name'],
  phone: ['mobile', 'phone', 'mobile no', 'mobile number'],
  email: ['email', 'email id', 'e-mail'],
  company: ['current company', 'organization', 'current company / organization', 'company'],
  currentCtc: ['annual salary', 'current ctc', 'ctc'],
  expectedCtc: ['expected ctc', 'expected salary'],
  notice: ['notice period', 'notice'],
  city: ['current location', 'city', 'location'],
  experience: ['total experience', 'experience']
};

function resolveField(mapped, aliases) {
  for (const a of aliases) {
    if (mapped[a] != null && String(mapped[a]).trim() !== '') return String(mapped[a]).trim();
  }
  return '';
}

export function mapNaukriRow(row, rowIndex) {
  const m = mapRowHeaders(row);
  const name = resolveField(m, Naukri_HEADERS.name);
  if (!name) return { error: { row: rowIndex, reason: 'Missing name' } };

  const currentCtcRaw = resolveField(m, Naukri_HEADERS.currentCtc);
  const expectedCtcRaw = resolveField(m, Naukri_HEADERS.expectedCtc);
  let currentCtcPaise = null;
  let expectedCtcPaise = null;
  if (currentCtcRaw) {
    currentCtcPaise = parseCtcToPaise(currentCtcRaw);
    if (currentCtcPaise == null) return { error: { row: rowIndex, reason: `Unparseable Current CTC: ${currentCtcRaw}` } };
  }
  if (expectedCtcRaw) {
    expectedCtcPaise = parseCtcToPaise(expectedCtcRaw);
    if (expectedCtcPaise == null) return { error: { row: rowIndex, reason: `Unparseable Expected CTC: ${expectedCtcRaw}` } };
  }

  const exp = resolveField(m, Naukri_HEADERS.experience);
  const highlights = exp ? `Experience: ${exp}` : '';

  return {
    candidate: {
      name,
      phone: normalizePhone(resolveField(m, Naukri_HEADERS.phone)),
      email: normalizeEmail(resolveField(m, Naukri_HEADERS.email)),
      currentCompany: resolveField(m, Naukri_HEADERS.company),
      currentCtcPaise,
      expectedCtcPaise,
      noticePeriodDays: parseNoticePeriodDays(resolveField(m, Naukri_HEADERS.notice)),
      cityCurrent: resolveField(m, Naukri_HEADERS.city),
      highlights,
      source: 'naukri',
      currentStageNumber: 1
    }
  };
}

export function mapLinkedInRow(row, rowIndex) {
  const m = mapRowHeaders(row);
  const first = pick(m, 'first name', 'firstname', 'first_name');
  const last = pick(m, 'last name', 'lastname', 'last_name');
  const name = [first, last].filter(Boolean).join(' ').trim() || pick(m, 'name');
  if (!name) return { error: { row: rowIndex, reason: 'Missing name' } };

  const position = pick(m, 'position', 'title', 'current position');
  const highlights = position ? `Position: ${position}` : '';

  return {
    candidate: {
      name,
      linkedinUrl: pick(m, 'profile url', 'linkedin url', 'url', 'linkedin'),
      currentCompany: pick(m, 'company', 'current company', 'organization'),
      highlights,
      source: 'linkedin',
      currentStageNumber: 1
    }
  };
}

const COMMON_HEADERS = {
  name: ['name', 'candidate name', 'full name'],
  phone: ['mobile', 'phone', 'mobile no'],
  email: ['email', 'email id'],
  company: ['current company', 'company', 'organization'],
  currentCtc: ['current ctc', 'annual salary', 'ctc'],
  expectedCtc: ['expected ctc', 'expected salary'],
  notice: ['notice period', 'notice'],
  city: ['city', 'current location', 'location']
};

export function mapGenericRow(row, rowIndex, source = 'other') {
  const m = mapRowHeaders(row);
  const name = resolveField(m, COMMON_HEADERS.name);
  if (!name) return { error: { row: rowIndex, reason: 'Missing name' } };

  const currentCtcRaw = resolveField(m, COMMON_HEADERS.currentCtc);
  const expectedCtcRaw = resolveField(m, COMMON_HEADERS.expectedCtc);
  let currentCtcPaise = null;
  let expectedCtcPaise = null;
  if (currentCtcRaw) {
    currentCtcPaise = parseCtcToPaise(currentCtcRaw);
    if (currentCtcPaise == null) return { error: { row: rowIndex, reason: `Unparseable Current CTC: ${currentCtcRaw}` } };
  }
  if (expectedCtcRaw) {
    expectedCtcPaise = parseCtcToPaise(expectedCtcRaw);
    if (expectedCtcPaise == null) return { error: { row: rowIndex, reason: `Unparseable Expected CTC: ${expectedCtcRaw}` } };
  }

  const used = new Set([
    ...COMMON_HEADERS.name, ...COMMON_HEADERS.phone, ...COMMON_HEADERS.email,
    ...COMMON_HEADERS.company, ...COMMON_HEADERS.currentCtc, ...COMMON_HEADERS.expectedCtc,
    ...COMMON_HEADERS.notice, ...COMMON_HEADERS.city
  ]);
  const extra = Object.entries(m)
    .filter(([k, v]) => v != null && String(v).trim() && !used.has(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return {
    candidate: {
      name,
      phone: normalizePhone(resolveField(m, COMMON_HEADERS.phone)),
      email: normalizeEmail(resolveField(m, COMMON_HEADERS.email)),
      currentCompany: resolveField(m, COMMON_HEADERS.company),
      currentCtcPaise,
      expectedCtcPaise,
      noticePeriodDays: parseNoticePeriodDays(resolveField(m, COMMON_HEADERS.notice)),
      cityCurrent: resolveField(m, COMMON_HEADERS.city),
      highlights: extra || undefined,
      source: source === 'apna' ? 'other' : source,
      currentStageNumber: 1
    }
  };
}

export function mapAgencyRow(row, rowIndex) {
  const m = mapRowHeaders(row);
  const name = resolveField(m, COMMON_HEADERS.name);
  if (!name) return { error: { row: rowIndex, reason: 'Missing name' } };
  const agencyName = pick(m, 'agency', 'agency name', 'vendor', 'consultant', 'firm');
  if (!agencyName) return { error: { row: rowIndex, reason: 'Missing agency name' } };

  const currentCtcRaw = resolveField(m, COMMON_HEADERS.currentCtc);
  const expectedCtcRaw = resolveField(m, COMMON_HEADERS.expectedCtc);
  let currentCtcPaise = null;
  let expectedCtcPaise = null;
  if (currentCtcRaw) {
    currentCtcPaise = parseCtcToPaise(currentCtcRaw);
    if (currentCtcPaise == null) return { error: { row: rowIndex, reason: `Unparseable Current CTC: ${currentCtcRaw}` } };
  }
  if (expectedCtcRaw) {
    expectedCtcPaise = parseCtcToPaise(expectedCtcRaw);
    if (expectedCtcPaise == null) return { error: { row: rowIndex, reason: `Unparseable Expected CTC: ${expectedCtcRaw}` } };
  }

  return {
    candidate: {
      name,
      phone: normalizePhone(resolveField(m, COMMON_HEADERS.phone)),
      email: normalizeEmail(resolveField(m, COMMON_HEADERS.email)),
      currentCompany: resolveField(m, COMMON_HEADERS.company),
      currentCtcPaise,
      expectedCtcPaise,
      noticePeriodDays: parseNoticePeriodDays(resolveField(m, COMMON_HEADERS.notice)),
      cityCurrent: resolveField(m, COMMON_HEADERS.city),
      linkedinUrl: pick(m, 'linkedin', 'linkedin url', 'profile url'),
      agencyName,
      agencyContact: pick(m, 'agency contact', 'recruiter', 'consultant name', 'contact'),
      agencyEmail: normalizeEmail(pick(m, 'agency email', 'vendor email')) || '',
      agencyNotes: pick(m, 'notes', 'agency notes', 'remarks'),
      highlights: pick(m, 'highlights', 'summary', 'skills') || undefined,
      source: 'agency',
      currentStageNumber: 1
    }
  };
}

export function mapRowByChannel(row, rowIndex, channel) {
  const ch = String(channel || 'other').toLowerCase();
  if (ch === 'naukri') return mapNaukriRow(row, rowIndex);
  if (ch === 'linkedin') return mapLinkedInRow(row, rowIndex);
  if (ch === 'agency') return mapAgencyRow(row, rowIndex);
  if (ch === 'apna') {
    const r = mapGenericRow(row, rowIndex, 'other');
    if (r.candidate) r.candidate.source = 'other';
    return r;
  }
  return mapGenericRow(row, rowIndex, 'other');
}

export function dedupeKey(candidate) {
  const phone = normalizePhone(candidate.phone);
  if (phone) return `phone:${phone}`;
  const email = normalizeEmail(candidate.email);
  if (email) return `email:${email}`;
  const name = String(candidate.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const co = String(candidate.currentCompany || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (name && co) return `nc:${name}|${co}`;
  if (name) return `name:${name}`;
  return null;
}

export function parseSpreadsheetBuffer(buffer, filename) {
  return import('xlsx').then((XLSX) => {
    const name = String(filename || '').toLowerCase();
    const wb = name.endsWith('.csv')
      ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
      : XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  });
}
