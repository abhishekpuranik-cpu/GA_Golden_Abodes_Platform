import multer from 'multer';

const ALLOWED = /\.(pdf|doc|docx|eml|msg|txt|html|htm|png|jpg|jpeg)$/i;

export const reqAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED.test(file.originalname || ''));
  }
});
