import { APP_IDS } from '../appRegistry.js';

/** In-platform React modules — same deployment as the vault (no external URL). */
export const VAULT_PLATFORM_APPS = [
  {
    appId: APP_IDS.POST_SALES,
    path: '/app/post-sales',
    badge: 'CRM · React',
    badgeColor: '#60a5fa',
    title: 'Post Sales Operations',
    description:
      '20-step post-booking pipeline — booking handoff, agreement, CLP demands, possession, CHS formation, and defects liability across all GA projects.',
    featured: true
  },
  {
    appId: APP_IDS.DM_SPV_GOVERNANCE,
    path: '/app/dm-governance',
    badge: 'Governance · React',
    badgeColor: '#0d9488',
    title: 'DM–SPV Governance',
    description: 'Billing control tower, SPV master, invoices, compliance, risks, and executive analytics for development management.',
    featured: false
  }
];

export function canOpenVaultApp(appId, allowedAppsSet, { authenticated = false } = {}) {
  if (allowedAppsSet.has(appId)) return true;
  if (appId === APP_IDS.POST_SALES && authenticated) return true;
  if (appId === APP_IDS.POST_SALES && allowedAppsSet.has('sales_dashboard')) return true;
  return false;
}
