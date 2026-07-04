/** Deep merge PreConstruction projects — union phases and tasks by id (server 409 merge). */

function mergeTaskRow(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const exComments = Array.isArray(existing.comments) ? existing.comments.length : 0;
  const inComments = Array.isArray(incoming.comments) ? incoming.comments.length : 0;
  const exAtt = Array.isArray(existing.attachments) ? existing.attachments.length : 0;
  const inAtt = Array.isArray(incoming.attachments) ? incoming.attachments.length : 0;
  return {
    ...existing,
    ...incoming,
    comments: inComments >= exComments ? incoming.comments : existing.comments,
    attachments: inAtt >= exAtt ? incoming.attachments : existing.attachments,
    msManual: incoming.msManual ?? existing.msManual,
    source: incoming.source || existing.source,
  };
}

function mergePhaseTasks(exTasks, inTasks) {
  const exList = Array.isArray(exTasks) ? exTasks : [];
  const inList = Array.isArray(inTasks) ? inTasks : [];
  const exMap = new Map(exList.map((t) => [String(t.id), t]));
  const ordered = [];
  const seen = new Set();

  for (const t of inList) {
    const id = String(t.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(mergeTaskRow(exMap.get(id), t));
  }
  for (const t of exList) {
    const id = String(t.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(t);
  }
  return ordered;
}

function mergePhases(exPhases, inPhases) {
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
      tasks: mergePhaseTasks(exPh?.tasks, ph.tasks),
    });
  }
  for (const ph of exList) {
    const id = String(ph.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(ph);
  }
  return ordered;
}

export function mergeProjectDeep(existing, incoming) {
  if (!existing || typeof existing !== 'object') return incoming;
  if (!incoming || typeof incoming !== 'object') return incoming;
  return {
    ...existing,
    ...incoming,
    phases: mergePhases(existing.phases, incoming.phases),
  };
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
