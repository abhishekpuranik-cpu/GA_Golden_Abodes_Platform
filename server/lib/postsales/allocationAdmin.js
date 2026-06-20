import crypto from 'crypto';
import { POSTSALES_ALLOCATION_PASSWORD } from '../config.js';

const TOKEN_HOURS = 8;

export function allocationPassword() {
  return String(POSTSALES_ALLOCATION_PASSWORD || 'ga@admin').trim();
}

export function verifyAllocationPassword(password) {
  const expected = allocationPassword();
  if (!expected) return false;
  const a = String(password || '').trim();
  if (a.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(expected));
  } catch {
    return a === expected;
  }
}

export function issueAllocationToken() {
  const secret = process.env.SESSION_SECRET || 'ga-postsales-dev';
  const exp = Date.now() + TOKEN_HOURS * 3600 * 1000;
  const sig = crypto.createHmac('sha256', secret).update(`ps-allocation:${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export function verifyAllocationToken(token) {
  if (!token) return false;
  const secret = process.env.SESSION_SECRET || 'ga-postsales-dev';
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Date.now() > Number(exp)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`ps-allocation:${exp}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return sig === expected;
  }
}

export function requireAllocationAdmin(req, res, next) {
  const token = req.headers['x-ps-allocation-token'] || req.body?.allocationToken;
  if (!verifyAllocationToken(token)) {
    return res.status(403).json({ error: 'Allocation admin access required' });
  }
  next();
}
