/**
 * Ask AI Phase-1 eval harness — fixture Q&A against domain engines.
 * Run: node scripts/ask-ai-eval.mjs
 */
import { answerAskDomain } from '../server/lib/askAi/router.js';

const cases = [
  {
    name: 'cashflow-payment-risk',
    appId: 'v1_cashflow',
    question: 'Which projects have payment collection issues?',
    context: {
      totals: {
        projects: 3,
        unitsSold: 100,
        unsoldUnits: 40,
        collectionsTtd: 2500000,
        paymentIssueUnits: 9,
        agreementPendingUnits: 4,
      },
      hotItems: [
        { title: 'Paradise', detail: 'sold 80, unsold 20, pay issues 4', status: 'payment_risk', risk: 12 },
        { title: 'Heights', detail: 'sold 15, unsold 10, agreement pending 3', status: 'agreement_pending', risk: 7 },
        { title: 'Orchid', detail: 'sold 5, unsold 10, pay issues 1', status: 'payment_risk', risk: 5 },
      ],
    },
    expect: {
      headlineIncludes: ['Paradise', 'payment'],
      directIncludes: ['Paradise', 'payment-issue'],
      confidence: ['high', 'medium'],
    },
  },
  {
    name: 'cashflow-count-sold',
    appId: 'v1_cashflow',
    question: 'How many sold units are there?',
    context: {
      totals: { projects: 2, unitsSold: 100, unsoldUnits: 40, collectionsTtd: 1, paymentIssueUnits: 0, agreementPendingUnits: 0 },
      hotItems: [{ title: 'Paradise', detail: 'sold 80', risk: 1 }],
    },
    expect: {
      headlineIncludes: ['100'],
      directIncludes: ['100', 'sold'],
      confidence: ['high'],
    },
  },
  {
    name: 'hiring-open-count',
    appId: 'hiring',
    question: 'How many open requisitions are there?',
    context: {
      totals: { openRequisitions: 5, fillRate: 40, activeCandidates: 12, byStatus: { open: 5, interview: 2 } },
      hotItems: [
        { title: 'Site Engineer', status: 'open', detail: 'Pune' },
        { title: 'Accountant', status: 'interview', detail: 'HQ' },
      ],
    },
    expect: {
      headlineIncludes: ['5'],
      directIncludes: ['5', 'open'],
      confidence: ['high'],
    },
  },
  {
    name: 'hiring-stuck',
    appId: 'hiring',
    question: 'Where is the hiring funnel bottleneck?',
    context: {
      totals: { openRequisitions: 3, fillRate: 20, activeCandidates: 2, upcomingInterviews: 1 },
      hotItems: [
        { title: 'Accounts Manager', status: 'sourcing', detail: 'stuck sourcing', risk: 9 },
        { title: 'Site Engineer', status: 'open', detail: 'no candidates', risk: 8 },
      ],
      funnelByRequisition: [{ role: 'Accounts Manager', status: 'sourcing', activeCandidates: 0 }],
    },
    expect: {
      headlineIncludes: ['Accounts', 'Bottleneck', 'Open'],
      directIncludes: ['Accounts Manager'],
      confidence: ['high'],
    },
  },
  {
    name: 'postsales-sla',
    appId: 'post_sales',
    question: 'Which units have SLA breaches?',
    context: {
      totals: { slaBreaches: 4, openTickets: 6, totalOutstanding: 1200000, collectPct: 62 },
      hotItems: [
        { title: 'A-101', detail: 'SLA breach · Registration', status: 'sla_breach', risk: 10 },
        { title: 'B-204', detail: 'SLA breach · Demand', status: 'sla_breach', risk: 9 },
      ],
    },
    expect: {
      headlineIncludes: ['4', 'SLA'],
      directIncludes: ['A-101', '4'],
      confidence: ['high'],
    },
  },
  {
    name: 'finance-overdue',
    appId: 'finance_kpi',
    question: 'What compliance items are overdue?',
    context: {
      totals: { overdueCompliance: 3, dueNext14: 2, openRaBills: 1 },
      hotItems: [
        { title: 'GSTR-3B Jan', detail: 'OVERDUE · due 2026-02-20', status: 'overdue', risk: 10 },
        { title: 'TDS Q3', detail: 'OVERDUE · due 2026-01-31', status: 'overdue', risk: 10 },
      ],
    },
    expect: {
      headlineIncludes: ['3'],
      directIncludes: ['GSTR', '3'],
      confidence: ['high'],
    },
  },
  {
    name: 'marketing-leads',
    appId: 'marketing_kpi',
    question: 'How many leads do we have?',
    context: {
      totals: { leads: 120, byStatus: { 'New Lead': 40, Negotiation: 20 }, bySource: { Meta: 50, Google: 30 } },
      hotItems: [{ title: 'Lead 11', detail: 'New Lead · Ravi', status: 'New Lead' }],
    },
    expect: {
      headlineIncludes: ['120'],
      directIncludes: ['120'],
      confidence: ['high'],
    },
  },
  {
    name: 'thin-context-honest',
    appId: 'v1_cashflow',
    question: 'What is cash pressure?',
    context: { totals: { keysLoaded: 1 }, hotItems: [{ title: 'ga_cf_v1', detail: 'localStorage snapshot' }] },
    expect: {
      insufficientData: true,
      confidence: ['low'],
    },
  },
];

function includesAny(text, needles) {
  const t = String(text || '').toLowerCase();
  return (needles || []).some((n) => t.includes(String(n).toLowerCase()));
}

let failed = 0;
for (const c of cases) {
  const ans = answerAskDomain(c.appId, c.question, c.context);
  const direct = ans.sections?.find((s) => /direct/i.test(s.title || ''))?.narrative || ans.markdown || '';
  const errs = [];
  if (c.expect.headlineIncludes && !includesAny(ans.headline, c.expect.headlineIncludes)) {
    errs.push(`headline missing one of ${JSON.stringify(c.expect.headlineIncludes)} (got: ${ans.headline})`);
  }
  if (c.expect.directIncludes && !includesAny(direct, c.expect.directIncludes)) {
    errs.push(`direct missing one of ${JSON.stringify(c.expect.directIncludes)} (got: ${direct.slice(0, 160)})`);
  }
  if (c.expect.confidence && !c.expect.confidence.includes(ans.confidence)) {
    errs.push(`confidence ${ans.confidence} not in ${JSON.stringify(c.expect.confidence)}`);
  }
  if (c.expect.insufficientData && !ans.insufficientData) {
    errs.push('expected insufficientData=true');
  }
  if (errs.length) {
    failed += 1;
    console.error(`FAIL ${c.name}`);
    errs.forEach((e) => console.error('  -', e));
  } else {
    console.log(`PASS ${c.name} · ${ans.confidence} · ${ans.headline}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${cases.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} Ask AI eval cases passed.`);
