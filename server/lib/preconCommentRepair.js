/** Server-side mirror of GA_PreConstruction_React/src/preconCommentReconcile.js */

function normTaskKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function commentSortKey(c) {
  if (c?.createdAt) {
    const t = new Date(c.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const raw = String(c?.ts || '').trim();
  if (!raw) return 0;
  let t = new Date(raw).getTime();
  if (!Number.isNaN(t)) return t;
  const dmy = raw.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (dmy) {
    t = new Date(`${dmy[1]} ${dmy[2]} ${dmy[3]}`).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    t = new Date(raw.slice(0, 10)).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function ensureCommentCreatedAt(c) {
  if (!c || c.createdAt) return c;
  const k = commentSortKey(c);
  if (k > 0) return { ...c, createdAt: new Date(k).toISOString() };
  return c;
}

function normalizeCommentRow(c) {
  if (c == null) return null;
  if (typeof c === 'string') {
    const text = c.trim();
    return text ? { author: 'Note', ts: '', text } : null;
  }
  if (typeof c !== 'object') return null;
  const text = String(c.text ?? c.comment ?? c.body ?? c.message ?? c.note ?? c.remarks ?? c.content ?? c.description ?? '').trim();
  const nextAction = String(c.nextAction ?? c.next_action ?? c.nextActionText ?? c.action ?? '').trim();
  const nextActionDate = String(c.nextActionDate ?? c.next_action_date ?? c.due ?? c.dueDate ?? c.actionDate ?? '').trim();
  if (!text && !nextAction && !nextActionDate) return null;
  return {
    ...c,
    text,
    nextAction,
    nextActionDate,
    author: c.author || c.by || c.user || c.name || c.authorName || 'Anon',
    ts: c.ts || c.date || c.time || c.createdAt || c.updatedAt || '',
  };
}

function parseLegacyCommentString(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(normalizeCommentRow).filter(Boolean);
    if (parsed && typeof parsed === 'object') return normalizeTaskComments(parsed);
  } catch {
    /* plain text or formatted string */
  }
  if (text.includes('[') && text.includes(']')) {
    const chunks = text.split(/\s*\|\s*(?=\[)/).map((part) => part.trim()).filter(Boolean);
    if (chunks.length > 1 || /^\[.+\]/.test(chunks[0] || '')) {
      return chunks.map(parseBracketCommentChunk).filter(Boolean);
    }
  }
  return [{ author: 'Note', ts: '', text }];
}

function parseBracketCommentChunk(chunk) {
  const match = String(chunk || '').trim().match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (!match) return normalizeCommentRow(chunk);
  const meta = match[1].trim();
  let body = match[2].trim();
  let nextAction = '';
  let nextActionDate = '';
  const nextMatch = body.match(/\s*\|\s*Next:\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (nextMatch) {
    nextAction = String(nextMatch[1] || '').trim();
    nextActionDate = String(nextMatch[2] || '').trim();
    body = body.slice(0, nextMatch.index).trim();
  }
  const parts = meta.split(/\s+/);
  let author = meta;
  let ts = '';
  if (parts.length >= 3 && /\d/.test(parts[parts.length - 1])) {
    ts = parts.slice(-3).join(' ');
    author = parts.slice(0, -3).join(' ') || meta;
  } else if (parts.length >= 2) {
    ts = parts.slice(-2).join(' ');
    author = parts.slice(0, -2).join(' ') || meta;
  }
  return normalizeCommentRow({ author, ts, text: body, nextAction, nextActionDate });
}

function normalizeTaskComments(comments) {
  if (comments == null) return [];
  if (typeof comments === 'string') return parseLegacyCommentString(comments);
  if (!Array.isArray(comments)) {
    if (typeof comments === 'object') {
      const values = Object.values(comments);
      if (values.length) return normalizeTaskComments(values);
    }
    return [];
  }
  const rows = [];
  comments.forEach((entry) => {
    if (typeof entry === 'string' && entry.includes('[') && entry.includes(']')) {
      rows.push(...parseLegacyCommentString(entry));
      return;
    }
    const row = normalizeCommentRow(entry);
    if (row) rows.push(row);
  });
  return rows;
}

function commentDedupeKey(c) {
  return [
    String(c?.author || '').trim().toLowerCase(),
    String(c?.text || '').trim(),
    String(c?.nextAction || '').trim(),
    String(c?.nextActionDate || '').trim(),
    String(c?.createdAt || c?.ts || '').trim(),
  ].join('|');
}

function commentIdentityKey(c) {
  if (!c || typeof c !== 'object') return '';
  const id = String(c.id || '').trim();
  if (id) return `id:${id}`;
  const created = String(c.createdAt || '').trim();
  const author = String(c.author || '').trim().toLowerCase();
  const text = String(c.text || '').trim().slice(0, 120);
  if (created && (author || text)) return `ca:${created}|${author}|${text}`;
  return `fp:${commentDedupeKey(c)}`;
}

function commentRichness(c) {
  let n = 0;
  if (String(c?.nextActionDate || '').trim()) n += 4;
  if (String(c?.nextAction || '').trim()) n += 2;
  if (String(c?.text || '').trim()) n += 1;
  if (Array.isArray(c?.attachments) && c.attachments.length) n += c.attachments.length;
  if (c?.updatedAt) n += 1;
  return n;
}

function preferComment(a, b) {
  const aUp = Date.parse(a?.updatedAt || '') || 0;
  const bUp = Date.parse(b?.updatedAt || '') || 0;
  if (bUp !== aUp) return bUp > aUp ? b : a;
  const aTs = commentSortKey(a);
  const bTs = commentSortKey(b);
  if (bTs !== aTs) return bTs > aTs ? b : a;
  return commentRichness(b) >= commentRichness(a) ? b : a;
}

function mergeCommentBuckets(lists) {
  const byKey = new Map();
  (lists || []).forEach((list) => {
    normalizeTaskComments(list).forEach((comment) => {
      const key = commentIdentityKey(comment) || commentDedupeKey(comment);
      if (!key) return;
      const prev = byKey.get(key);
      byKey.set(key, prev ? preferComment(prev, comment) : comment);
    });
  });
  return [...byKey.values()];
}

/** Content-union of two task comment arrays (never length-only replace). */
export function mergeTaskCommentArrays(existing, incoming) {
  return mergeCommentBuckets([existing, incoming]);
}

function legacyTaskCommentSources(task) {
  const buckets = [];
  if (task?.comments != null) buckets.push(task.comments);
  if (task?.comment != null) buckets.push(task.comment);
  if (task?.commentLog != null) buckets.push(task.commentLog);
  if (task?.commentHistory != null) buckets.push(task.commentHistory);
  if (task?.remarks != null) buckets.push(task.remarks);
  if (typeof task?.remark === 'string' && task.remark.trim() && task.remark.trim() !== '-') {
    buckets.push([{ author: 'Note', text: task.remark.trim(), ts: '' }]);
  }
  if (typeof task?.notes === 'string' && task.notes.trim()) {
    buckets.push([{ author: 'Note', text: task.notes.trim(), ts: '' }]);
  }
  return buckets;
}

function taskNameKeys(name) {
  const keys = new Set();
  const raw = String(name || '').trim();
  const base = normTaskKey(raw);
  if (base) keys.add(base);
  const stripped = normTaskKey(raw.replace(/^[^:]+:\s*/, ''));
  if (stripped) keys.add(stripped);
  return [...keys];
}

function commentsFingerprint(comments) {
  try {
    return JSON.stringify(normalizeTaskComments(comments));
  } catch {
    return '';
  }
}

function applyComments(task, merged) {
  const withTs = merged.map((c) => ensureCommentCreatedAt(c));
  const next = commentsFingerprint(withTs);
  const prev = commentsFingerprint(task.comments);
  if (next !== prev) {
    task.comments = withTs;
    return true;
  }
  return false;
}

export function repairAllTaskComments(state) {
  if (!state || typeof state !== 'object') return { state, changed: false, groups: 0 };

  let changed = false;
  let groups = 0;

  for (const proj of state.projects || []) {
    const hits = [];
    for (const ph of proj.phases || []) {
      for (const task of ph.tasks || []) {
        hits.push({ ph, task, keys: taskNameKeys(task.name) });
      }
    }

    const parent = new Map();
    const find = (id) => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root);
      let cur = id;
      while (cur !== root) {
        const next = parent.get(cur);
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };

    hits.forEach((_, index) => {
      parent.set(`${index}`, `${index}`);
    });

    const keyOwner = new Map();
    hits.forEach(({ keys }, index) => {
      const id = `${index}`;
      keys.forEach((key) => {
        if (!key) return;
        if (keyOwner.has(key)) union(id, keyOwner.get(key));
        else keyOwner.set(key, id);
      });
    });

    const clusters = new Map();
    hits.forEach((hit, index) => {
      const root = find(`${index}`);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(hit);
    });

    clusters.forEach((cluster) => {
      if (cluster.length > 1) groups += 1;
      const merged = mergeCommentBuckets(cluster.flatMap(({ task }) => legacyTaskCommentSources(task)));
      cluster.forEach(({ task }) => {
        if (applyComments(task, merged.length ? merged : normalizeTaskComments(task.comments))) {
          changed = true;
        }
      });
    });
  }

  return { state, changed, groups };
}
