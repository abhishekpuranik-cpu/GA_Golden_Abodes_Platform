import { STEPS } from './steps.js';
import { addCalendarDays, computeDueDate } from './helpers.js';

/** Map each pipeline step to CRM collection milestone due-date patterns (Due Date row). */
const STEP_DATE_RULES = [
  { step: 1, patterns: [/token/i] },
  { step: 2, patterns: [/token/i, /within.?7/i] },
  { step: 3, patterns: [/within.?7/i, /token/i] },
  { step: 4, patterns: [/registration/i, /within.?7/i, /token/i] },
  { step: 5, patterns: [/registration/i] },
  { step: 6, patterns: [/registration/i] },
  { step: 7, patterns: [/registration/i] },
  { step: 8, patterns: [/registration/i] },
  { step: 9, patterns: [/registration/i], offsetDays: 3 },
  { step: 10, patterns: [/registration/i], offsetDays: 3 },
  { step: 11, patterns: [/plinth/i, /basement/i, /ground/i] },
  { step: 12, patterns: [/plinth/i, /basement/i, /ground/i, /1th/i] },
  { step: 14, patterns: [/possession/i] },
  { step: 15, patterns: [/possession/i], offsetDays: 30 },
  { step: 20, patterns: [/possession/i] },
];

function milestoneDate(milestones, pattern) {
  for (const m of milestones) {
    if (pattern.test(m.milestoneName) && m.dueDate) return new Date(m.dueDate);
  }
  return undefined;
}

function firstMatchingDate(milestones, patterns) {
  for (const p of patterns) {
    const d = milestoneDate(milestones, p);
    if (d) return d;
  }
  return undefined;
}

/** Derive due dates for pipeline steps 1–20 from CRM collection milestones + booking/registration. */
export function deriveStepDueDates(milestones, { bookingDate, registrationDate } = {}) {
  const out = {};
  const booking = bookingDate ? new Date(bookingDate) : undefined;
  const regFromMilestone = milestoneDate(milestones, /registration/i);
  const reg = registrationDate ? new Date(registrationDate) : regFromMilestone;

  for (const rule of STEP_DATE_RULES) {
    let date = firstMatchingDate(milestones, rule.patterns || []);
    if (!date && rule.step <= 3 && booking) {
      date = addCalendarDays(booking, rule.step);
    }
    if (!date && rule.step >= 5 && rule.step <= 10 && reg) {
      date = new Date(reg);
    }
    if (date && rule.offsetDays) {
      date = addCalendarDays(date, rule.offsetDays);
    }
    if (date && !Number.isNaN(date.getTime())) out[rule.step] = date;
  }

  // Chain SLA for steps without a direct CRM milestone (13, 16–19, etc.)
  for (const def of STEPS) {
    if (out[def.number] || !def.slaDays) continue;
    const prevDate = out[def.number - 1];
    if (prevDate) {
      out[def.number] = computeDueDate(def, prevDate);
    } else if (booking && def.number <= 3) {
      out[def.number] = computeDueDate(def, booking);
    }
  }

  return out;
}
