import crypto from 'crypto';
import { GridFSBucket, ObjectId } from 'mongodb';

export const PRECON_FILES_BUCKET = 'precon_files';
export const MAX_UPLOAD_BYTES = Math.min(
  50,
  Math.max(5, Number(process.env.PRECON_MAX_UPLOAD_MB || 25))
) * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'application/pdf', 'text/'];
const ALLOWED_MIME_EXACT = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/octet-stream',
  // AutoCAD / drawing (browsers report these inconsistently)
  'image/vnd.dwg',
  'image/x-dwg',
  'application/acad',
  'application/x-acad',
  'application/autocad_dwg',
  'application/dwg',
  'application/x-dwg',
  'drawing/dwg',
  'image/vnd.dxf',
  'image/x-dxf',
  'application/dxf',
  'application/x-dxf',
  'drawing/x-dxf',
  'model/vnd.dwf',
  'application/x-dwf',
  'drawing/x-dwf'
]);

const CAD_EXT_RE = /\.(dwg|dxf|dwf)$/i;

export function isCadFileName(fileName) {
  return CAD_EXT_RE.test(String(fileName || ''));
}

export function attachmentKind(mimeType, fileName) {
  const m = String(mimeType || '').toLowerCase();
  if (isCadFileName(fileName) || /acad|dwg|dxf|dwf/i.test(m)) return 'drawing';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

export function isAllowedMime(mimeType, fileName) {
  if (isCadFileName(fileName)) return true;
  const m = String(mimeType || '').toLowerCase();
  if (!m) return false;
  if (ALLOWED_MIME_EXACT.has(m)) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => m.startsWith(p));
}

export function newAttachmentId() {
  return `att_${crypto.randomBytes(8).toString('hex')}`;
}

function gfsBucket(db) {
  return new GridFSBucket(db, { bucketName: PRECON_FILES_BUCKET });
}

/**
 * @param {import('mongodb').Db} db
 * @param {{ buffer: Buffer, fileName: string, mimeType: string, meta?: object }} file
 */
export async function storePreconFile(db, file) {
  const { buffer, fileName, mimeType, meta = {} } = file;
  if (!buffer?.length) throw new Error('Empty file');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`);
  }
  if (!isAllowedMime(mimeType, fileName)) throw new Error('File type not allowed');

  const bucket = gfsBucket(db);
  const gridId = new ObjectId();
  const attId = newAttachmentId();
  const kind = attachmentKind(mimeType, fileName);
  const contentType =
    isCadFileName(fileName) && (!mimeType || mimeType === 'application/octet-stream')
      ? 'application/acad'
      : mimeType;

  await new Promise((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(gridId, fileName, {
      contentType,
      metadata: { ...meta, attId }
    });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(buffer);
  });

  const doc = {
    _id: attId,
    gridId: String(gridId),
    fileName: String(fileName || 'file').slice(0, 240),
    mimeType: contentType,
    size: buffer.length,
    kind,
    projectId: meta.projectId || '',
    taskId: meta.taskId || '',
    scope: meta.scope || 'comment',
    phaseId: meta.phaseId || '',
    phaseName: meta.phaseName || '',
    projectPhase: meta.projectPhase || '',
    building: meta.building || '',
    drawingType: meta.drawingType || '',
    subDrawing: meta.subDrawing || '',
    seriesId: meta.seriesId || attId,
    version: Math.max(1, Number(meta.version) || 1),
    revision: meta.revision || '',
    status: meta.status || '',
    description: meta.description || '',
    label: String(meta.label || fileName || 'Attachment').slice(0, 200),
    uploadedBy: meta.uploadedBy || '',
    uploadedAt: new Date()
  };

  await db.collection('precon_attachments').insertOne(doc);
  return {
    id: attId,
    label: doc.label,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    kind: doc.kind,
    projectId: doc.projectId,
    phaseId: doc.phaseId,
    phaseName: doc.phaseName,
    projectPhase: doc.projectPhase,
    building: doc.building,
    drawingType: doc.drawingType,
    subDrawing: doc.subDrawing,
    seriesId: doc.seriesId,
    version: doc.version,
    revision: doc.revision,
    status: doc.status,
    description: doc.description,
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt,
    url: `/api/preconstruction/attachments/${attId}`
  };
}

export async function getAttachmentMeta(db, attId) {
  return db.collection('precon_attachments').findOne({ _id: String(attId) });
}

export async function openAttachmentStream(db, attId) {
  const meta = await getAttachmentMeta(db, attId);
  if (!meta?.gridId) return null;
  const bucket = gfsBucket(db);
  try {
    const stream = bucket.openDownloadStream(new ObjectId(meta.gridId));
    return { meta, stream };
  } catch {
    return null;
  }
}

export async function readAttachmentBuffer(db, attId) {
  const opened = await openAttachmentStream(db, attId);
  if (!opened) return null;
  const chunks = [];
  for await (const chunk of opened.stream) {
    chunks.push(chunk);
  }
  return { meta: opened.meta, buffer: Buffer.concat(chunks) };
}

export function toCommentAttachmentRef(metaRow, uploaded) {
  return {
    id: uploaded.id,
    label: uploaded.label,
    fileName: uploaded.fileName,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
    kind: uploaded.kind,
    url: uploaded.url
  };
}
