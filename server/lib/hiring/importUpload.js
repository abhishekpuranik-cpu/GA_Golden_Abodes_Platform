import multer from 'multer';

const ALLOWED = /\.(csv|xlsx)$/i;

export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED.test(file.originalname || ''));
  }
});
