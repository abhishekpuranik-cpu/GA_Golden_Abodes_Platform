/** Default hybrid billing slabs (collection-linked cumulative DM %). */
export const DEFAULT_BILLING_SLABS = [
  { fromPct: 0, toPct: 10, cumulativeDmPct: 0, label: 'Pre-revenue / retainer only' },
  { fromPct: 10, toPct: 30, cumulativeDmPct: 3.5, label: 'Early collections' },
  { fromPct: 30, toPct: 60, cumulativeDmPct: 6.5, label: 'Growth' },
  { fromPct: 60, toPct: 90, cumulativeDmPct: 8.5, label: 'Mature' },
  { fromPct: 90, toPct: 100, cumulativeDmPct: 10, label: 'Completion' }
];

export const REVENUE_STATUSES = ['pre_revenue', 'launched', 'collection_active', 'mature', 'completion'];
export const BILLING_MODEL_TYPES = ['HYBRID_GA', 'RETAINER_SUCCESS', 'COST_PLUS', 'MILESTONE', 'CUSTOM'];
export const ELIGIBLE_BASE_TYPES = ['topline_gdv', 'agreement_value', 'collections_ttd'];
