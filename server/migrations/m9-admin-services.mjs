/**
 * M9 Admin Services migration CLI.
 * Usage:
 *   node server/migrations/m9-admin-services.mjs up
 *   node server/migrations/m9-admin-services.mjs down --dry-run
 *   node server/migrations/m9-admin-services.mjs down --execute
 */
import '../lib/loadEnv.js';
import { migrateAdminServicesUp, migrateAdminServicesDown } from '../lib/adminServices/migrate.js';

const cmd = process.argv[2] || 'up';

async function main() {
  if (cmd === 'up') {
    const result = await migrateAdminServicesUp();
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (cmd === 'down') {
    const execute = process.argv.includes('--execute');
    const result = await migrateAdminServicesDown({ dryRun: !execute });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.error('Usage: node server/migrations/m9-admin-services.mjs [up|down] [--dry-run|--execute]');
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
