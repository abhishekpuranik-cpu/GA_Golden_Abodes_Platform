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
