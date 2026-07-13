import { packAnswer, qn } from './_shared.js';

export function answerHiring(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const byStatus = T.byStatus && typeof T.byStatus === 'object' ? T.byStatus : {};
  const items = context?.hotItems || [];
  const funnel = context?.funnelByRequisition || [];

  const stuck = items.filter((it) => /hold|stuck|draft|sourcing|open/i.test(`${it.status || ''} ${it.detail || ''}`));
  const interview = items.filter((it) => /interview/i.test(String(it.status || '')));
  const offer = items.filter((it) => /offer/i.test(String(it.status || '')));

  if (/\b(how many|count|number of)\b/.test(q)) {
    if (/\bopen\b/.test(q)) {
      const n = T.openRequisitions ?? byStatus.open ?? byStatus.Open ?? stuck.length;
      return packAnswer({
        appId: 'hiring',
        question,
        intent: 'count',
        headline: `openRequisitions: ${n}`,
        direct: `**Direct answer:** **${n}** open requisitions (live Hiring totals).`,
        metrics: { openRequisitions: n, totalRequisitions: T.requisitions || T.totalRequisitions || 0, activeCandidates: T.activeCandidates || 0 },
        evidence: stuck.slice(0, 8),
        confidence: 'high',
      });
    }
    if (/\bcandidate\b/.test(q)) {
      return packAnswer({
        appId: 'hiring',
        question,
        intent: 'count',
        headline: `activeCandidates: ${T.activeCandidates || 0}`,
        direct: `**Direct answer:** **${T.activeCandidates || 0}** active candidates; **${T.upcomingInterviews || 0}** upcoming interviews.`,
        metrics: { activeCandidates: T.activeCandidates || 0, upcomingInterviews: T.upcomingInterviews || 0 },
        confidence: 'high',
      });
    }
  }

  if (/\b(stuck|bottleneck|funnel|sourcing|hold)\b/.test(q)) {
    const emptyFunnel = funnel.filter((f) => (f.activeCandidates || f.inPipeline || 0) === 0);
    const evidence = (stuck.length ? stuck : items).slice(0, 10);
    return packAnswer({
      appId: 'hiring',
      question,
      intent: 'diagnostic',
      headline: evidence[0] ? `Bottleneck: ${evidence[0].title}` : `Open reqs: ${T.openRequisitions || 0}`,
      direct: `**Direct answer:** Hiring pressure centers on **${evidence.slice(0, 3).map((e) => e.title).join(', ') || 'no open req rows'}**. Open requisitions **${T.openRequisitions ?? items.length}**, fill rate **${T.fillRate ?? 'n/a'}%**, active candidates **${T.activeCandidates || 0}**, upcoming interviews **${T.upcomingInterviews || 0}**. ${
        emptyFunnel.length ? `${emptyFunnel.length} requisition(s) have no active candidates in the funnel.` : ''
      }`,
      evidence,
      metrics: {
        openRequisitions: T.openRequisitions ?? items.length,
        fillRate: T.fillRate ?? 0,
        activeCandidates: T.activeCandidates || 0,
        upcomingInterviews: T.upcomingInterviews || 0,
        byStatus,
      },
      actions: [
        'Source or reopen candidate flow on empty-funnel requisitions',
        'Schedule interviews for roles already in Interview stage',
        'Clear Hold/Draft requisitions or cancel them',
      ],
      predictive: 'Requisitions with zero active candidates will miss hiring SLAs unless sourcing starts this week.',
      confidence: evidence.length || T.openRequisitions != null ? 'high' : 'low',
      insufficientData: !items.length && T.openRequisitions == null,
    });
  }

  if (/\b(interview|slot)\b/.test(q)) {
    return packAnswer({
      appId: 'hiring',
      question,
      intent: 'diagnostic',
      headline: `${T.upcomingInterviews || 0} upcoming interviews`,
      direct: `**Direct answer:** **${T.upcomingInterviews || 0}** upcoming interviews. Roles currently in interview stage: ${
        interview.slice(0, 5).map((e) => e.title).join(', ') || 'none listed in hot items'
      }.`,
      evidence: interview.length ? interview : items.slice(0, 8),
      metrics: { upcomingInterviews: T.upcomingInterviews || 0, activeCandidates: T.activeCandidates || 0 },
      actions: ['Confirm interview panel slots this week', 'Move stalled interview roles forward or reject'],
      confidence: 'high',
    });
  }

  if (/\b(offer|accepted)\b/.test(q)) {
    return packAnswer({
      appId: 'hiring',
      question,
      intent: 'informative',
      headline: `${T.offersAccepted || 0} offers accepted · conversion ${T.offerConversionRate ?? 'n/a'}%`,
      direct: `**Direct answer:** Offers accepted **${T.offersAccepted || 0}**, offer conversion **${T.offerConversionRate ?? 'n/a'}%**. Offer-stage roles: ${
        offer.slice(0, 5).map((e) => e.title).join(', ') || 'none listed'
      }.`,
      evidence: offer.length ? offer : items.slice(0, 5),
      metrics: { offersAccepted: T.offersAccepted || 0, offerConversionRate: T.offerConversionRate ?? 0 },
      confidence: 'high',
    });
  }

  return packAnswer({
    appId: 'hiring',
    question,
    intent: 'general',
    headline: `${T.openRequisitions ?? items.length} open · fill ${T.fillRate ?? 'n/a'}%`,
    direct: `**Direct answer:** Hiring snapshot — open requisitions **${T.openRequisitions ?? items.length}**, fulfilled **${T.fulfilledRequisitions || 0}**, headcount **${T.totalHeadcount || 0}**, hired **${T.totalHired || 0}**, fill rate **${T.fillRate ?? 'n/a'}%**, active candidates **${T.activeCandidates || 0}**, upcoming interviews **${T.upcomingInterviews || 0}**. Top open roles: ${
      items.slice(0, 5).map((e) => e.title).join(', ') || 'none'
    }.`,
    evidence: items.slice(0, 10),
    metrics: {
      openRequisitions: T.openRequisitions ?? items.length,
      fulfilledRequisitions: T.fulfilledRequisitions || 0,
      fillRate: T.fillRate ?? 0,
      activeCandidates: T.activeCandidates || 0,
      upcomingInterviews: T.upcomingInterviews || 0,
      byStatus,
    },
    actions: ['Ask about stuck roles, interviews, or a named requisition for a sharper answer'],
    confidence: items.length || T.openRequisitions != null ? 'medium' : 'low',
    insufficientData: !items.length && T.openRequisitions == null,
  });
}
