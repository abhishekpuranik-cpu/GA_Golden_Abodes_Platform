import { packAnswer, qn } from './_shared.js';

export function answerDm(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const items = context?.hotItems || [];
  const cards = context?.projectCards || [];
  const red = items.filter((it) => /red/i.test(String(it.status || '')));
  const amber = items.filter((it) => /amber/i.test(String(it.status || '')));

  if (/\b(outstanding|accrued|billed|paid|fee|billing)\b/.test(q)) {
    return packAnswer({
      appId: 'dm_spv_governance',
      question,
      intent: 'informative',
      headline: `DM accrued ₹${Math.round(T.dmFeeAccrued || 0)} · billed ₹${Math.round(T.dmFeeBilledTtd || 0)}`,
      direct: `**Direct answer:** DM fee billed TTD **₹${Math.round(T.dmFeeBilledTtd || 0)}**, paid **₹${Math.round(T.dmFeePaidTtd || 0)}**, accrued/outstanding **₹${Math.round(T.dmFeeAccrued || 0)}**, balance eligible **₹${Math.round(T.balanceDmEligible || 0)}**. Delayed payment projects **${T.delayedPayments || 0}**, pending approvals **${T.pendingApprovals || 0}**.`,
      evidence: items.slice(0, 10),
      metrics: {
        dmFeeBilledTtd: T.dmFeeBilledTtd || 0,
        dmFeePaidTtd: T.dmFeePaidTtd || 0,
        dmFeeAccrued: T.dmFeeAccrued || 0,
        balanceDmEligible: T.balanceDmEligible || 0,
        delayedPayments: T.delayedPayments || 0,
        pendingApprovals: T.pendingApprovals || 0,
      },
      actions: ['Clear delayed payment projects', 'Process pending invoice approvals'],
      confidence: 'high',
    });
  }

  if (/\b(risk|exception|alert|red|amber)\b/.test(q)) {
    const focus = red.length ? red : amber.length ? amber : items;
    return packAnswer({
      appId: 'dm_spv_governance',
      question,
      intent: 'diagnostic',
      headline: `${T.exceptionsPending || 0} exceptions · ${red.length} red / ${amber.length} amber`,
      direct: `**Direct answer:** Exceptions pending **${T.exceptionsPending || 0}**, alerts **${T.alerts || 0}**. Risk focus: ${
        focus.slice(0, 5).map((e) => e.title).join(', ') || 'none listed'
      }.`,
      evidence: focus.slice(0, 12),
      metrics: {
        exceptionsPending: T.exceptionsPending || 0,
        alerts: T.alerts || 0,
        delayedPayments: T.delayedPayments || 0,
        activeProjects: T.activeProjects || 0,
      },
      actions: ['Open red/amber projects in DM Governance', 'Attach missing billing configs'],
      confidence: focus.length || T.exceptionsPending != null ? 'high' : 'medium',
    });
  }

  if (/\b(spv|project)\b/.test(q) && /\b(how many|count|active)\b/.test(q)) {
    return packAnswer({
      appId: 'dm_spv_governance',
      question,
      intent: 'count',
      headline: `${T.activeProjects || 0} projects · ${T.activeSpvs || 0} SPVs`,
      direct: `**Direct answer:** Active projects **${T.activeProjects || 0}**, active SPVs **${T.activeSpvs || 0}**.`,
      evidence: (cards.length ? cards.map((p) => ({ title: p.name, detail: p.riskStatus })) : items).slice(0, 10),
      metrics: { activeProjects: T.activeProjects || 0, activeSpvs: T.activeSpvs || 0 },
      confidence: 'high',
    });
  }

  return packAnswer({
    appId: 'dm_spv_governance',
    question,
    intent: 'general',
    headline: `${T.activeProjects || 0} projects · accrued ₹${Math.round(T.dmFeeAccrued || 0)}`,
    direct: `**Direct answer:** DM Governance — **${T.activeProjects || 0}** projects / **${T.activeSpvs || 0}** SPVs, topline **₹${Math.round(T.totalTopline || 0)}**, collections **₹${Math.round(T.totalCollections || 0)}**, DM billed **₹${Math.round(T.dmFeeBilledTtd || 0)}**, accrued **₹${Math.round(T.dmFeeAccrued || 0)}**, exceptions **${T.exceptionsPending || 0}**. Hot items: ${
      items.slice(0, 5).map((e) => e.title).join(', ') || 'none'
    }.`,
    evidence: items.slice(0, 12),
    metrics: {
      activeProjects: T.activeProjects || 0,
      activeSpvs: T.activeSpvs || 0,
      dmFeeBilledTtd: T.dmFeeBilledTtd || 0,
      dmFeeAccrued: T.dmFeeAccrued || 0,
      exceptionsPending: T.exceptionsPending || 0,
    },
    actions: ['Ask about outstanding fees, red risks, or a named project'],
    confidence: items.length || T.activeProjects ? 'medium' : 'low',
    insufficientData: !items.length && !T.activeProjects,
  });
}

export function answerExecution(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const items = context?.hotItems || [];

  if (/\b(spi|schedule)\b/.test(q)) {
    return packAnswer({
      appId: 'execution',
      question,
      intent: 'diagnostic',
      headline: `SPI: ${T.spi ?? 'n/a'}`,
      direct: `**Direct answer:** Schedule performance index (SPI) is **${T.spi ?? 'n/a'}**. ${
        Number(T.spi) < 1 ? 'Below 1.0 — schedule is behind plan.' : Number(T.spi) >= 1 ? 'At/above plan.' : 'SPI not in context.'
      } Related issues: ${items.slice(0, 4).map((e) => e.title).join(', ') || 'none listed'}.`,
      evidence: items.slice(0, 10),
      metrics: { spi: T.spi ?? null, cpi: T.cpi ?? null, issues: T.issues ?? 0 },
      actions: ['Clear top schedule blockers', 'Re-baseline only after issue ownership'],
      confidence: T.spi != null ? 'high' : 'low',
      insufficientData: T.spi == null && !items.length,
    });
  }

  if (/\b(cpi|cost)\b/.test(q)) {
    return packAnswer({
      appId: 'execution',
      question,
      intent: 'diagnostic',
      headline: `CPI: ${T.cpi ?? 'n/a'}`,
      direct: `**Direct answer:** Cost performance index (CPI) is **${T.cpi ?? 'n/a'}**.`,
      evidence: items.slice(0, 8),
      metrics: { cpi: T.cpi ?? null, spi: T.spi ?? null },
      confidence: T.cpi != null ? 'high' : 'low',
      insufficientData: T.cpi == null,
    });
  }

  if (/\b(issue|blocker|risk)\b/.test(q)) {
    return packAnswer({
      appId: 'execution',
      question,
      intent: 'diagnostic',
      headline: `${T.issues ?? items.length} issues / blockers`,
      direct: `**Direct answer:** **${T.issues ?? items.length}** issue signal(s). Top: ${
        items.slice(0, 5).map((e) => e.title).join(', ') || 'none listed'
      }. SPI **${T.spi ?? 'n/a'}**, CPI **${T.cpi ?? 'n/a'}**.`,
      evidence: items.slice(0, 12),
      metrics: { issues: T.issues ?? items.length, spi: T.spi ?? null, cpi: T.cpi ?? null },
      actions: ['Assign owners to top blockers today'],
      confidence: items.length || T.issues != null ? 'high' : 'low',
    });
  }

  return packAnswer({
    appId: 'execution',
    question,
    intent: 'general',
    headline: `SPI ${T.spi ?? 'n/a'} · CPI ${T.cpi ?? 'n/a'} · issues ${T.issues ?? items.length}`,
    direct: `**Direct answer:** Execution snapshot — SPI **${T.spi ?? 'n/a'}**, CPI **${T.cpi ?? 'n/a'}**, issues **${T.issues ?? items.length}**. Focus: ${
      items.slice(0, 5).map((e) => e.title).join(', ') || 'none'
    }.`,
    evidence: items.slice(0, 10),
    metrics: { spi: T.spi ?? null, cpi: T.cpi ?? null, issues: T.issues ?? items.length },
    actions: ['Ask specifically about SPI, CPI, or named blockers'],
    confidence: T.spi != null || items.length ? 'medium' : 'low',
    insufficientData: T.spi == null && T.cpi == null && !items.length,
  });
}

export function answerPrecon(question, context) {
  const q = qn(question);
  const T = context?.totals || {};
  const hot = context?.hotTasks || context?.hotItems || [];
  const wl = context?.workload || [];
  const projects = context?.projects || [];

  if (/\b(how many|count)\b/.test(q) && /\boverdue\b/.test(q)) {
    return packAnswer({
      appId: 'preconstruction',
      question,
      intent: 'count',
      headline: `overdue: ${T.overdue || 0}`,
      direct: `**Direct answer:** **${T.overdue || 0}** overdue tasks in PreConstruction scope (${T.tasks || 0} total tasks).`,
      evidence: hot.filter((t) => /overdue/i.test(String(t.status || ''))).slice(0, 10),
      metrics: { overdue: T.overdue || 0, tasks: T.tasks || 0, unassigned: T.unassigned || 0 },
      confidence: 'high',
    });
  }

  if (/\b(who|workload|overload)\b/.test(q)) {
    const top = wl.slice(0, 8);
    return packAnswer({
      appId: 'preconstruction',
      question,
      intent: 'diagnostic',
      headline: top[0] ? `${top[0].who}: ${top[0].open} open / ${top[0].overdue} overdue` : 'Workload unavailable',
      direct: top.length
        ? `**Direct answer:** Workload pressure — ${top.map((w) => `**${w.who}** ${w.open} open / ${w.overdue} overdue`).join('; ')}.`
        : '**Direct answer:** No workload rows in server context.',
      evidence: top.map((w) => ({ title: w.who, detail: `open ${w.open}, overdue ${w.overdue}`, risk: w.overdue * 3 + w.open })),
      metrics: { people: wl.length, overdue: T.overdue || 0 },
      confidence: top.length ? 'high' : 'low',
      insufficientData: !top.length,
    });
  }

  if (/\b(stuck|bottleneck|risk|hot|overdue|block)\b/.test(q)) {
    return packAnswer({
      appId: 'preconstruction',
      question,
      intent: 'diagnostic',
      headline: hot[0] ? `${hot.length} hot tasks · ${hot[0].task || hot[0].title}` : `${T.overdue || 0} overdue`,
      direct: `**Direct answer:** **${T.overdue || 0}** overdue, **${T.unassigned || 0}** unassigned, **${T.inprogress || 0}** in progress. Hottest: ${
        hot.slice(0, 5).map((t) => t.task || t.title).join(', ') || 'none'
      }.`,
      evidence: hot.slice(0, 12),
      metrics: {
        overdue: T.overdue || 0,
        unassigned: T.unassigned || 0,
        inprogress: T.inprogress || 0,
        tasks: T.tasks || 0,
        projects: T.projects || context.projectCount || 0,
      },
      actions: ['Clear top overdue task', 'Assign owners to unassigned open work'],
      confidence: hot.length || T.overdue != null ? 'high' : 'low',
    });
  }

  const worst = [...projects].sort((a, b) => (b.overdue || 0) - (a.overdue || 0))[0];
  return packAnswer({
    appId: 'preconstruction',
    question,
    intent: 'general',
    headline: `${T.overdue || 0} overdue · ${T.projects || context.projectCount || 0} projects`,
    direct: `**Direct answer:** PreConstruction portfolio — **${T.projects || context.projectCount || 0}** projects, **${T.tasks || 0}** tasks (**${T.completed || 0}** done, **${T.inprogress || 0}** in progress, **${T.overdue || 0}** overdue, **${T.unassigned || 0}** unassigned). ${
      worst ? `Sample project row: **${worst.name || worst.title}**.` : ''
    } Hot tasks: ${hot.slice(0, 4).map((t) => t.task || t.title).join(', ') || 'none'}.`,
    evidence: hot.slice(0, 10),
    metrics: {
      projects: T.projects || context.projectCount || 0,
      tasks: T.tasks || 0,
      overdue: T.overdue || 0,
      unassigned: T.unassigned || 0,
      completed: T.completed || 0,
    },
    actions: ['Ask about overdue tasks, a person, or a project name'],
    confidence: T.tasks || hot.length ? 'medium' : 'low',
    insufficientData: !T.tasks && !hot.length,
  });
}
