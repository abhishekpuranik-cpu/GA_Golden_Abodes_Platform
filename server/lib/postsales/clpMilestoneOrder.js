/** CLP milestone chronology — upload column order first, then dates, then standard CLP sequence. */
import { isGstDemand, isPostStageDemand } from './demandAmounts.js';

const ORDER_RULES = [
  { index: 0, test: /token|booking/i },
  { index: 1, test: /registration|agreement|stamp/i },
  { index: 2, test: /raft|plinth|foundation/i },
  { index: 3, test: /basement|lg slab/i },
  { index: 5, test: /5th slab|slab 5|slab5/i },
  { index: 6, test: /10th slab|slab 10|slab10|entrancelobbies10|lobbies10/i },
  { index: 7, test: /15th slab|slab 15|slab15|terrace.*15|15th floor/i },
  { index: 8, test: /20th slab|slab 20|slab20/i },
  { index: 9, test: /25th slab|slab 25|slab25/i },
  { index: 10, test: /30th slab|slab 30|slab30/i },
  { index: 11, test: /35th slab|slab 35|slab35|terrace(?!.*15)/i },
  { index: 12, test: /masonry|blockwork|brick/i },
  { index: 13, test: /internal.*plumb|plumb.*internal|staircase|lift well|floor lobby/i },
  { index: 14, test: /wall|gypsum|plaster(?!.*external)/i },
  { index: 15, test: /external.*plumb|external.*plaster|waterproof/i },
  { index: 16, test: /lift|water pump|electrical|electromechanical|entrance lobby/i },
  { index: 17, test: /facade|façade/i },
  { index: 18, test: /lobby|lift ops/i },
  { index: 99, test: /possession|handover/i },
];

function slug(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function clpMilestoneSortIndex(name) {
  const s = slug(name);
  if (!s) return 500;
  for (const rule of ORDER_RULES) {
    if (rule.test.test(s)) return rule.index;
  }
  const slab = s.match(/(?:^|\s)(\d{1,2})(?:st|nd|rd|th)?(?:\s|$).*?(?:slab|floor)/i)
    || s.match(/slab\s*(\d{1,2})/i);
  if (slab) return 4 + Math.min(20, parseInt(slab[1], 10));
  return 40;
}

function categoryRank(d) {
  if (isGstDemand(d)) return 3;
  if (isPostStageDemand(d)) return 2;
  return 1;
}

function dateMs(d) {
  const raw = d?.targetDate || d?.dueDate;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function uploadOrder(d) {
  const mo = Number(d?.milestoneOrder);
  if (!Number.isFinite(mo) || mo < 0) return null;
  if (isGstDemand(d) || isPostStageDemand(d)) return mo >= 900 ? mo : 900 + mo;
  return mo < 900 ? mo : null;
}

export function compareMilestoneChronology(a, b) {
  const ca = categoryRank(a);
  const cb = categoryRank(b);
  if (ca !== cb) return ca - cb;

  const uA = uploadOrder(a);
  const uB = uploadOrder(b);
  if (uA != null && uB != null && uA !== uB) return uA - uB;

  const tA = dateMs(a);
  const tB = dateMs(b);
  if (tA != null && tB != null && tA !== tB) return tA - tB;
  if (tA != null && tB == null) return -1;
  if (tA == null && tB != null) return 1;

  const iA = clpMilestoneSortIndex(a.milestoneNameRaw || a.milestoneName);
  const iB = clpMilestoneSortIndex(b.milestoneNameRaw || b.milestoneName);
  if (iA !== iB) return iA - iB;

  if (uA != null && uB != null && uA !== uB) return uA - uB;

  return String(a.milestoneNameRaw || a.milestoneName || '')
    .localeCompare(String(b.milestoneNameRaw || b.milestoneName || ''));
}

export function sortDemandsByClpChronology(demands = []) {
  return [...demands].sort(compareMilestoneChronology);
}

export function toIsoDateInput(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
