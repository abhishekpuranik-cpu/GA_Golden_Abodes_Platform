import { packAnswer, qn } from './_shared.js';
import { parsePostSalesEntityQuery } from '../parseEntityQuery.js';

function inr(n) {
  const v = Math.round(Number(n) || 0);
  return `₹${v.toLocaleString('en-IN')}`;
}

function answerFocusedUnit(question, context, u) {
  const evidence = [
    {
      title: `${u.project} · Unit ${u.unitNumber}`,
      detail: u.detail,
      href: u.href,
      risk: 10,
    },
  ];
  if (u.customer) evidence.push({ title: 'Customer', detail: u.customer });
  if (u.slaBreaches) evidence.push({ title: 'SLA breaches', detail: String(u.slaBreaches), value: u.slaBreaches });
  if (u.openTickets) evidence.push({ title: 'Open tickets', detail: String(u.openTickets), value: u.openTickets });

  const metrics = {
    agreementDue: u.agreementDue || 0,
    agreementReceived: u.agreementReceived || 0,
    agreementPending: u.agreementPending || 0,
    gstPending: u.gstPending || 0,
    totalOutstanding: u.totalOutstanding || 0,
    collectPct: u.collectPct ?? 0,
  };

  const charts = [
    {
      type: 'hbar',
      title: `Collections · ${u.project} ${u.unitNumber}`,
      narrative: 'Agreement due vs received vs pending for this unit only (not portfolio).',
      data: [
        { label: 'Due', value: Math.round(u.agreementDue || 0) },
        { label: 'Received', value: Math.round(u.agreementReceived || 0) },
        { label: 'Pending', value: Math.round(u.agreementPending || 0) },
        { label: 'GST pend.', value: Math.round(u.gstPending || 0) },
      ].filter((d) => d.value > 0 || d.label === 'Received'),
    },
  ];

  return packAnswer({
    appId: 'post_sales',
    question,
    intent: 'informative',
    headline: `${u.project} ${u.unitNumber}: outstanding ${inr(u.totalOutstanding)} · collected ${u.collectPct ?? 0}%`,
    direct: `**Direct answer for ${u.project} Unit ${u.unitNumber}:** Collected **${inr(u.agreementReceived)}** of **${inr(u.agreementDue)}** due (${u.collectPct ?? 0}%). Agreement pending **${inr(u.agreementPending)}**, GST pending **${inr(u.gstPending)}**, total outstanding **${inr(u.totalOutstanding)}**. Status **${u.status || 'n/a'}**${u.customer ? `, customer **${u.customer}**` : ''}${u.paymentPlan ? `, plan **${u.paymentPlan}**` : ''}. SLA breaches on unit: **${u.slaBreaches || 0}**, open tickets: **${u.openTickets || 0}**.`,
    evidence,
    metrics,
    charts,
    actions: [
      `Open unit ${u.unitNumber} in Post Sales`,
      u.totalOutstanding > 0 ? 'Chase pending agreement / GST dues on this unit' : 'Collections look clear on dues-to-date — verify upcoming milestones',
    ],
    predictive:
      u.totalOutstanding > 0
        ? 'If pending dues stay uncleared, this unit will keep dragging project collection % and may trigger SLA pressure on demand steps.'
        : 'Dues-to-date look collected; watch the next CLP milestone dates.',
    confidence: 'high',
    insufficientData: false,
  });
}

export function answerPostSales(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const cf = context?.cashflowHealth || {};
  const items = context?.hotItems || [];
  const parsed = context?.queryParse || parsePostSalesEntityQuery(question);

  // Unit-specific path — never answer with portfolio totals when a unit was asked
  if (context?.focusedUnit) {
    return answerFocusedUnit(question, context, context.focusedUnit);
  }
  if (parsed?.unitNumber || (parsed?.project && /\bunit\b/i.test(question || ''))) {
    const msg =
      context?.unitLookup?.message ||
      `No unit matched${parsed.project ? ` “${parsed.project}”` : ''}${parsed.unitNumber ? ` ${parsed.unitNumber}` : ''}.`;
    return packAnswer({
      appId: 'post_sales',
      question,
      intent: 'diagnostic',
      headline: 'Unit not found in Post Sales',
      direct: `**Direct answer:** ${msg} Portfolio has **${T.totalUnits || 0}** units — re-check project spelling / unit number, or open Post Sales search.`,
      evidence: items.slice(0, 5),
      metrics: { totalUnits: T.totalUnits || 0 },
      actions: ['Search the unit in Post Sales Units list', 'Re-ask as “<Project> Unit <number> collections”'],
      confidence: 'high',
      insufficientData: true,
      charts: [],
    });
  }

  const sla = items.filter((it) => /sla/i.test(`${it.status || ''} ${it.detail || ''}`));
  const tickets = items.filter((it) => /ticket/i.test(`${it.status || ''} ${it.detail || ''}`));
  const high = items.filter((it) => /high_priority|high priority/i.test(`${it.status || ''} ${it.detail || ''}`));

  if (/\b(sla|breach|breaches)\b/.test(q)) {
    return packAnswer({
      appId: 'post_sales',
      question,
      intent: 'diagnostic',
      headline: `${T.slaBreaches || sla.length} SLA breaches`,
      direct: `**Direct answer:** **${T.slaBreaches ?? sla.length}** SLA breaches. Units: ${
        (sla.length ? sla : items).slice(0, 5).map((e) => e.title).join(', ') || 'none listed'
      }.`,
      evidence: (sla.length ? sla : items).slice(0, 10),
      metrics: {
        slaBreaches: T.slaBreaches ?? sla.length,
        openTickets: T.openTickets || 0,
      },
      charts: [
        {
          type: 'hbar',
          title: 'SLA vs tickets',
          narrative: 'Counts only (not rupee outstanding).',
          data: [
            { label: 'SLA breaches', value: T.slaBreaches ?? sla.length },
            { label: 'Open tickets', value: T.openTickets || 0 },
          ],
        },
      ],
      actions: ['Clear oldest SLA-breached units first'],
      confidence: 'high',
      insufficientData: T.slaBreaches == null && !sla.length && !items.length,
    });
  }

  if (/\b(ticket|tickets|complaint)\b/.test(q)) {
    return packAnswer({
      appId: 'post_sales',
      question,
      intent: 'diagnostic',
      headline: `${T.openTickets || tickets.length} open tickets`,
      direct: `**Direct answer:** **${T.openTickets ?? tickets.length}** open tickets. Sample: ${
        (tickets.length ? tickets : items).slice(0, 5).map((e) => e.title).join(', ') || 'none'
      }.`,
      evidence: (tickets.length ? tickets : items).slice(0, 10),
      metrics: { openTickets: T.openTickets ?? tickets.length, slaBreaches: T.slaBreaches || 0 },
      actions: ['Triage high-priority tickets today'],
      confidence: 'high',
      charts: [],
    });
  }

  if (/\b(outstanding|collect|collection|demand|cash)\b/.test(q)) {
    const outstanding = T.totalOutstanding ?? cf.totalOutstanding ?? 0;
    return packAnswer({
      appId: 'post_sales',
      question,
      intent: 'informative',
      headline: `Portfolio outstanding ${inr(outstanding)} · collect ${T.collectPct ?? 'n/a'}%`,
      direct: `**Direct answer (portfolio):** Total outstanding **${inr(outstanding)}** (agreement pending **${inr(T.agreementPending ?? cf.agreementPending ?? 0)}**, GST pending **${inr(T.gstPending ?? cf.gstPending ?? 0)}**). Collection **${T.collectPct ?? 'n/a'}%**. Demanded **${inr(T.totalDemanded || 0)}**, collected **${inr(T.totalCollected || 0)}**. For a single unit, ask “&lt;Project&gt; Unit &lt;number&gt; collections”.`,
      evidence: items.slice(0, 8),
      metrics: {
        agreementPending: T.agreementPending ?? cf.agreementPending ?? 0,
        gstPending: T.gstPending ?? cf.gstPending ?? 0,
        totalOutstanding: outstanding,
        collectPct: T.collectPct ?? 0,
        totalDemanded: T.totalDemanded || 0,
        totalCollected: T.totalCollected || 0,
      },
      charts: [
        {
          type: 'hbar',
          title: 'Portfolio collections (₹)',
          narrative: 'Rupee amounts for the whole Post Sales book — not a single unit.',
          data: [
            { label: 'Demanded', value: Math.round(T.totalDemanded || 0) },
            { label: 'Collected', value: Math.round(T.totalCollected || 0) },
            { label: 'Outstanding', value: Math.round(outstanding) },
          ],
        },
      ],
      actions: ['Name a project + unit for unit-level collections', 'Chase pending demand units'],
      confidence: outstanding || T.collectPct != null ? 'high' : 'low',
    });
  }

  if (/\b(disbursement|loan)\b/.test(q)) {
    return packAnswer({
      appId: 'post_sales',
      question,
      intent: 'diagnostic',
      headline: `${T.openDisbursementTasks || 0} open · ${T.delayedDisbursementTasks || 0} delayed disbursements`,
      direct: `**Direct answer:** Open disbursement tasks **${T.openDisbursementTasks || 0}**, delayed **${T.delayedDisbursementTasks || 0}**.`,
      evidence: items.slice(0, 8),
      metrics: {
        openDisbursementTasks: T.openDisbursementTasks || 0,
        delayedDisbursementTasks: T.delayedDisbursementTasks || 0,
      },
      actions: ['Unblock delayed disbursement tasks with bank/docs owners'],
      confidence: 'high',
      charts: [],
    });
  }

  return packAnswer({
    appId: 'post_sales',
    question,
    intent: 'general',
    headline: `${T.slaBreaches || 0} SLA · ${T.openTickets || 0} tickets · outstanding ${inr(T.totalOutstanding || 0)}`,
    direct: `**Direct answer (portfolio):** Post Sales — units **${T.totalUnits || 0}**, SLA breaches **${T.slaBreaches || 0}**, open tickets **${T.openTickets || 0}**, outstanding **${inr(T.totalOutstanding || 0)}**, collect **${T.collectPct ?? 'n/a'}%**. Priority: ${
      (high.length ? high : items).slice(0, 5).map((e) => e.title).join(', ') || 'none'
    }. Tip: ask “Paradise Unit 701 collections” for a unit-level answer.`,
    evidence: (high.length ? high : items).slice(0, 10),
    metrics: {
      totalUnits: T.totalUnits || 0,
      slaBreaches: T.slaBreaches || 0,
      openTickets: T.openTickets || 0,
      collectPct: T.collectPct ?? 0,
    },
    charts: [
      {
        type: 'hbar',
        title: 'Portfolio counts',
        narrative: 'Unit/SLA/ticket counts only. Rupee outstanding is in the narrative above.',
        data: [
          { label: 'Units', value: T.totalUnits || 0 },
          { label: 'SLA', value: T.slaBreaches || 0 },
          { label: 'Tickets', value: T.openTickets || 0 },
        ],
      },
    ],
    actions: ['Ask “&lt;Project&gt; Unit &lt;number&gt; collections” for unit detail'],
    confidence: items.length || T.totalUnits ? 'medium' : 'low',
    insufficientData: !items.length && !T.totalUnits,
  });
}
