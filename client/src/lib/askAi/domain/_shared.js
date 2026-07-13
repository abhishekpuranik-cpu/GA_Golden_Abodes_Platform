/** Shared helpers for domain Ask engines. */

export function packAnswer({
  appId,
  question,
  intent,
  headline,
  direct,
  evidence = [],
  metrics = {},
  actions = [],
  predictive = '',
  charts = [],
  confidence = 'medium',
  insufficientData = false,
}) {
  const evidenceLines = evidence.slice(0, 12).map((e) => {
    if (typeof e === 'string') return `- ${e}`;
    return `- **${e.title || e.name}**${e.detail ? ` — ${e.detail}` : ''}${e.value != null ? ` · **${e.value}**` : ''}`;
  });
  const metricLines = Object.entries(metrics)
    .slice(0, 12)
    .map(([k, v]) => `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);

  const sections = [
    {
      kind: 'informative',
      title: 'Direct answer',
      narrative: direct,
    },
  ];
  if (evidenceLines.length) {
    sections.push({
      kind: 'informative',
      title: 'Evidence from live data',
      narrative: evidenceLines.join('\n'),
    });
  }
  if (metricLines.length) {
    sections.push({
      kind: 'informative',
      title: 'Metrics used',
      narrative: metricLines.join('\n'),
    });
  }
  if (predictive) {
    sections.push({ kind: 'predictive', title: 'If unchanged', narrative: predictive });
  }
  if (actions.length) {
    sections.push({
      kind: 'prescriptive',
      title: 'What to do next',
      narrative: actions.map((a, i) => `${i + 1}. ${a}`).join(' '),
    });
  }
  if (insufficientData) {
    sections.push({
      kind: 'informative',
      title: 'Data limitation',
      narrative:
        'Live context did not contain enough structured evidence for a high-confidence answer. Open the app board and re-ask after data loads, or name a specific project/person/metric.',
    });
  }

  const chartList =
    charts.length > 0
      ? charts
      : metricLines.length >= 2
        ? [
            {
              type: 'hbar',
              title: 'Metrics for this question',
              narrative: 'Numeric fields used to answer your question.',
              data: Object.entries(metrics)
                .filter(([, v]) => typeof v === 'number')
                .slice(0, 8)
                .map(([label, value]) => ({ label: String(label).slice(0, 18), value })),
            },
          ]
        : evidence.length
          ? [
              {
                type: 'hbar',
                title: 'Evidence ranking',
                narrative: 'Items cited in the direct answer.',
                data: evidence.slice(0, 8).map((e, i) => ({
                  label: String(e.title || e.name || `Item ${i + 1}`).slice(0, 18),
                  value: Number(e.risk || e.value || 8 - i),
                })),
              },
            ]
          : [];

  return {
    ok: true,
    source: 'local',
    engine: 'domain',
    appId,
    intent,
    confidence,
    insufficientData,
    headline,
    sections,
    charts: chartList.filter((c) => c.data?.length),
    highlights: metrics,
    evidence: evidence.slice(0, 20),
    markdown: [
      `### Answer to: “${String(question || '').slice(0, 180)}”`,
      '',
      direct,
      '',
      evidenceLines.length ? `#### Evidence\n${evidenceLines.join('\n')}` : '',
      metricLines.length ? `\n#### Metrics\n${metricLines.join('\n')}` : '',
      '',
      `_Domain engine · confidence=${confidence} · ${appId}_`,
    ]
      .filter(Boolean)
      .join('\n'),
    proposedActions: evidence.slice(0, 5).map((e) => ({
      type: 'note',
      label: `Review: ${e.title || e.name || 'item'}`,
      rationale: e.detail || 'Cited as evidence',
      href: e.href || '',
    })),
  };
}

export function qn(s) {
  return String(s || '').toLowerCase();
}

export function matchName(hay, needle) {
  const h = String(hay || '').toLowerCase();
  const n = String(needle || '').toLowerCase().trim();
  if (!n || n.length < 2) return false;
  return h.includes(n);
}

export function findProjects(context, question) {
  const items = [].concat(context?.hotItems || [], context?.projects || []);
  const q = qn(question);
  const tokens = q.match(/[a-z0-9][a-z0-9._-]{2,}/g) || [];
  const stop = new Set([
    'which', 'what', 'where', 'project', 'projects', 'have', 'with', 'payment', 'issues',
    'collection', 'cash', 'flow', 'please', 'show', 'tell', 'about', 'need', 'focus',
  ]);
  const names = tokens.filter((t) => !stop.has(t));
  if (!names.length) return items;
  const hit = items.filter((it) => names.some((n) => matchName(it.title || it.name, n) || matchName(it.detail, n)));
  return hit.length ? hit : items;
}
