import zlib from 'node:zlib';
import { BSON } from 'bson';
import { Binary } from 'mongodb';

export const V1_CASHFLOW_APP_ID = 'v1_cashflow';

/** MongoDB max doc ~16MB; leave headroom for field names + indexes. */
const MAX_ROW_BSON_BYTES = 14 * 1024 * 1024;

/** Blob docs must stay under 16MB; binary payload only. */
const GZIP_CHUNK_BYTES = 12 * 1024 * 1024;

const BLOB_SCOPE = 'v1_cfdata_gzip';
export const CF_MONGO_PACK_VER = 1;

function rowBSONSize(appId, dataPayload, version, updatedAt, updatedBy) {
  return BSON.calculateObjectSize({
    _id: appId,
    appId,
    data: dataPayload,
    version,
    updatedAt,
    updatedBy
  });
}

function bufferFromMongoBinary(field) {
  if (field == null) return null;
  if (Buffer.isBuffer(field)) return field;
  if (field instanceof Uint8Array) return Buffer.from(field);
  if (typeof field.read === 'function' && typeof field.length === 'function') {
    const len = field.length();
    return Buffer.from(field.read(0, len));
  }
  if (typeof field.buffer !== 'undefined') return Buffer.from(field.buffer);
  return Buffer.from(field);
}

/**
 * @returns {Promise<object>} Client-shaped envelope { v, ts, data, manualProjs, ui }
 */
export async function unpackV1CashflowRowData(db, rowData) {
  if (!rowData || typeof rowData !== 'object' || rowData._cfMongoPack !== CF_MONGO_PACK_VER) {
    return rowData;
  }

  let gz;
  if (rowData._cfChunked) {
    const n = Number(rowData._cfParts) || 0;
    const parts = await db
      .collection('app_state_blobs')
      .find({ appId: V1_CASHFLOW_APP_ID, scope: BLOB_SCOPE })
      .sort({ part: 1 })
      .toArray();
    if (!parts.length || parts.length !== n) {
      throw new Error(`Cashflow cloud state is incomplete (${parts.length}/${n} chunks). Re-save from the app or restore a snapshot.`);
    }
    gz = Buffer.concat(parts.map((p) => bufferFromMongoBinary(p.b)));
  } else {
    gz = bufferFromMongoBinary(rowData.cfDataGzip);
  }

  if (!gz?.length) throw new Error('Cashflow cloud state payload missing compressed body');

  const inner = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  return {
    v: rowData.v,
    ts: rowData.ts,
    manualProjs: rowData.manualProjs,
    ui: rowData.ui,
    data: inner
  };
}

function mergeManualProjsList(existing, incoming) {
  const byId = new Map();
  for (const p of existing || []) {
    if (p && p.id != null) byId.set(String(p.id), p);
  }
  for (const p of incoming || []) {
    if (p && p.id != null) byId.set(String(p.id), p);
  }
  return Array.from(byId.values());
}
function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function normalizeIdKey(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
function arrayIdentityForMerge(path, row) {
  if (!row || typeof row !== 'object') return '';
  if (row.id != null && String(row.id).trim()) return `id:${String(row.id).trim()}`;
  if ((path === 'units' || path === 'unsoldUnits') && row.unitNo != null) {
    const unitNo = normalizeIdKey(row.unitNo);
    if (unitNo) return `unit:${unitNo}`;
  }
  return '';
}
function mergeArrayRowsByIdentity(path, existingArr, incomingArr) {
  const out = Array.isArray(existingArr) ? existingArr.slice() : [];
  const indexByKey = new Map();
  out.forEach((row, i) => {
    const k = arrayIdentityForMerge(path, row);
    if (k) indexByKey.set(k, i);
  });
  for (const incomingRow of incomingArr) {
    const k = arrayIdentityForMerge(path, incomingRow);
    if (!k || !indexByKey.has(k)) {
      out.push(incomingRow);
      continue;
    }
    const idx = indexByKey.get(k);
    const existingRow = out[idx];
    if (isPlainObject(existingRow) && isPlainObject(incomingRow)) {
      out[idx] = deepMergeWorkbook(existingRow, incomingRow, path);
    } else {
      out[idx] = incomingRow;
    }
  }
  return out;
}
const PID_SECTION_ARRAY_MERGE_KEYS = new Set([
  'units',
  'unsoldUnits',
  'actuals',
  'investors',
  'unsecuredLoans',
  'debtTranches',
  'customerUL',
  'otherInflows',
  'commentLog'
]);
/**
 * Recursive merge for workbook JSON objects.
 * Arrays are replaced by default. For key project sections with row ids,
 * arrays are merged by row identity to reduce concurrent edit collisions.
 */
function deepMergeWorkbook(existing, incoming, path = '') {
  if (!isPlainObject(existing)) return incoming;
  if (!isPlainObject(incoming)) return incoming;
  const out = { ...existing };
  for (const k of Object.keys(incoming)) {
    const ev = existing[k];
    const iv = incoming[k];
    if (isPlainObject(ev) && isPlainObject(iv)) {
      out[k] = deepMergeWorkbook(ev, iv, k);
      continue;
    }
    if (Array.isArray(ev) && Array.isArray(iv) && PID_SECTION_ARRAY_MERGE_KEYS.has(k)) {
      out[k] = mergeArrayRowsByIdentity(k, ev, iv);
      continue;
    }
    out[k] = iv;
  }
  return out;
}

export function mergeV1CashflowEnvelopes(existingEnv, incomingEnv) {
  if (!incomingEnv || typeof incomingEnv !== 'object') {
    throw new Error('v1_cashflow merge requires incoming envelope');
  }
  const ex = existingEnv && typeof existingEnv === 'object' ? existingEnv : null;
  const exData = ex && ex.data && typeof ex.data === 'object' && !Array.isArray(ex.data) ? ex.data : {};
  const inData =
    incomingEnv.data && typeof incomingEnv.data === 'object' && !Array.isArray(incomingEnv.data)
      ? incomingEnv.data
      : {};
  const mergedData = { ...exData };
  for (const pid of Object.keys(inData)) {
    const incomingPid = inData[pid];
    const existingPid = exData[pid];
    if (isPlainObject(existingPid) && isPlainObject(incomingPid)) mergedData[pid] = deepMergeWorkbook(existingPid, incomingPid);
    else mergedData[pid] = incomingPid;
  }
  return {
    v: incomingEnv.v,
    ts: Date.now(),
    data: mergedData,
    manualProjs: mergeManualProjsList(ex?.manualProjs, incomingEnv.manualProjs),
    ui: {
      ...(ex?.ui && typeof ex.ui === 'object' && !Array.isArray(ex.ui) ? ex.ui : {}),
      ...(incomingEnv.ui && typeof incomingEnv.ui === 'object' && !Array.isArray(incomingEnv.ui) ? incomingEnv.ui : {})
    }
  };
}

/** Count sold-unit rows across all projects in a client envelope. */
export function countSoldUnitsInEnvelope(env) {
  if (!env?.data || typeof env.data !== 'object' || Array.isArray(env.data)) return 0;
  let n = 0;
  for (const pid of Object.keys(env.data)) {
    const units = env.data[pid]?.units;
    if (Array.isArray(units)) n += units.length;
  }
  return n;
}

/** Per-project sold-unit counts (non-zero only). */
export function soldUnitsByProject(env) {
  const out = {};
  if (!env?.data || typeof env.data !== 'object' || Array.isArray(env.data)) return out;
  for (const pid of Object.keys(env.data)) {
    const units = env.data[pid]?.units;
    if (Array.isArray(units) && units.length) out[pid] = units.length;
  }
  return out;
}

export function soldUnitsForProjects(env, projectIds = []) {
  const by = soldUnitsByProject(env);
  let n = 0;
  for (const pid of projectIds) n += by[pid] || 0;
  return n;
}

function normUnitNoKey(unitNo) {
  return String(unitNo || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function isParadiseProjectKey(pid, cfg, manualProjs = []) {
  if (pid === 'P009') return true;
  const name = String(cfg?.projName || '').toLowerCase();
  if (name.includes('paradise')) return true;
  const manual = manualProjs.find((p) => p && String(p.id) === String(pid));
  return String(manual?.name || '')
    .toLowerCase()
    .includes('paradise');
}

/** Sold units in any project row named Paradise (includes manual MP_* ids). */
export function soldUnitsForParadiseLike(env) {
  if (!env?.data || typeof env.data !== 'object') return 0;
  let n = 0;
  for (const pid of Object.keys(env.data)) {
    const cfg = env.data[pid];
    if (!isParadiseProjectKey(pid, cfg)) continue;
    const units = cfg?.units;
    if (Array.isArray(units)) n += units.length;
  }
  return n;
}

function mergeParadiseProjectCfg(target, src) {
  const out = JSON.parse(JSON.stringify(target || {}));
  out.units = Array.isArray(out.units) ? out.units : [];
  out.unsoldUnits = Array.isArray(out.unsoldUnits) ? out.unsoldUnits : [];
  const seen = new Set(out.units.map((u) => normUnitNoKey(u?.unitNo)));
  for (const u of src.units || []) {
    const k = normUnitNoKey(u?.unitNo);
    if (!k || seen.has(k)) continue;
    out.units.push(u);
    seen.add(k);
  }
  const unsoldSeen = new Set(out.unsoldUnits.map((u) => normUnitNoKey(u?.unitNo)));
  for (const u of src.unsoldUnits || []) {
    const k = normUnitNoKey(u?.unitNo);
    if (!k || unsoldSeen.has(k)) continue;
    out.unsoldUnits.push(u);
    unsoldSeen.add(k);
  }
  for (const key of [
    'milestonesUpload',
    'milestonesAchievedDates',
    'milestonesTargetDates',
    'commentLog',
    'unsoldPace'
  ]) {
    const sv = src[key];
    const tv = out[key];
    if (!sv) continue;
    if (!tv || (typeof sv === 'object' && Object.keys(sv).length > Object.keys(tv || {}).length)) {
      out[key] = sv;
    }
  }
  if (!out.projName) out.projName = src.projName || 'Paradise';
  return out;
}

/**
 * V3 Paradise is P009 but CRM/manual imports often land on MP_* keys — merge into P009 for reads/saves.
 */
export function consolidateParadiseInEnvelope(env) {
  if (!env?.data || typeof env.data !== 'object' || Array.isArray(env.data)) return env;
  const manualProjs = Array.isArray(env.manualProjs) ? env.manualProjs : [];
  const paradiseIds = Object.keys(env.data).filter((pid) =>
    isParadiseProjectKey(pid, env.data[pid], manualProjs)
  );
  if ((env.data.P009?.units?.length || 0) === 0) {
    const mpKeys = Object.keys(env.data).filter((pid) => String(pid).startsWith('MP_'));
    if (mpKeys.length) {
      mpKeys.sort((a, b) => (env.data[b]?.units?.length || 0) - (env.data[a]?.units?.length || 0));
      const rich = mpKeys[0];
      const richN = env.data[rich]?.units?.length || 0;
      if (richN >= 10 && !paradiseIds.includes(rich)) paradiseIds.push(rich);
    }
  }
  if (paradiseIds.length < 2 && !(paradiseIds.length === 1 && paradiseIds[0] !== 'P009')) {
    if (paradiseIds.length === 1 && paradiseIds[0] !== 'P009') {
      const only = paradiseIds[0];
      const data = { ...env.data };
      data.P009 = mergeParadiseProjectCfg({ projName: 'Paradise', units: [], unsoldUnits: [] }, data[only]);
      data.P009.projName = 'Paradise';
      delete data[only];
      return { ...env, data };
    }
    return env;
  }

  const canonical = 'P009';
  const data = { ...env.data };
  let merged = data[canonical]
    ? mergeParadiseProjectCfg({ projName: 'Paradise', units: [], unsoldUnits: [] }, data[canonical])
    : { projName: 'Paradise', units: [], unsoldUnits: [] };

  for (const pid of paradiseIds) {
    if (pid === canonical) continue;
    merged = mergeParadiseProjectCfg(merged, data[pid]);
    delete data[pid];
  }
  merged.projName = 'Paradise';
  data[canonical] = merged;

  const drop = new Set(paradiseIds.filter((id) => id !== canonical));
  const nextManualProjs = manualProjs.filter((p) => p && !drop.has(p.id));

  return { ...env, data, manualProjs: nextManualProjs };
}

/**
 * Unpack + legacy shapes so API clients always receive { v, ts, data, manualProjs, ui }.
 * @param {import('mongodb').Db} db
 * @param {object} rowData app_states.data for v1_cashflow
 */
export async function repairV1CashflowForRead(db, rowData) {
  if (!rowData || typeof rowData !== 'object') return rowData;
  let env = rowData;
  if (rowData._cfMongoPack === CF_MONGO_PACK_VER) {
    env = await unpackV1CashflowRowData(db, rowData);
  } else if (typeof rowData.ga_cf_v1 === 'string') {
    try {
      const parsed = JSON.parse(rowData.ga_cf_v1);
      if (parsed && typeof parsed === 'object' && parsed.data != null) env = parsed;
    } catch (_) {
      // fall through
    }
  } else if (rowData.data !== undefined && typeof rowData.data === 'object' && !Array.isArray(rowData.data)) {
    env = rowData;
  }
  return consolidateParadiseInEnvelope(env);
}

/**
 * @param {import('mongodb').Db} db
 * @param {object | undefined} existingStored
 * @param {object} incomingEnvelope
 */
export async function mergeV1CashflowForPut(db, existingStored, incomingEnvelope) {
  let existingEnv = null;
  if (existingStored) {
    existingEnv = await repairV1CashflowForRead(db, existingStored);
  }
  return mergeV1CashflowEnvelopes(existingEnv, incomingEnvelope);
}

async function clearV1Blobs(db) {
  await db.collection('app_state_blobs').deleteMany({ appId: V1_CASHFLOW_APP_ID, scope: BLOB_SCOPE });
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} envelope Client PUT body.data — must include .data (heavy workbook)
 * @param {{ version?: number, updatedBy?: string }} [probeCtx] BSON size probe uses same shape as the persisted row
 * @returns {Promise<object>} Value to store in app_states.data
 */
export async function packV1CashflowRowData(db, envelope, probeCtx = {}) {
  if (!envelope || typeof envelope !== 'object') throw new Error('Invalid v1_cashflow envelope');

  const inner = envelope.data;
  if (inner === undefined) throw new Error('v1_cashflow save requires body.data.data (workbook payload)');

  const meta = {
    v: envelope.v,
    ts: envelope.ts,
    manualProjs: envelope.manualProjs,
    ui: envelope.ui
  };

  const gz = zlib.gzipSync(JSON.stringify(inner), { level: zlib.constants.Z_BEST_SPEED });
  const now = new Date();
  const version = Number(probeCtx.version) > 0 ? Number(probeCtx.version) : 1;
  const updatedBy = typeof probeCtx.updatedBy === 'string' && probeCtx.updatedBy.trim() ? probeCtx.updatedBy.trim() : 'system';

  await clearV1Blobs(db);

  const inlinePayload = {
    ...meta,
    _cfMongoPack: CF_MONGO_PACK_VER,
    cfDataGzip: new Binary(gz)
  };

  const inlineSize = rowBSONSize(V1_CASHFLOW_APP_ID, inlinePayload, version, now, updatedBy);
  if (inlineSize <= MAX_ROW_BSON_BYTES) {
    return inlinePayload;
  }

  const chunks = [];
  for (let i = 0; i < gz.length; i += GZIP_CHUNK_BYTES) {
    chunks.push(gz.subarray(i, i + GZIP_CHUNK_BYTES));
  }

  if (!chunks.length) {
    return inlinePayload;
  }

  await db.collection('app_state_blobs').insertMany(
    chunks.map((buf, part) => ({
      appId: V1_CASHFLOW_APP_ID,
      scope: BLOB_SCOPE,
      part,
      b: new Binary(buf)
    }))
  );

  return {
    ...meta,
    _cfMongoPack: CF_MONGO_PACK_VER,
    _cfChunked: true,
    _cfParts: chunks.length,
    _cfOrigCompressedLen: gz.length
  };
}
