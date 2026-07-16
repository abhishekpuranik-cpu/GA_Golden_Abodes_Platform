import crypto from 'crypto';
import { GridFSBucket, ObjectId } from 'mongodb';
import { attachmentKind } from '../preconAttachments.js';

/** Post Sales document vault accepts any file format (size limit still applies). */
export function isAllowedPostSalesMime(_mimeType) {
  return true;
}

export const POSTSALES_FILES_BUCKET = 'postsales_files';
export const MAX_UPLOAD_BYTES = Math.min(
  50,
  Math.max(5, Number(process.env.POSTSALES_MAX_UPLOAD_MB || process.env.PRECON_MAX_UPLOAD_MB || 25))
) * 1024 * 1024;

export function newFileId() {
  return `psf_${crypto.randomBytes(8).toString('hex')}`;
}

function gfsBucket(db) {
  return new GridFSBucket(db, { bucketName: POSTSALES_FILES_BUCKET });
}

/**
 * @param {import('mongodb').Db} db
 * @param {{ buffer: Buffer, fileName: string, mimeType: string, meta?: object }} file
 */
export async function storePostSalesFile(db, file) {
  const { buffer, fileName, mimeType, meta = {} } = file;
  if (!buffer?.length) throw new Error('Empty file');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`);
  }
  if (!isAllowedPostSalesMime(mimeType)) {
    throw new Error('File type not allowed');
  }

  const bucket = gfsBucket(db);
  const gridId = new ObjectId();
  const fileId = newFileId();

  await new Promise((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(gridId, fileName, {
      contentType: mimeType,
      metadata: { ...meta, fileId }
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
    kind: attachmentKind(mimeType),
    unitId: meta.unitId || '',
    docType: meta.docType || '',
    uploadedBy: meta.uploadedBy || '',
    uploadedAt: new Date()
  };

  await db.collection('postsales_file_meta').insertOne(doc);
  return {
    id: fileId,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    kind: doc.kind,
    url: `/api/postsales/documents/files/${fileId}`
  };
}

export async function getPostSalesFileMeta(db, fileId) {
  return db.collection('postsales_file_meta').findOne({ _id: String(fileId) });
}

export async function openPostSalesFileStream(db, fileId) {
  const meta = await getPostSalesFileMeta(db, fileId);
  if (!meta?.gridId) return null;
  const bucket = gfsBucket(db);
  try {
    const stream = bucket.openDownloadStream(new ObjectId(meta.gridId));
    return { meta, stream };
  } catch {
    return null;
  }
}
