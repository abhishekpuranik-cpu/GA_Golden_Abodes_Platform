/** PreConstruction app_states merge — union projects by id; tombstones prevent deleted projects returning. */
import { migrateAssigneeNamesState } from './preconAssigneeMigrate.js';
import { repairAllTaskComments } from './preconCommentRepair.js';
import { mergeActivityLogs, mergeProjectDeep, applyTaskTombstonesToProject } from './preconProjectMerge.js';

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeRemovedIds(...sources) {
  const out = new Set();
  for (const src of sources) {
    if (!isPlainObject(src)) continue;
    const list = Array.isArray(src._removedProjectIds) ? src._removedProjectIds : [];
    for (const id of list) {
      const s = String(id || '').trim();
      if (s) out.add(s);
    }
  }
  return [...out];
}

function applyProjectTombstones(projects, removedIds) {
  const drop = new Set((removedIds || []).map((x) => String(x)));
  if (!drop.size) return projects || [];
  return (projects || []).filter((p) => p?.id != null && !drop.has(String(p.id)));
}

/** Strip tombstoned projects on read (GET / state load). Keep GET cheap — comment repair runs on PUT + client hydrate. */
export function repairPreconstructionForRead(data) {
  if (!isPlainObject(data)) return data;
  const removedIds = normalizeRemovedIds(data);
  const repaired = migrateAssigneeNamesState(
    !removedIds.length
      ? { ...data }
      : {
          ...data,
          _removedProjectIds: removedIds,
          projects: applyProjectTombstones(data.projects, removedIds),
        },
  );
  for (const proj of repaired.projects || []) {
    applyTaskTombstonesToProject(proj);
  }
  // Cap activity log on read so first paint / GET stay small (full history remains in DB until next write trims).
  if (Array.isArray(repaired.activityLog) && repaired.activityLog.length > 200) {
    repaired.activityLog = repaired.activityLog.slice(0, 200);
  }
  return repaired;
}

function slimCommentRow(c) {
  if (!c || typeof c !== 'object') return c;
  return {
    id: c.id,
    text: c.text,
    author: c.author,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    ts: c.ts,
    nextAction: c.nextAction,
    nextActionDate: c.nextActionDate,
    flag: !!c.flag,
    markedComplete: !!c.markedComplete,
    attachments: Array.isArray(c.attachments) ? c.attachments.slice(0, 8) : undefined,
  };
}

function slimTaskComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  // Keep every comment (calendar + task history) but drop heavy notify/email fields.
  return list.map(slimCommentRow);
}

/**
 * Boot/slim projection for first paint.
 * Activity log alone is often >1MB — omit it on boot (PUT merge preserves server history).
 * Comments stay complete (field-slimmed). Use ?full=1 for activity log + raw comment fields.
 */
export function slimPreconstructionForBoot(data) {
  const base = repairPreconstructionForRead(data);
  if (!isPlainObject(base)) return base;
  return {
    cloudUrl: base.cloudUrl || '',
    departments: base.departments || [],
    _removedProjectIds: base._removedProjectIds || [],
    activityLog: [],
    __slimBoot: true,
    projects: (base.projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      loc: p.loc,
      type: p.type,
      floors: p.floors,
      status: p.status,
      ko: p.ko,
      col: p.col,
      _removedTaskIds: p._removedTaskIds,
      phases: (p.phases || []).map((ph) => ({
        id: ph.id,
        name: ph.name,
        col: ph.col,
        open: ph.open,
        tasks: (ph.tasks || []).map((t) => ({
          ...t,
          comments: slimTaskComments(t.comments),
          attachments: Array.isArray(t.attachments) ? t.attachments.slice(0, 8) : t.attachments,
        })),
      })),
    })),
  };
}

/** Full repair for writes (keeps comment clusters healthy without blocking first paint). */
export function repairPreconstructionForWrite(data) {
  const repaired = repairPreconstructionForRead(data);
  if (!isPlainObject(repaired)) return repaired;
  repairAllTaskComments(repaired);
  return repaired;
}

/**
 * Merge workspace envelopes.
 *
 * Rules that prevent portfolio wipe:
 * 1. Never infer deletes from "missing in client projects array".
 * 2. Never accept a mass new tombstone list from a poisoned client (cap new deletes).
 * 3. If the client still sends a project, clear that id from tombstones (revive).
 *
 * Legitimate Delete still works: delProject omits the project and adds one id to `_removedProjectIds`.
 */
export function mergePreconstructionState(existingRow, incoming, opts = {}) {
  void opts;
  const ex = isPlainObject(existingRow) ? existingRow : {};
  const inc = isPlainObject(incoming) ? incoming : {};
  const exProjects = Array.isArray(ex.projects) ? ex.projects : [];
  const inProjects = Array.isArray(inc.projects) ? inc.projects : [];

  const exRemoved = new Set(normalizeRemovedIds(ex));
  const incRemoved = normalizeRemovedIds(inc);
  const inIds = new Set(inProjects.map((p) => String(p?.id)).filter(Boolean));

  const removedIds = new Set(exRemoved);

  // Revive anything the client still has in its catalog.
  for (const id of inIds) removedIds.delete(id);

  // Accept only a small number of NEW explicit deletes (real Delete clicks).
  const newDeletes = incRemoved.filter((id) => !inIds.has(id) && !exRemoved.has(id));
  const MAX_NEW_DELETES_PER_SAVE = 2;
  if (newDeletes.length > 0 && newDeletes.length <= MAX_NEW_DELETES_PER_SAVE) {
    for (const id of newDeletes) removedIds.add(id);
  } else if (newDeletes.length > MAX_NEW_DELETES_PER_SAVE) {
    console.warn(
      `[precon-merge] ignored mass tombstone attempt (${newDeletes.length} ids) — likely poisoned client state`,
    );
  }

  const byId = new Map();
  for (const p of exProjects) {
    if (p?.id != null) byId.set(String(p.id), p);
  }
  for (const p of inProjects) {
    if (p?.id == null) continue;
    const id = String(p.id);
    byId.set(id, byId.has(id) ? mergeProjectDeep(byId.get(id), p) : p);
  }

  for (const id of removedIds) byId.delete(id);

  const departments =
    Array.isArray(inc.departments) && inc.departments.length
      ? inc.departments
      : Array.isArray(ex.departments)
        ? ex.departments
        : [];

  return {
    cloudUrl: inc.cloudUrl != null && String(inc.cloudUrl).trim() ? inc.cloudUrl : ex.cloudUrl || '',
    departments,
    activityLog: mergeActivityLogs(ex.activityLog, inc.activityLog),
    _removedProjectIds: [...removedIds],
    projects: [...byId.values()],
  };
}
