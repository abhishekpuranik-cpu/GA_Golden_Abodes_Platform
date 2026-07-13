import { packAnswer, qn } from './_shared.js';

export function answerPostSales(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const cf = context?.cashflowHealth || {};
  const items = context?.hotItems || [];
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
      }. Ack breaches **${T.ackBreachCount || 0}**, resolution breaches **${T.resBreachCount || 0}**.`,
      evidence: (sla.length ? sla : items).slice(0, 10),
      metrics: {
        slaBreaches: T.slaBreaches ?? sla.length,
        ackBreachCount: T.ackBreachCount || 0,
        resBreachCount: T.resBreachCount || 0,
        openTickets: T.openTickets || 0,
      },
      actions: ['Clear oldest SLA-breached units first', 'Assign owners on ack/resolution breach queues'],
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
      actions: ['Triage high-priority tickets today', 'Link tickets to unit pipeline steps'],
      confidence: 'high',
    });
  }

  if (/\b(outstanding|collect|collection|demand|cash)\b/.test(q)) {
    const outstanding = T.totalOutstanding ?? cf.totalOutstanding ?? 0;
    return packAnswer({
      appId: 'post_sales',
      question,
      intent: 'informative',
      headline: `Outstanding ₹${Math.round(outstanding)} · collect ${T.collectPct ?? 'n/a'}%`,
      direct: `**Direct answer:** Total outstanding **₹${Math.round(outstanding)}** (agreement pending **₹${Math.round(T.agreementPending ?? cf.agreementPending ?? 0)}**, GST pending **₹${Math.round(T.gstPending ?? cf.gstPending ?? 0)}**). Collection **${T.collectPct ?? 'n/a'}%** (today **${T.todayCollectPct ?? 'n/a'}%**). Demanded **₹${Math.round(T.totalDemanded || 0)}**, collected **₹${Math.round(T.totalCollected || 0)}**.`,
      evidence: items.slice(0, 8),
      metrics: {
        totalOutstanding: outstanding,
        agreementPending: T.agreementPending ?? cf.agreementPending ?? 0,
        gstPending: T.gstPending ?? cf.gstPending ?? 0,
        collectPct: T.collectPct ?? 0,
        totalDemanded: T.totalDemanded || 0,
        totalCollected: T.totalCollected || 0,
      },
      actions: ['Chase pending demand units', 'Clear delayed disbursement tasks blocking collections'],
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
    });
  }

  return packAnswer({
    appId: 'post_sales',
    question,
    intent: 'general',
    headline: `${T.slaBreaches || 0} SLA · ${T.openTickets || 0} tickets · outstanding ₹${Math.round(T.totalOutstanding || 0)}`,
    direct: `**Direct answer:** Post Sales live board — units **${T.totalUnits || 0}** (active **${T.activeUnits || 0}**), SLA breaches **${T.slaBreaches || 0}**, open tickets **${T.openTickets || 0}**, outstanding **₹${Math.round(T.totalOutstanding || 0)}**, collect **${T.collectPct ?? 'n/a'}%**. Priority items: ${
      (high.length ? high : items).slice(0, 5).map((e) => e.title).join(', ') || 'none'
    }.`,
    evidence: (high.length ? high : items).slice(0, 10),
    metrics: {
      totalUnits: T.totalUnits || 0,
      slaBreaches: T.slaBreaches || 0,
      openTickets: T.openTickets || 0,
      totalOutstanding: T.totalOutstanding || 0,
      collectPct: T.collectPct ?? 0,
    },
    actions: ['Ask about SLA, tickets, or outstanding for a focused answer'],
    confidence: items.length || T.totalUnits ? 'medium' : 'low',
    insufficientData: !items.length && !T.totalUnits,
  });
}
