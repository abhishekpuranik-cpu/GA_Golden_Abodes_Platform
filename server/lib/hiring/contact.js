import { normalizeEmail, normalizePhone } from './importParsers.js';

/** Coerce Metaview/CSV/object contact values to a plain string. */
export function coerceContactString(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object') {
    const nested = value.email ?? value.phone ?? value.value ?? value.address
      ?? value.number ?? value.text ?? value.raw ?? value.label;
    if (nested != null && nested !== value) return coerceContactString(nested);
  }
  return '';
}

function firstFromSources(sources, normalize) {
  for (const src of sources) {
    if (src == null || src === '') continue;
    if (Array.isArray(src)) {
      for (const item of src) {
        const n = normalize(coerceContactString(item));
        if (n) return n;
      }
      continue;
    }
    const n = normalize(coerceContactString(src));
    if (n) return n;
  }
  return '';
}

export function pickFirstEmail(...sources) {
  return firstFromSources(sources, normalizeEmail) || '';
}

export function pickFirstPhone(...sources) {
  return firstFromSources(sources, normalizePhone) || '';
}

/** Resolve display/storage contact from candidate doc + profile snapshot. */
export function resolveCandidateContact(candidate = {}) {
  const snap = candidate.profileSnapshot || {};
  return {
    email: pickFirstEmail(
      candidate.email,
      snap.emails,
      snap.email,
      candidate.emails
    ),
    phone: pickFirstPhone(
      candidate.phone,
      snap.phones,
      snap.phone,
      candidate.phones
    )
  };
}

/** Fill empty top-level email/phone from any available source (mutates). */
export function applyResolvedContact(target, sources = {}) {
  const resolved = resolveCandidateContact({
    ...sources,
    email: target.email || sources.email,
    phone: target.phone || sources.phone,
    profileSnapshot: sources.profileSnapshot || target.profileSnapshot,
    emails: sources.emails,
    phones: sources.phones
  });
  if (resolved.email && !target.email) target.email = resolved.email;
  if (resolved.phone && !target.phone) target.phone = resolved.phone;
  return target;
}
