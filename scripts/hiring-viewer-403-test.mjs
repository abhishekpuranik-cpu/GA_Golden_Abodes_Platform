import { canWriteHiring } from '../server/lib/hiring/access.js';

const viewer = { roleIds: ['viewer', 'hiring'], allowedApps: ['hiring'] };
const manager = { roleIds: ['hiring_manager'], allowedApps: ['hiring'] };

let failed = false;

if (canWriteHiring(viewer)) {
  console.error('FAIL: viewer with hiring app should not have write access');
  failed = true;
} else {
  console.log('PASS: viewer blocked from hiring write');
}

if (!canWriteHiring(manager)) {
  console.error('FAIL: hiring_manager should have write access');
  failed = true;
} else {
  console.log('PASS: hiring_manager allowed to write');
}

process.exit(failed ? 1 : 0);
