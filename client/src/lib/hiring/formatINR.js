/** Format integer paise as INR display string. */
export function formatINR(paise) {
  if (paise == null || paise === '') return '—';
  const rupees = Number(paise) / 100;
  if (!Number.isFinite(rupees)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(rupees);
}

/** Parse rupee display input to paise integer. */
export function rupeesToPaise(input) {
  if (input == null || input === '') return null;
  const cleaned = String(input).replace(/[^\d.]/g, '');
  const rupees = parseFloat(cleaned);
  if (!Number.isFinite(rupees)) return null;
  return Math.round(rupees * 100);
}

/** Format LPA band from paise (e.g. ₹5–7 LPA). */
export function formatLpaBand(minPaise, maxPaise) {
  const fmtL = (p) => `${(Number(p) / 100 / 100000).toFixed(1)} L`;
  if (minPaise != null && maxPaise != null) return `₹${fmtL(minPaise).replace(' L', '')}–${fmtL(maxPaise)}PA`;
  if (minPaise != null) return `₹${fmtL(minPaise)}PA+`;
  if (maxPaise != null) return `up to ₹${fmtL(maxPaise)}PA`;
  return '—';
}

export const STAGE_LABELS = {
  1: 'Sourced',
  2: 'Screened',
  3: 'Shortlisted',
  4: 'Interview R1',
  5: 'Interview R2',
  6: 'Offer',
  7: 'Hired',
  8: 'Rejected',
  9: 'Dropped'
};

export const ENTITY_TAGS = ['PAD', 'NBD', 'NP', 'GV', 'GAPL', 'Suryakiran'];
