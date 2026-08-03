import mongoose from 'mongoose';
import { ensurePostSalesMongoose } from '../postsales/mongoose.js';

export const ensureAdminServicesMongoose = ensurePostSalesMongoose;

export function adminServicesReady(req, res, next) {
  ensureAdminServicesMongoose()
    .then(() => next())
    .catch((err) => {
      console.error('[admin-services] Mongo connection failed:', err.message);
      res.status(503).json({ error: 'Admin Services database unavailable' });
    });
}

export function softDeleteFields() {
  return {
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null }
  };
}

export function auditUserFields() {
  return {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null }
  };
}

export function notDeletedFilter(extra = {}) {
  return { isDeleted: { $ne: true }, ...extra };
}
