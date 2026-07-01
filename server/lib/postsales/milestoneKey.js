import { formatMilestoneLabel } from './milestoneLabels.js';

export function slugMilestone(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function milestoneKey(name) {
  return slugMilestone(formatMilestoneLabel(name));
}
