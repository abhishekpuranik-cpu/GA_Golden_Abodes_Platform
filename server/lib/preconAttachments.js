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
  'application/octet-stream'
]);

export function attachmentKind(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

export function isAllowedMime(mimeType) {
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
  if (!isAllowedMime(mimeType)) throw new Error('File type not allowed');

  const bucket = gfsBucket(db);
  const gridId = new ObjectId();
  const attId = newAttachmentId();

  await new Promise((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(gridId, fileName, {
      contentType: mimeType,
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
    mimeType,
    size: buffer.length,
    kind: attachmentKind(mimeType),
    projectId: meta.projectId || '',
    taskId: meta.taskId || '',
    scope: meta.scope || 'comment',
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
