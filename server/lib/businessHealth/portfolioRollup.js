import { KPI_DICTIONARY } from './kpiDictionary.js';

function num(v) {
  return Number(v) || 0;
}

function statusFromValue(id, value, prior) {
  if (id === 'billing_exceptions' || id === 'cross_app_exceptions') {
    if (value > 5) return 'red';
    if (value > 0) return 'amber';
    return 'green';
  }
  if (id === 'portfolio_health_score') {
    if (value >= 80) return 'green';
    if (value >= 55) return 'amber';
    return 'red';
  }
  if (id === 'collections_rate' || id === 'dm_recovery_pct') {
    if (value >= 70) return 'green';
    if (value >= 30) return 'amber';
    return 'red';
  }
  if (prior != null && value < prior * 0.9) return 'amber';
  return 'green';
}

/**
 * Build rolled-up KPI rows for portfolio dashboard.
 */
export function buildPortfolioKpis(dashboard, controlTower) {
  const s = dashboard?.summary || {};
  const billed = num(s.dmFeeBilledTtd);
  const paid = num(s.dmFeePaidTtd);
  const topline = num(s.totalTopline);
  const collections = num(s.totalCollections);
  const health = controlTower?.health?.portfolioScore ?? 0;

  const values = {
    portfolio_health_score: health,
    collections_rate: topline > 0 ? (collections / topline) * 100 : 0,
    dm_recovery_pct: billed > 0 ? (paid / billed) * 100 : 0,
    active_projects: s.activeProjects || 0,
    active_spvs: s.activeSpvs || 0,
    portfolio_topline: topline,
    portfolio_collections: collections,
    dm_billed: billed,
    dm_accrued: num(s.dmFeeAccrued),
    billing_exceptions: s.exceptionsPending || 0,
    cross_app_exceptions: controlTower?.crossApp?.deviationCount || 0,
    post_sales_pipeline: 0
  };

  return KPI_DICTIONARY.map((def) => {
    const value = values[def.id] ?? 0;
    return {
      id: def.id,
      pillar: def.pillar,
      label: def.label,
      formula: def.formula,
      value,
      priorPeriod: null,
      target: null,
      status: statusFromValue(def.id, value, null),
      sourceApp: def.sourceApps[0],
      asOf: controlTower?.scannedAt || new Date().toISOString(),
      href: def.drillDownHref,
      unit: def.unit
    };
  });
}
