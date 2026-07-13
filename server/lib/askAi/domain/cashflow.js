import { findProjects, packAnswer, qn } from './_shared.js';

/**
 * Cashflow V1 domain engine — answers from portfolio totals + per-project evidence.
 */
export function answerCashflow(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const projects = findProjects(context, question);
  const all = [].concat(context?.hotItems || [], context?.projects || []);

  const paymentRisk = all
    .filter((p) => /payment_risk|pay issues|pay issue/i.test(`${p.status || ''} ${p.detail || ''}`) || (p.risk || 0) >= 6)
    .sort((a, b) => (b.risk || 0) - (a.risk || 0));
  const agreement = all.filter((p) => /agreement/i.test(`${p.status || ''} ${p.detail || ''}`));
  const unsoldHeavy = all.filter((p) => {
    const m = String(p.detail || '').match(/unsold\s+(\d+)/i);
    const sold = String(p.detail || '').match(/sold\s+(\d+)/i);
    if (!m) return false;
    return Number(m[1]) > (sold ? Number(sold[1]) : 0);
  });

  // Named project drill-down
  const named = projects.length && projects.length < all.length ? projects : null;
  if (named && named.length === 1 && !/\b(all|portfolio|across)\b/.test(q)) {
    const p = named[0];
    return packAnswer({
      appId: 'v1_cashflow',
      question,
      intent: 'diagnostic',
      headline: `${p.title || p.name}: ${p.status || 'see detail'}`,
      direct: `**Direct answer:** For **${p.title || p.name}** — ${p.detail || 'no detail row'}. Portfolio reference: ${T.unitsSold || 0} sold units, ₹${Math.round(T.collectionsTtd || 0)} collected TTD, ${T.paymentIssueUnits || 0} payment-issue units, ${T.agreementPendingUnits || 0} agreement-pending.`,
      evidence: [p],
      metrics: {
        unitsSold: T.unitsSold || 0,
        unsoldUnits: T.unsoldUnits || 0,
        collectionsTtd: T.collectionsTtd || 0,
        paymentIssueUnits: T.paymentIssueUnits || 0,
        agreementPendingUnits: T.agreementPendingUnits || 0,
      },
      actions: [`Open Cashflow for ${p.title || p.name}`, 'Clear payment / agreement blockers on flagged units', 'Re-ask for portfolio rollup if needed'],
      predictive: 'Unresolved payment/agreement flags on this project will keep collections and cash planning unreliable.',
      confidence: p.detail ? 'high' : 'medium',
      insufficientData: !p.detail && !T.projects,
    });
  }

  if (/\b(payment|pay issue|collection|collect|outstanding|receivable)\b/.test(q)) {
    const top = paymentRisk.slice(0, 8);
    return packAnswer({
      appId: 'v1_cashflow',
      question,
      intent: 'diagnostic',
      headline:
        top.length > 0
          ? `${T.paymentIssueUnits || 0} payment-issue units · worst: ${top[0].title}`
          : `Collections TTD ₹${Math.round(T.collectionsTtd || 0)} · ${T.paymentIssueUnits || 0} pay-issue units`,
      direct: top.length
        ? `**Direct answer:** Collection / payment pressure is highest on **${top.map((p) => p.title).slice(0, 3).join(', ')}**. Portfolio: **${T.paymentIssueUnits || 0}** payment-issue units, **${T.agreementPendingUnits || 0}** agreement-pending, collections TTD **₹${Math.round(T.collectionsTtd || 0)}** across **${T.projects || 0}** projects.`
        : `**Direct answer:** From live Cashflow totals — collections TTD **₹${Math.round(T.collectionsTtd || 0)}**, payment-issue units **${T.paymentIssueUnits || 0}**, agreement-pending **${T.agreementPendingUnits || 0}**. No project-level risk rows were present in context.`,
      evidence: top.length ? top : all.slice(0, 5),
      metrics: {
        collectionsTtd: T.collectionsTtd || 0,
        paymentIssueUnits: T.paymentIssueUnits || 0,
        agreementPendingUnits: T.agreementPendingUnits || 0,
        unitsSold: T.unitsSold || 0,
        projects: T.projects || 0,
      },
      actions: [
        'Start collection huddle on the top payment-risk project',
        'Clear agreement-pending units blocking receipts',
        'Re-ask naming a project for unit-level detail',
      ],
      predictive: 'Payment-issue and agreement-pending units are the near-term drag on cash inflow if left uncleared.',
      confidence: top.length || T.collectionsTtd ? 'high' : 'low',
      insufficientData: !T.projects && !top.length,
    });
  }

  if (/\b(agreement|registry|sale deed)\b/.test(q)) {
    return packAnswer({
      appId: 'v1_cashflow',
      question,
      intent: 'diagnostic',
      headline: `${T.agreementPendingUnits || 0} agreement-pending units`,
      direct: `**Direct answer:** **${T.agreementPendingUnits || 0}** units are agreement-pending across the portfolio. Projects flagged: ${
        (agreement.length ? agreement : all).slice(0, 5).map((p) => p.title).join(', ') || 'none listed'
      }.`,
      evidence: (agreement.length ? agreement : all).slice(0, 8),
      metrics: {
        agreementPendingUnits: T.agreementPendingUnits || 0,
        paymentIssueUnits: T.paymentIssueUnits || 0,
        unitsSold: T.unitsSold || 0,
      },
      actions: ['Prioritize agreement closure on the listed projects', 'Track pending ₹ exposure in Cashflow unit board'],
      confidence: 'high',
    });
  }

  if (/\b(unsold|inventory|stock)\b/.test(q)) {
    return packAnswer({
      appId: 'v1_cashflow',
      question,
      intent: 'informative',
      headline: `${T.unsoldUnits || 0} unsold vs ${T.unitsSold || 0} sold`,
      direct: `**Direct answer:** Portfolio has **${T.unsoldUnits || 0}** unsold units and **${T.unitsSold || 0}** sold. Heavier unsold pressure: ${
        (unsoldHeavy.length ? unsoldHeavy : all).slice(0, 5).map((p) => p.title).join(', ') || 'n/a'
      }.`,
      evidence: (unsoldHeavy.length ? unsoldHeavy : all).slice(0, 8),
      metrics: { unsoldUnits: T.unsoldUnits || 0, unitsSold: T.unitsSold || 0, projects: T.projects || 0 },
      actions: ['Focus sales velocity on high-unsold projects', 'Align Cashflow unsold pace with Marketing/Sales'],
      confidence: T.unsoldUnits != null ? 'high' : 'low',
      insufficientData: T.unsoldUnits == null && !all.length,
    });
  }

  if (/\b(how many|count|total|number of)\b/.test(q)) {
    if (/\bunsold\b/.test(q)) {
      return packAnswer({
        appId: 'v1_cashflow',
        question,
        intent: 'count',
        headline: `unsoldUnits: ${T.unsoldUnits || 0}`,
        direct: `**Direct answer:** **${T.unsoldUnits || 0}** unsold units in the live Cashflow snapshot.`,
        metrics: { unsoldUnits: T.unsoldUnits || 0, unitsSold: T.unitsSold || 0 },
        evidence: all.slice(0, 5),
        confidence: 'high',
      });
    }
    if (/\bsold\b/.test(q)) {
      return packAnswer({
        appId: 'v1_cashflow',
        question,
        intent: 'count',
        headline: `unitsSold: ${T.unitsSold || 0}`,
        direct: `**Direct answer:** **${T.unitsSold || 0}** sold units in the live Cashflow snapshot.`,
        metrics: { unitsSold: T.unitsSold || 0, unsoldUnits: T.unsoldUnits || 0 },
        confidence: 'high',
      });
    }
    if (/\bproject\b/.test(q)) {
      return packAnswer({
        appId: 'v1_cashflow',
        question,
        intent: 'count',
        headline: `projects: ${T.projects || 0}`,
        direct: `**Direct answer:** **${T.projects || all.length || 0}** projects in the Cashflow portfolio context.`,
        metrics: { projects: T.projects || all.length || 0 },
        evidence: all.slice(0, 8),
        confidence: 'high',
      });
    }
  }

  // Default portfolio pressure answer — still concrete, not a template
  const top = all.slice(0, 5);
  return packAnswer({
    appId: 'v1_cashflow',
    question,
    intent: 'general',
    headline: top[0]
      ? `${T.projects || 0} projects · focus ${top[0].title}`
      : `Cashflow · ${T.projects || 0} projects`,
    direct: `**Direct answer:** Live Cashflow shows **${T.projects || 0}** projects, **${T.unitsSold || 0}** sold / **${T.unsoldUnits || 0}** unsold, collections TTD **₹${Math.round(T.collectionsTtd || 0)}**, **${T.paymentIssueUnits || 0}** payment-issue units, **${T.agreementPendingUnits || 0}** agreement-pending. Highest-pressure project rows: ${
      top.map((p) => p.title).join(', ') || 'none loaded'
    }.`,
    evidence: top,
    metrics: {
      projects: T.projects || 0,
      unitsSold: T.unitsSold || 0,
      unsoldUnits: T.unsoldUnits || 0,
      collectionsTtd: T.collectionsTtd || 0,
      paymentIssueUnits: T.paymentIssueUnits || 0,
      agreementPendingUnits: T.agreementPendingUnits || 0,
    },
    actions: [
      'Ask specifically about collections, unsold, or a project name for a tighter answer',
      'Clear top payment-risk project first',
    ],
    predictive: 'Without clearing payment/agreement flags, near-term cash forecasts will stay soft.',
    confidence: T.projects || top.length ? 'medium' : 'low',
    insufficientData: !T.projects && !top.length,
  });
}
