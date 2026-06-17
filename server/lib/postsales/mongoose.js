import mongoose from 'mongoose';
import { MONGODB_URI, DB_NAME } from '../config.js';

let ready = null;

export async function ensurePostSalesMongoose() {
  if (ready) return ready;
  ready = mongoose.connect(MONGODB_URI, { dbName: DB_NAME }).then(() => mongoose.connection);
  return ready;
}

export function postSalesReady(req, res, next) {
  ensurePostSalesMongoose()
    .then(() => next())
    .catch((err) => {
      console.error('[postsales] Mongo connection failed:', err.message);
      res.status(503).json({ error: 'Post-sales database unavailable' });
    });
}
