import Unit from '../../models/postsales/Unit.js';
import { ensurePostSalesMongoose } from './mongoose.js';
import { seedPostSalesData } from '../../seeds/postsales.js';

export async function seedPostSalesIfEmpty() {
  try {
    await ensurePostSalesMongoose();
    const count = await Unit.countDocuments();
    if (count > 0) return { seeded: false, count };
    await seedPostSalesData();
    const after = await Unit.countDocuments();
    console.log(`[Post Sales] Dev seed loaded (${after} units)`);
    return { seeded: true, count: after };
  } catch (err) {
    console.warn('[Post Sales] Seed skipped:', err.message);
    return { seeded: false, error: err.message };
  }
}
