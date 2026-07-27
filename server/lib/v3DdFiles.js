/**
 * Project Acquisition V3 — Due Diligence evidence files (GridFS).
 * Binaries never enter ga_planner_state_v1. Evidence is immutable: never overwrite or delete.
 */
import crypto from 'crypto';
import { GridFSBucket, ObjectId } from 'mongodb';

export const V3_DD_FILES_BUCKET = 'v3_dd_files';
export const V3_DD_FILE_META = 'v3_dd_file_meta';

/** Portal captures / screenshots / analyst uploads */
export const MAX_BYTES_DEFAULT = 25 * 1024 * 1024;
/** Professional reports (advocate / architect / surveyor) */
export const MAX_BYTES_PROFESSIONAL = 100 * 1024 * 1024;

const PROFESSIONAL_SOURCE_TYPES = new Set([
  'advocate_report',
  'architect_opinion',
  'surveyor_report'
]);

export function maxBytesForSourceType(sourceType) {
  const t = String(sourceType || '').trim();
  if (PROFESSIONAL_SOURCE_TYPES.has(t)) return MAX_BYTES_PROFESSIONAL;
  return MAX_BYTES_DEFAULT;
}

export function newV3DdFileId() {
  return `v3dd_${crypto.randomBytes(8).toString('hex')}`;
}

export function sourceRefForFileId(fileId) {
  return `v3dd://${String(fileId)}`;
}

export function fileIdFromSourceRef(ref) {
  const s = String(ref || '');
  const m = /^v3dd:\/\/(.+)$/.exec(s);
  return m ? m[1] : null;
}

/**
 * Sniff actual content. Do not trust extension or client Content-Type.
 * @param {Buffer} buffer
 * @returns {'application/pdf'|`image/${string}`|null}
 */
export function sniffAllowedMime(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  // %PDF
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }
  // WEBP (RIFF....WEBP)
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function gfsBucket(db) {
  return new GridFSBucket(db, { bucketName: V3_DD_FILES_BUCKET });
}

export async function ensureV3DdFileIndexes(db) {
  const col = db.collection(V3_DD_FILE_META);
  await col.createIndex({ projectId: 1, sha256: 1 });
  await col.createIndex({ gridId: 1 });
  await col.createIndex({ uploadedOn: -1 });
}

/**
 * @param {import('mongodb').Db} db
 * @param {{
 *   buffer: Buffer,
 *   fileName: string,
 *   sourceType?: string,
 *   meta?: {
 *     projectId?: string,
 *     runId?: string,
 *     stageKey?: string,
 *     uploadedBy?: string
 *   }
 * }} file
 */
export async function storeV3DdFile(db, file) {
  const { buffer, fileName, sourceType, meta = {} } = file;
  if (!buffer?.length) throw new Error('Empty file');

  const maxBytes = maxBytesForSourceType(sourceType);
  if (buffer.length > maxBytes) {
    throw new Error(
      `File exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit for source type "${sourceType || 'default'}"`
    );
  }

  const mimeType = sniffAllowedMime(buffer);
  if (!mimeType) {
    throw new Error('File type not allowed — only PDF and images (content-validated)');
  }

  const projectId = String(meta.projectId || '').trim();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  if (projectId) {
    const existing = await db.collection(V3_DD_FILE_META).findOne({ projectId, sha256 });
    if (existing?._id && existing.gridId) {
      return {
        id: String(existing._id),
        fileName: existing.fileName,
        mimeType: existing.mimeType,
        size: existing.size,
        sha256: existing.sha256,
        sourceRef: sourceRefForFileId(existing._id),
        deduped: true,
        projectId: existing.projectId || projectId
      };
    }
  }

  const bucket = gfsBucket(db);
  const gridId = new ObjectId();
  const fileId = newV3DdFileId();

  await new Promise((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(gridId, fileName || 'file', {
      contentType: mimeType,
      metadata: {
        fileId,
        projectId,
        runId: meta.runId || '',
        stageKey: meta.stageKey || '',
        sha256,
        sourceType: sourceType || ''
      }
    });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(buffer);
  });

  const doc = {
    _id: fileId,
    gridId: String(gridId),
    fileName: String(fileName || 'file').slice(0, 240),
    mimeType,
    size: buffer.length,
    sha256,
    projectId,
    runId: String(meta.runId || ''),
    stageKey: String(meta.stageKey || ''),
    sourceType: String(sourceType || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedOn: new Date()
  };

  await db.collection(V3_DD_FILE_META).insertOne(doc);

  return {
    id: fileId,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    sha256: doc.sha256,
    sourceRef: sourceRefForFileId(fileId),
    deduped: false,
    projectId
  };
}

export async function getV3DdFileMeta(db, fileId) {
  return db.collection(V3_DD_FILE_META).findOne({ _id: String(fileId) });
}

export async function openV3DdFileStream(db, fileId) {
  const meta = await getV3DdFileMeta(db, fileId);
  if (!meta?.gridId) return null;
  const bucket = gfsBucket(db);
  try {
    const stream = bucket.openDownloadStream(new ObjectId(meta.gridId));
    return { meta, stream };
  } catch {
    return null;
  }
}

/** Intentionally no delete API — evidence is immutable (§4.9). */
