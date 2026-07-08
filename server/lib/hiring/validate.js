import { ENTITY_TAGS } from './constants.js';

export function requireEntityTag(body, res) {
  const tag = String(body?.entityTag || '').trim();
  if (!ENTITY_TAGS.includes(tag)) {
    res.status(422).json({ error: 'Valid entityTag is required', allowed: ENTITY_TAGS });
    return null;
  }
  return tag;
}

export function assertPaise(value, fieldName) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${fieldName} must be a non-negative integer (paise)`);
  }
  return n;
}

export function assertNoticePeriodDays(value, fieldName = 'noticePeriodDays') {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${fieldName} must be a non-negative integer (days)`);
  }
  return n;
}

export function requireEntityTagParam(tag, res) {
  const entityTag = String(tag || '').trim();
  if (!ENTITY_TAGS.includes(entityTag)) {
    res.status(422).json({ error: 'Valid entityTag is required', allowed: ENTITY_TAGS });
    return null;
  }
  return entityTag;
}

export function notDeletedFilter(extra = {}) {
  return { isDeleted: false, ...extra };
}
