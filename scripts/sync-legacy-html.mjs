/**
 * Copy vault-linked HTML tools from API_Tool into client/public/legacy
 * so cloud deploys can serve /legacy/* without local disk dependencies.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.join(__dirname, '..');
const apiTool = process.env.API_TOOL_PATH
  ? path.resolve(process.env.API_TOOL_PATH)
  : path.join(platformRoot, '..', '..', 'API_Tool');
const outDir = path.join(platformRoot, 'client', 'public', 'legacy');

const files = [
  'GA_Cashflow_V1.html',
  'ga_sales_dashboard.html',
  'GA_MarketingSales_KPI_Dashboard.html',
  'Golden_Abodes_App_Vault.html',
];

fs.mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const f of files) {
  const src = path.join(apiTool, f);
  const dst = path.join(outDir, f);
  if (!fs.existsSync(src)) {
    console.warn(`sync-legacy-html: missing ${src}`);
    continue;
  }
  fs.copyFileSync(src, dst);
  copied += 1;
  console.log(`sync-legacy-html: copied ${f}`);
}

if (!copied) {
  console.warn('sync-legacy-html: no legacy files copied. Check API_TOOL_PATH or API_Tool folder.');
}
