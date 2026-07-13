/**
 * Context quality scoring + merge for Ask AI.
 */

export function scoreAskContext(context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const totals = ctx.totals || ctx.summary || {};
  const items = []
    .concat(ctx.hotItems || [])
    .concat(ctx.hotTasks || [])
    .concat(ctx.items || [])
    .concat(ctx.projects || []);

  let score = 0;
  const reasons = [];

  const numericKeys = Object.entries(totals).filter(([, v]) => typeof v === 'number');
  if (numericKeys.length >= 3) {
    score += 35;
    reasons.push(`${numericKeys.length} numeric totals`);
  } else if (numericKeys.length >= 1) {
    score += 15;
    reasons.push(`${numericKeys.length} numeric total(s)`);
  }

  const realItems = items.filter((it) => {
    if (!it || typeof it !== 'object') return false;
    const title = String(it.title || it.name || it.task || '');
    const detail = String(it.detail || '');
    if (/^ga_/.test(title) || /localStorage|snapshot/i.test(detail)) return false;
    return title.length > 0;
  });
  if (realItems.length >= 5) {
    score += 45;
    reasons.push(`${realItems.length} evidence items`);
  } else if (realItems.length >= 1) {
    score += 20;
    reasons.push(`${realItems.length} evidence item(s)`);
  }

  if (ctx.source === 'mongo_hydrate' || ctx.hydrated) {
    score += 10;
    reasons.push('mongo hydrate');
  }
  if (ctx.app || ctx.generatedAt) score += 5;

  // Penalize classic thin payloads
  if (totals.keysLoaded != null && realItems.length === 0) {
    score = Math.min(score, 15);
    reasons.push('storage-key-only context');
  }

  const level = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  return {
    score,
    level,
    realItemCount: realItems.length,
    numericTotalCount: numericKeys.length,
    reasons,
    /** Phase 2: refuse narrating when below this. */
    refuse: score < 30,
  };
}

/** Minimum quality to allow an answered narrative (Phase 2). */
export const ASK_CONTEXT_REFUSE_THRESHOLD = 30;

export function shouldRefuseAskContext(quality) {
  if (!quality) return true;
  return quality.score < ASK_CONTEXT_REFUSE_THRESHOLD || quality.refuse === true;
}

export function mergeAskContexts(primary, secondary) {
  const a = primary && typeof primary === 'object' ? primary : {};
  const b = secondary && typeof secondary === 'object' ? secondary : {};
  const totals = { ...(b.totals || {}), ...(a.totals || {}) };
  // Prefer larger numeric values when both present (richer snapshot)
  for (const [k, v] of Object.entries(b.totals || {})) {
    if (typeof v === 'number' && typeof totals[k] === 'number') {
      totals[k] = Math.max(totals[k], v);
    } else if (totals[k] == null) {
      totals[k] = v;
    }
  }

  const itemKey = (it) =>
    String(it?.id || it?.projectId || it?.taskId || it?.title || it?.name || JSON.stringify(it)).toLowerCase();
  const map = new Map();
  for (const it of [].concat(b.hotItems || [], b.projects || [], a.hotItems || [], a.projects || [])) {
    if (!it || typeof it !== 'object') continue;
    const k = itemKey(it);
    if (!map.has(k) || (Number(it.risk) || 0) > (Number(map.get(k).risk) || 0)) map.set(k, it);
  }
  const hotItems = [...map.values()].sort((x, y) => (Number(y.risk) || 0) - (Number(x.risk) || 0)).slice(0, 40);

  return {
    ...b,
    ...a,
    totals,
    hotItems,
    projects: hotItems.filter((it) => it.projectId || /project/i.test(String(it.status || ''))).slice(0, 30),
    merged: true,
    sources: [a.source, b.source].filter(Boolean),
  };
}
