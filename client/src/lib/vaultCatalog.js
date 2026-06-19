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
    title: 'Business Health Command Center',
    description: 'Portfolio health hub — 6 pillars, cross-app exceptions, KPI rollups, and DM billing governance.',
    featured: false
  }
];

export function canOpenVaultApp(appId, allowedAppsSet) {
  return allowedAppsSet.has(appId);
}
