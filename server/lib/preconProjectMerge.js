/** Deep merge PreConstruction projects — union phases and tasks by id (server 409 merge). */
import { mergeTaskCommentArrays } from './preconCommentRepair.js';

function normalizeRemovedTaskIds(...sources) {
  const out = new Set();
  for (const src of sources) {
    if (!src) continue;
    const list = Array.isArray(src) ? src : Array.isArray(src._removedTaskIds) ? src._removedTaskIds : [];
    for (const id of list) {
      const s = String(id || '').trim();
      if (s) out.add(s);
    }
  }
  return [...out];
}

export function applyTaskTombstonesToProject(proj) {
  if (!proj || typeof proj !== 'object') return proj;
  const drop = new Set(normalizeRemovedTaskIds(proj._removedTaskIds));
  if (!drop.size) return proj;
  for (const ph of proj.phases || []) {
    ph.tasks = (ph.tasks || []).filter((t) => !drop.has(String(t.id)));
  }
  return proj;
}

function whoStampMs(task) {
  const t = Date.parse(task?.whoUpdatedAt || '');
  return Number.isFinite(t) ? t : 0;
}

function fieldStampMs(task, key) {
  const t = Date.parse(task?.[key] || '');
  return Number.isFinite(t) ? t : 0;
}

function nonEmpty(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

/**
 * Prefer newer whoUpdatedAt, but never let a blank assignee clobber a non-empty one
 * unless the blank carries a strictly newer stamp (explicit clear).
 */
function pickMergedWho(existing, incoming) {
  const exWho = String(existing?.who || '').trim();
  const inWho = String(incoming?.who || '').trim();
  const exT = whoStampMs(existing);
  const inT = whoStampMs(incoming);

  if (inWho && !exWho) {
    return { who: incoming.who, whoUpdatedAt: incoming.whoUpdatedAt || existing?.whoUpdatedAt };
  }
  if (exWho && !inWho) {
    if (inT > exT && inT > 0) {
      return { who: '', whoUpdatedAt: incoming.whoUpdatedAt };
    }
    return { who: existing.who, whoUpdatedAt: existing.whoUpdatedAt || incoming?.whoUpdatedAt };
  }
  if (exT || inT) {
    if (inT > exT) {
      return {
        who: incoming.who != null ? incoming.who : existing?.who || '',
        whoUpdatedAt: incoming.whoUpdatedAt || existing?.whoUpdatedAt,
      };
    }
    if (exT > inT) {
      return {
        who: existing.who != null ? existing.who : incoming?.who || '',
        whoUpdatedAt: existing.whoUpdatedAt || incoming?.whoUpdatedAt,
      };
    }
  }
  if (inWho) return { who: incoming.who, whoUpdatedAt: incoming.whoUpdatedAt || existing?.whoUpdatedAt };
  if (exWho) return { who: existing.who, whoUpdatedAt: existing.whoUpdatedAt || incoming?.whoUpdatedAt };
  return {
    who: Object.prototype.hasOwnProperty.call(incoming || {}, 'who') ? incoming.who : existing?.who || '',
    whoUpdatedAt: incoming?.whoUpdatedAt || existing?.whoUpdatedAt,
  };
}

/** Keep non-empty schedule fields; blank/null must not clobber start dates. */
function pickMergedSchedule(existing, incoming) {
  const pick = (key, stampKey, preferManual = false) => {
    const exV = existing?.[key];
    const inV = incoming?.[key];
    const exOk = nonEmpty(exV);
    const inOk = nonEmpty(inV);
    if (preferManual) {
      const exMan = !!existing?.msManual;
      const inMan = !!incoming?.msManual;
      if (inMan && inOk && !exMan) return inV;
      if (exMan && exOk && !inMan) return exV;
    }
    const exT = fieldStampMs(existing, stampKey);
    const inT = fieldStampMs(incoming, stampKey);
    if (inT || exT) {
      if (inT > exT && inOk) return inV;
      if (exT > inT && exOk) return exV;
      if (inT > exT && !inOk && exOk) return exV;
    }
    // When stamps don't decide, never let an earlier ISO date replace a later one
    // (stale clients often re-send kickoff-offset starts and wipe manual dates).
    if (preferManual && exOk && inOk && String(exV) !== String(inV)) {
      return String(exV) >= String(inV) ? exV : inV;
    }
    if (inOk) return inV;
    if (exOk) return exV;
    return Object.prototype.hasOwnProperty.call(incoming || {}, key) ? inV : exV;
  };

  const msManual =
    incoming?.msManual != null ? !!(incoming.msManual || existing?.msManual) : !!existing?.msManual;
  const exT = fieldStampMs(existing, 'msUpdatedAt');
  const inT = fieldStampMs(incoming, 'msUpdatedAt');

  return {
    ms: pick('ms', 'msUpdatedAt', true),
    as: pick('as', 'asUpdatedAt'),
    ae: pick('ae', 'aeUpdatedAt'),
    offsetFromKo: pick('offsetFromKo', 'offsetUpdatedAt'),
    msManual,
    msUpdatedAt: inT >= exT && incoming?.msUpdatedAt ? incoming.msUpdatedAt : existing?.msUpdatedAt || incoming?.msUpdatedAt,
  };
}

function mergeTaskRow(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const exAtt = Array.isArray(existing.attachments) ? existing.attachments.length : 0;
  const inAtt = Array.isArray(incoming.attachments) ? incoming.attachments.length : 0;
  const whoPick = pickMergedWho(existing, incoming);
  const sched = pickMergedSchedule(existing, incoming);
  return {
    ...existing,
    ...incoming,
    who: whoPick.who,
    whoUpdatedAt: whoPick.whoUpdatedAt,
    ms: sched.ms,
    as: sched.as,
    ae: sched.ae,
    offsetFromKo: sched.offsetFromKo,
    msManual: sched.msManual,
    msUpdatedAt: sched.msUpdatedAt,
    comments: mergeTaskCommentArrays(existing.comments, incoming.comments),
    attachments: inAtt >= exAtt ? incoming.attachments : existing.attachments,
    source: incoming.source || existing.source,
  };
}

function mergePhaseTasks(exTasks, inTasks, removedIds) {
  const drop = new Set((removedIds || []).map((x) => String(x)));
  const exList = Array.isArray(exTasks) ? exTasks : [];
  const inList = Array.isArray(inTasks) ? inTasks : [];
  const exMap = new Map(exList.map((t) => [String(t.id), t]));
  const ordered = [];
  const seen = new Set();

  for (const t of inList) {
    const id = String(t.id);
    if (!id || seen.has(id) || drop.has(id)) continue;
    seen.add(id);
    ordered.push(mergeTaskRow(exMap.get(id), t));
  }
  for (const t of exList) {
    const id = String(t.id);
    if (!id || seen.has(id) || drop.has(id)) continue;
    seen.add(id);
    ordered.push(t);
  }
  return ordered;
}

function mergePhases(exPhases, inPhases, removedIds) {
  const exList = Array.isArray(exPhases) ? exPhases : [];
  const inList = Array.isArray(inPhases) ? inPhases : [];
  const exMap = new Map(exList.map((ph) => [String(ph.id), ph]));
  const ordered = [];
  const seen = new Set();

  for (const ph of inList) {
    const id = String(ph.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const exPh = exMap.get(id);
    ordered.push({
      ...(exPh || {}),
      ...ph,
      tasks: mergePhaseTasks(exPh?.tasks, ph.tasks, removedIds),
    });
  }
  for (const ph of exList) {
    const id = String(ph.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push({
      ...ph,
      tasks: mergePhaseTasks(ph.tasks, [], removedIds),
    });
  }
  return ordered;
}

export function mergeProjectDeep(existing, incoming) {
  if (!existing || typeof existing !== 'object') return incoming;
  if (!incoming || typeof incoming !== 'object') return incoming;
  const removedTaskIds = normalizeRemovedTaskIds(existing._removedTaskIds, incoming._removedTaskIds);
  const merged = {
    ...existing,
    ...incoming,
    _removedTaskIds: removedTaskIds,
    phases: mergePhases(existing.phases, incoming.phases, removedTaskIds),
  };
  return applyTaskTombstonesToProject(merged);
}

export function mergeActivityLogs(...sources) {
  const byId = new Map();
  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const row of src) {
      if (row?.id) byId.set(row.id, row);
    }
  }
  return dedupeActivityLog([...byId.values()]);
}

function normalizeDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  try {
    return JSON.stringify(detail, Object.keys(detail).sort());
  } catch {
    return String(detail);
  }
}

function activityEntryKey(row) {
  if (!row) return '';
  return [
    row.action || '',
    row.actor || '',
    row.projectId || '',
    row.phaseId || '',
    row.taskId || '',
    row.summary || '',
    normalizeDetail(row.detail),
  ].join('|');
}

function activityMinuteBucket(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function activityDedupeKey(row) {
  return `${activityEntryKey(row)}|${activityMinuteBucket(row.at)}`;
}

function dedupeActivityLog(logs) {
  const sorted = [...(logs || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const out = [];
  const indexByKey = new Map();

  for (const row of sorted) {
    const key = activityDedupeKey(row);
    const existingIdx = indexByKey.get(key);
    if (existingIdx != null) {
      const kept = out[existingIdx];
      kept.repeatCount = (kept.repeatCount || 1) + 1;
      if (String(row.at) > String(kept.at)) kept.at = row.at;
      continue;
    }
    const copy = { ...row, repeatCount: row.repeatCount || 1 };
    indexByKey.set(key, out.length);
    out.push(copy);
  }

  return out.slice(0, 3000);
}
