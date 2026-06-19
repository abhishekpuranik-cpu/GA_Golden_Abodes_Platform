import { ensurePostSalesMongoose } from '../lib/postsales/mongoose.js';
import { ensureMongo } from '../lib/mongo.js';
import { purgeAndDisableAutoSync } from '../lib/postsales/purgeUnitData.js';
import { fileURLToPath } from 'url';

async function main() {
  await ensurePostSalesMongoose();
  const db = await ensureMongo();
  const result = await purgeAndDisableAutoSync(db);
  console.log('Post Sales unit data purged:', JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { main as purgePostSalesUnits };
