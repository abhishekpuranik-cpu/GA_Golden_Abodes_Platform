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

/**
 * Union-merge per-project workbook keys so a short client save cannot drop projects
 * that exist only in Mongo.
 * @param {object | null} existingEnv
 * @param {object} incomingEnv
 */
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

/**
 * Unpack + legacy shapes so API clients always receive { v, ts, data, manualProjs, ui }.
 * @param {import('mongodb').Db} db
 * @param {object} rowData app_states.data for v1_cashflow
 */
export async function repairV1CashflowForRead(db, rowData) {
  if (!rowData || typeof rowData !== 'object') return rowData;
  if (rowData._cfMongoPack === CF_MONGO_PACK_VER) {
    return unpackV1CashflowRowData(db, rowData);
  }
  if (typeof rowData.ga_cf_v1 === 'string') {
    try {
      const parsed = JSON.parse(rowData.ga_cf_v1);
      if (parsed && typeof parsed === 'object' && parsed.data != null) return parsed;
    } catch (_) {
      // fall through
    }
  }
  if (rowData.data !== undefined && typeof rowData.data === 'object' && !Array.isArray(rowData.data)) {
    return rowData;
  }
  return rowData;
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
