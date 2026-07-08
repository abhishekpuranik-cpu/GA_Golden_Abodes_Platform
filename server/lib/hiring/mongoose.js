import { ensurePostSalesMongoose } from '../postsales/mongoose.js';

export const ensureHiringMongoose = ensurePostSalesMongoose;

export function hiringReady(req, res, next) {
  ensureHiringMongoose()
    .then(() => next())
    .catch((err) => {
      console.error('[hiring] Mongo connection failed:', err.message);
      res.status(503).json({ error: 'Hiring database unavailable' });
    });
}
