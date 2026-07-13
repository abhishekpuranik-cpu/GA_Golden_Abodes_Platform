import { packAnswer, qn } from './_shared.js';

export function answerFinance(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const items = context?.hotItems || [];
  const overdue = items.filter((it) => /overdue/i.test(`${it.status || ''} ${it.detail || ''}`));
  const dueSoon = items.filter((it) => /due_soon|due /i.test(`${it.status || ''} ${it.detail || ''}`));
  const ra = items.filter((it) => /ra_open|ra bill/i.test(`${it.status || ''} ${it.detail || ''}`));

  if (/\b(overdue|compliance|filing|statutory)\b/.test(q)) {
    return packAnswer({
      appId: 'finance_kpi',
      question,
      intent: 'diagnostic',
      headline: `${T.overdueCompliance ?? overdue.length} overdue filings`,
      direct: `**Direct answer:** **${T.overdueCompliance ?? overdue.length}** overdue compliance filing(s); **${T.dueNext14 ?? dueSoon.length}** due in next 14 days. Overdue: ${
        (overdue.length ? overdue : items).slice(0, 5).map((e) => e.title).join(', ') || 'none'
      }.`,
      evidence: (overdue.length ? overdue : items).slice(0, 12),
      metrics: {
        overdueCompliance: T.overdueCompliance ?? overdue.length,
        dueNext14: T.dueNext14 ?? dueSoon.length,
        openRaBills: T.openRaBills ?? ra.length,
        complianceRows: T.complianceRows || 0,
      },
      actions: ['File overdue statutory items today', 'Prep packs for next-14-day dues'],
      predictive: 'Overdue filings create compounding statutory and lender-covenant risk.',
      confidence: 'high',
      insufficientData: T.overdueCompliance == null && !items.length,
    });
  }

  if (/\b(ra|bill|vendor|payable)\b/.test(q)) {
    return packAnswer({
      appId: 'finance_kpi',
      question,
      intent: 'diagnostic',
      headline: `${T.openRaBills ?? ra.length} open RA bills`,
      direct: `**Direct answer:** **${T.openRaBills ?? ra.length}** open RA bills awaiting payment release. ${
        (ra.length ? ra : items).slice(0, 5).map((e) => e.title).join(', ') || ''
      }`,
      evidence: (ra.length ? ra : items).slice(0, 10),
      metrics: { openRaBills: T.openRaBills ?? ra.length, overdueCompliance: T.overdueCompliance || 0 },
      actions: ['Release or reject aged RA bills', 'Confirm vendor payment calendar'],
      confidence: 'high',
    });
  }

  return packAnswer({
    appId: 'finance_kpi',
    question,
    intent: 'general',
    headline: `${T.overdueCompliance || 0} overdue · ${T.dueNext14 || 0} due soon · ${T.openRaBills || 0} RA open`,
    direct: `**Direct answer:** Finance KPI live — overdue filings **${T.overdueCompliance || 0}**, due next 14 days **${T.dueNext14 || 0}**, open RA bills **${T.openRaBills || 0}**, active employees **${T.employees || 0}**. Priority: ${
      items.slice(0, 5).map((e) => e.title).join(', ') || 'none loaded'
    }.`,
    evidence: items.slice(0, 12),
    metrics: {
      overdueCompliance: T.overdueCompliance || 0,
      dueNext14: T.dueNext14 || 0,
      openRaBills: T.openRaBills || 0,
      employees: T.employees || 0,
    },
    actions: ['Ask specifically about overdue filings or RA bills'],
    confidence: items.length || T.overdueCompliance != null ? 'medium' : 'low',
    insufficientData: !items.length && T.overdueCompliance == null,
  });
}

export function answerMarketing(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const byStatus = T.byStatus || {};
  const bySource = T.bySource || {};
  const byOwner = T.byOwner || {};
  const items = context?.hotItems || [];

  if (/\b(how many|count|number)\b/.test(q) && /\bleads?\b/.test(q)) {
    return packAnswer({
      appId: 'marketing_kpi',
      question,
      intent: 'count',
      headline: `leads: ${T.leads || 0}`,
      direct: `**Direct answer:** **${T.leads || 0}** leads in the live Marketing KPI snapshot across **${T.statuses || Object.keys(byStatus).length}** statuses.`,
      metrics: { leads: T.leads || 0, byStatus },
      evidence: items.slice(0, 8),
      confidence: 'high',
    });
  }

  if (/\b(source|channel|meta|google|referral)\b/.test(q)) {
    const topSources = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return packAnswer({
      appId: 'marketing_kpi',
      question,
      intent: 'diagnostic',
      headline: topSources[0] ? `Top source: ${topSources[0][0]} (${topSources[0][1]})` : `leads: ${T.leads || 0}`,
      direct: `**Direct answer:** Lead sources — ${
        topSources.map(([k, v]) => `**${k}**: ${v}`).join(', ') || 'no source mix in context'
      }. Total leads **${T.leads || 0}**.`,
      evidence: items.slice(0, 8),
      metrics: { leads: T.leads || 0, bySource },
      charts: [
        {
          type: 'donut',
          title: 'Lead sources',
          narrative: 'Share of leads by source from live Marketing data.',
          data: topSources.map(([label, value]) => ({ label, value })),
        },
      ],
      actions: ['Double down on top converting sources', 'Review underperforming channels this week'],
      confidence: topSources.length ? 'high' : 'low',
    });
  }

  if (/\b(owner|employee|who)\b/.test(q)) {
    const topOwners = Object.entries(byOwner)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    return packAnswer({
      appId: 'marketing_kpi',
      question,
      intent: 'diagnostic',
      headline: topOwners[0] ? `Heaviest owner: ${topOwners[0][0]} (${topOwners[0][1]})` : 'Owner mix unavailable',
      direct: `**Direct answer:** Owner workload — ${
        topOwners.map(([k, v]) => `**${k}**: ${v} leads`).join(', ') || 'no owner mix'
      }.`,
      evidence: items.slice(0, 8),
      metrics: { byOwner, leads: T.leads || 0 },
      confidence: topOwners.length ? 'high' : 'low',
    });
  }

  const topStatus = Object.entries(byStatus).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return packAnswer({
    appId: 'marketing_kpi',
    question,
    intent: 'general',
    headline: `${T.leads || 0} leads · ${topStatus[0] ? topStatus[0][0] : 'n/a'} largest stage`,
    direct: `**Direct answer:** Marketing has **${T.leads || 0}** leads. Stage mix: ${
      topStatus.map(([k, v]) => `**${k}**: ${v}`).join(', ') || 'n/a'
    }. Sample follow-ups: ${items.slice(0, 5).map((e) => e.title).join(', ') || 'none'}.`,
    evidence: items.slice(0, 10),
    metrics: { leads: T.leads || 0, byStatus, bySource },
    charts: [
      {
        type: 'donut',
        title: 'Lead stage mix',
        narrative: 'Distribution of leads by status/stage.',
        data: topStatus.map(([label, value]) => ({ label, value })),
      },
    ],
    actions: ['Ask about a source, owner, or stage for a sharper answer'],
    confidence: T.leads ? 'medium' : 'low',
    insufficientData: !T.leads && !items.length,
  });
}
