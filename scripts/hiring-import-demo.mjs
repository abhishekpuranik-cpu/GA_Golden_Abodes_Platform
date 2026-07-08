import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const base = 'http://127.0.0.1:3020/api/hiring';

async function multipart(pathToFile, fields) {
  const buf = fs.readFileSync(pathToFile);
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([buf], { type: 'text/csv' }), path.basename(pathToFile));
  const res = await fetch(`${base}/candidates/import/preview`, { method: 'POST', body: form });
  return res.json();
}

async function main() {
  const reqs = await (await fetch(`${base}/requisitions?limit=5`)).json();
  const req = reqs.requisitions.find((r) => r.reqCode === 'GA-REQ-002') || reqs.requisitions[0];
  if (!req) throw new Error('No requisition');

  const csvPath = path.join(root, 'server/fixtures/hiring/naukri-sample-10.csv');
  const preview = await multipart(csvPath, {
    requisitionId: req._id,
    entityTag: req.entityTag,
    channel: 'naukri'
  });
  console.log('Preview:', JSON.stringify(preview, null, 2));

  if (!preview.errors?.some((e) => e.reason.includes('Unparseable'))) {
    console.error('Expected parse error for invalid CTC row');
    process.exit(1);
  }
  console.log('PASS: invalid CTC row detected');

  const goodCsv = path.join(root, 'server/fixtures/hiring/naukri-sample-good.csv');
  if (fs.existsSync(goodCsv)) {
    const form = new FormData();
    form.append('requisitionId', req._id);
    form.append('entityTag', req.entityTag);
    form.append('channel', 'naukri');
    form.append('file', new Blob([fs.readFileSync(goodCsv)]), 'naukri-sample-good.csv');
    const imp = await fetch(`${base}/candidates/import`, { method: 'POST', body: form });
    const body = await imp.json();
    console.log('Import:', JSON.stringify(body, null, 2));
    if (!body.imported) {
      console.error('Expected some imports');
      process.exit(1);
    }
    console.log('PASS: import succeeded');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
