import { MongoClient } from 'mongodb';
import { MONGODB_URI, DB_NAME } from './config.js';

const client = new MongoClient(MONGODB_URI);

let dbInstance = null;

export async function ensureMongo() {
  try {
    if (!dbInstance) {
      await client.connect();
      dbInstance = client.db(DB_NAME);
      console.log(`MongoDB connected (${DB_NAME})`);
      if (String(process.env.V1_AUTO_RESTORE_BEFORE || '').trim()) {
        import('./v1CashflowAutoRestore.js')
          .then(({ runV1AutoRestoreOnBoot }) => runV1AutoRestoreOnBoot(dbInstance))
          .catch((e) => console.error('[v1-auto-restore]', e?.message || e));
      }
    }
    return dbInstance;
  } catch (e) {
    dbInstance = null;
    console.error('MongoDB:', e?.message || String(e));
    return null;
  }
}

export function withDb(handler) {
  return async (req, res) => {
    const db = await ensureMongo();
    if (!db) {
      return res.status(503).json({
        error: 'MongoDB unavailable. Set MONGODB_URI (Atlas) or run local mongod, then retry.'
      });
    }
    return handler(req, res, db);
  };
}

export async function closeMongo() {
  try {
    await client.close();
  } catch {
    /* ignore */
  }
  dbInstance = null;
}
