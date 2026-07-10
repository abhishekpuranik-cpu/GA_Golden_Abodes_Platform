/** Default editable CTC structure for Golden Abodes hiring offers. */

export const CTC_STORAGE_KEY = 'ga_hiring_ctc_structure_v1';

/**
 * Component modes:
 * - pct_of_ctc: value = annualCtc * (pct/100)
 * - pct_of_basic: value = basicAnnual * (pct/100)
 * - pct_of_fixed: value = fixedCashAnnual * (pct/100)
 * - fixed_annual: value = amount (₹/year)
 * - fixed_monthly: value = amount * 12
 * - balancing: residual so sum of included components = annual CTC (or fixed cash)
 */
export const DEFAULT_CTC_STRUCTURE = {
  version: 1,
  name: 'GA Standard CTC (editable)',
  notes: 'Subjective structure — edit % / amounts to match HR policy. Balancing line absorbs remainder.',
  inputMode: 'annual', // annual | monthly
  components: [
    { id: 'basic', label: 'Basic', mode: 'pct_of_ctc', pct: 40, amount: 0, includeInCtc: true, group: 'Fixed cash' },
    { id: 'hra', label: 'HRA', mode: 'pct_of_basic', pct: 40, amount: 0, includeInCtc: true, group: 'Fixed cash' },
    { id: 'special', label: 'Special allowance', mode: 'balancing', pct: 0, amount: 0, includeInCtc: true, group: 'Fixed cash' },
    { id: 'employer_pf', label: 'Employer PF', mode: 'pct_of_basic', pct: 12, amount: 0, includeInCtc: true, group: 'Statutory / benefits' },
    { id: 'gratuity', label: 'Gratuity provision', mode: 'pct_of_basic', pct: 4.81, amount: 0, includeInCtc: true, group: 'Statutory / benefits' },
    { id: 'insurance', label: 'Insurance', mode: 'fixed_monthly', pct: 0, amount: 500, includeInCtc: true, group: 'Statutory / benefits' },
    { id: 'variable', label: 'Variable / performance', mode: 'pct_of_ctc', pct: 10, amount: 0, includeInCtc: true, group: 'Variable' },
    { id: 'meal', label: 'Meal allowance', mode: 'fixed_monthly', pct: 0, amount: 0, includeInCtc: true, group: 'Allowances' },
    { id: 'other', label: 'Other allowance', mode: 'fixed_annual', pct: 0, amount: 0, includeInCtc: true, group: 'Allowances' }
  ]
};

export function loadCtcStructure() {
  try {
    const raw = localStorage.getItem(CTC_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CTC_STRUCTURE);
    const parsed = JSON.parse(raw);
    if (!parsed?.components?.length) return structuredClone(DEFAULT_CTC_STRUCTURE);
    return parsed;
  } catch {
    return structuredClone(DEFAULT_CTC_STRUCTURE);
  }
}

export function saveCtcStructure(structure) {
  localStorage.setItem(CTC_STORAGE_KEY, JSON.stringify(structure));
}

export function resetCtcStructure() {
  const s = structuredClone(DEFAULT_CTC_STRUCTURE);
  saveCtcStructure(s);
  return s;
}

function roundRupee(n) {
  return Math.round(Number(n) || 0);
}

/**
 * @param {number} annualCtcPaise - annual CTC in paise (₹ * 100)
 * @param {object} structure
 */
export function calculateCtc(annualCtcRupees, structure) {
  const annualCtc = Math.max(0, Number(annualCtcRupees) || 0);
  const comps = (structure?.components || []).map((c) => ({ ...c }));

  const basicComp = comps.find((c) => c.id === 'basic');
  let basicAnnual = 0;
  if (basicComp) {
    if (basicComp.mode === 'pct_of_ctc') basicAnnual = annualCtc * (Number(basicComp.pct) || 0) / 100;
    else if (basicComp.mode === 'fixed_annual') basicAnnual = Number(basicComp.amount) || 0;
    else if (basicComp.mode === 'fixed_monthly') basicAnnual = (Number(basicComp.amount) || 0) * 12;
  }

  // First pass: non-balancing
  const computed = {};
  let nonBalancingSum = 0;
  comps.forEach((c) => {
    if (c.mode === 'balancing' || !c.includeInCtc) return;
    let annual = 0;
    if (c.mode === 'pct_of_ctc') annual = annualCtc * (Number(c.pct) || 0) / 100;
    else if (c.mode === 'pct_of_basic') annual = basicAnnual * (Number(c.pct) || 0) / 100;
    else if (c.mode === 'fixed_annual') annual = Number(c.amount) || 0;
    else if (c.mode === 'fixed_monthly') annual = (Number(c.amount) || 0) * 12;
    else if (c.mode === 'pct_of_fixed') {
      // approximate: treat as pct of (ctc - variable-like); skip until fixed known — use ctc for now
      annual = annualCtc * (Number(c.pct) || 0) / 100;
    }
    annual = roundRupee(annual);
    computed[c.id] = annual;
    nonBalancingSum += annual;
  });

  // Balancing components share residual (usually one)
  const balancers = comps.filter((c) => c.mode === 'balancing' && c.includeInCtc);
  const residual = roundRupee(annualCtc - nonBalancingSum);
  if (balancers.length === 1) {
    computed[balancers[0].id] = Math.max(0, residual);
  } else if (balancers.length > 1) {
    const each = roundRupee(Math.max(0, residual) / balancers.length);
    balancers.forEach((b, i) => {
      computed[b.id] = i === balancers.length - 1
        ? Math.max(0, residual - each * (balancers.length - 1))
        : each;
    });
  }

  const rows = comps.map((c) => {
    const annual = c.includeInCtc ? (computed[c.id] ?? 0) : 0;
    return {
      ...c,
      annual,
      monthly: roundRupee(annual / 12)
    };
  });

  const totalAnnual = rows.filter((r) => r.includeInCtc).reduce((s, r) => s + r.annual, 0);
  const totalMonthly = roundRupee(totalAnnual / 12);
  const fixedCashIds = new Set(['basic', 'hra', 'special']);
  const fixedCashAnnual = rows
    .filter((r) => r.includeInCtc && (r.group === 'Fixed cash' || fixedCashIds.has(r.id)))
    .reduce((s, r) => s + r.annual, 0);

  return {
    annualCtc: roundRupee(annualCtc),
    monthlyCtc: totalMonthly,
    totalAnnual: roundRupee(totalAnnual),
    totalMonthly,
    basicAnnual: roundRupee(basicAnnual),
    fixedCashAnnual: roundRupee(fixedCashAnnual),
    variance: roundRupee(annualCtc - totalAnnual),
    rows
  };
}

export const MODE_OPTIONS = [
  { id: 'pct_of_ctc', label: '% of CTC' },
  { id: 'pct_of_basic', label: '% of Basic' },
  { id: 'fixed_annual', label: 'Fixed ₹/year' },
  { id: 'fixed_monthly', label: 'Fixed ₹/month' },
  { id: 'balancing', label: 'Balancing (residual)' }
];

export function formatInr(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(n) || 0);
}

export function newComponentId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
