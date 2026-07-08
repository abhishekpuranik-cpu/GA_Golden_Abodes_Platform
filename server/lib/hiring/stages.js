import { STAGE_LABELS } from './constants.js';

const TERMINAL_STAGES = new Set([8, 9]);
const HIRED_STAGE = 7;
const OFFER_STAGE = 6;

export function stageLabel(n) {
  return STAGE_LABELS[n] || `Stage ${n}`;
}

/** Legal transitions per spec §4 rule 4. */
export function isValidStageTransition(fromStage, toStage) {
  const from = Number(fromStage);
  const to = Number(toStage);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  if (from === to) return false;
  if (TERMINAL_STAGES.has(to)) return true;
  if (to === HIRED_STAGE) return from === OFFER_STAGE;
  if (TERMINAL_STAGES.has(from)) return false;
  if (to < from) return false;
  if (to > from + 1) return false;
  return true;
}

export function allStageNumbers() {
  return Object.keys(STAGE_LABELS).map(Number);
}
