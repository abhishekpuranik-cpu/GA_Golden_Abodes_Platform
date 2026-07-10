import fs from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node analyze-bill-alloc.mjs <file.xml>');
  process.exit(1);
}

const buf = fs.readFileSync(path);
let xml;
if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) xml = buf.toString('utf16le');
else xml = buf.toString('utf8');

const billBlocks = [...xml.matchAll(/<BILLALLOCATIONS\.LIST>([\s\S]*?)<\/BILLALLOCATIONS\.LIST>/gi)];
let withContent = 0;
let empty = 0;
const types = {};
const samples = [];

for (const m of billBlocks) {
  const inner = m[1].trim();
  if (!inner || !/<NAME>/i.test(inner)) {
    empty += 1;
    continue;
  }
  withContent += 1;
  const bt = (inner.match(/<BILLTYPE>([^<]*)<\/BILLTYPE>/i) || [])[1] || '(none)';
  types[bt] = (types[bt] || 0) + 1;
  if (samples.length < 8) {
    samples.push({
      billType: bt,
      name: (inner.match(/<NAME>([^<]*)<\/NAME>/i) || [])[1],
      amount: (inner.match(/<AMOUNT>([^<]*)<\/AMOUNT>/i) || [])[1],
    });
  }
}

console.log(
  JSON.stringify(
    {
      file: path,
      billBlocks: billBlocks.length,
      withContent,
      empty,
      billTypes: types,
      samples,
      voucherTypes: {
        Payment: (xml.match(/VCHTYPE="Payment"/gi) || []).length,
        Purchase: (xml.match(/VCHTYPE="Purchase"/gi) || []).length,
        Journal: (xml.match(/VCHTYPE="Journal"/gi) || []).length,
        Receipt: (xml.match(/VCHTYPE="Receipt"/gi) || []).length,
      },
    },
    null,
    2,
  ),
);
