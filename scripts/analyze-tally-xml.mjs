import fs from 'fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node analyze-tally-xml.mjs <file.xml> ...');
  process.exit(1);
}

function analyze(path) {
  if (!fs.existsSync(path)) return { file: path, error: 'not found' };
  const st = fs.statSync(path);
  if (!st.size) return { file: path, error: 'empty file (0 bytes)' };
  const buf = fs.readFileSync(path);
  let xml;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) xml = buf.toString('utf16le');
  else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) xml = buf.toString('utf16be');
  else xml = buf.toString('utf8');
  const vouchers = (xml.match(/<VOUCHER\b/gi) || []).length;
  const dsp = (xml.match(/<DSPDISPNAME>/gi) || []).length;
  const payments = (xml.match(/VCHTYPE="Payment"/gi) || []).length;
  const receipts = (xml.match(/VCHTYPE="Receipt"/gi) || []).length;
  const dates = [...xml.matchAll(/<DATE>(\d{8})<\/DATE>/g)].map((m) => m[1]).sort();
  const ledgers = [...xml.matchAll(/<LEDGERNAME>([^<]+)<\/LEDGERNAME>/g)].map((m) => m[1].trim());
  const cc = [...xml.matchAll(/<COSTCENTREALLOCATIONS\.LIST>[\s\S]*?<NAME>([^<]+)<\/NAME>/g)].map((m) => m[1].trim());
  const bankish = ledgers.filter((l) => /bank|cash|icici|hdfc|axis/i.test(l));
  return {
    file: path,
    bytes: st.size,
    format: vouchers ? 'voucher-xml' : dsp ? 'cashflow-statement' : 'unknown',
    vouchers,
    dspLines: dsp,
    vchPayment: payments,
    vchReceipt: receipts,
    dateMin: dates[0] || null,
    dateMax: dates[dates.length - 1] || null,
    ledgerLines: ledgers.length,
    uniqueLedgers: new Set(ledgers).size,
    costCentreTaggedLines: cc.length,
    uniqueCostCentres: [...new Set(cc)],
    bankCashLedgerHits: [...new Set(bankish)].slice(0, 10),
    sampleLedgers: [...new Set(ledgers)].filter((l) => !/bank|cash|icici/i.test(l)).slice(0, 20),
  };
}

for (const f of files) console.log(JSON.stringify(analyze(f), null, 2));
