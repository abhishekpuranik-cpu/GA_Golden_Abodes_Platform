/**
 * Query-grounded local Ask AI engine.
 * Answers the user's question from live context — not a generic health template.
 */

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was', 'were',
  'be', 'been', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'with', 'from', 'into',
  'this', 'that', 'these', 'those', 'it', 'its', 'my', 'our', 'your', 'their', 'me', 'we',
  'you', 'they', 'i', 'am', 'at', 'by', 'as', 'if', 'then', 'than', 'so', 'not', 'no',
  'yes', 'please', 'tell', 'show', 'give', 'list', 'about', 'any', 'all', 'some', 'most',
  'app', 'apps', 'data', 'now', 'today', 'week', 'next', 'current', 'currently', 'right',
  'have', 'has', 'had', 'need', 'needs', 'get', 'got', 'make', 'made',
]);

function intentOf(q) {
  const s = String(q || '').toLowerCase();
  if (/\b(predict|forecast|will slip|likely|risk of|ahead|trend|outlook)\b/.test(s)) return 'predictive';
  if (/\b(prescribe|recommend|should|action plan|what to do|next steps|prioriti[sz]e|fix|clear)\b/.test(s)) {
    return 'prescriptive';
  }
  if (/\b(bottleneck|stuck|block|delay|overdue|at risk|compliance|workload|who|which|where)\b/.test(s)) {
    return 'diagnostic';
  }
  if (/\b(how many|count|total|sum|number of)\b/.test(s)) return 'count';
  if (/\b(summar|overview|status|health|snapshot)\b/.test(s)) return 'informative';
  return 'general';
}

function tokensOf(q) {
  return String(q || '')
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9._%+-]{1,}/g)
    ?.filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t)) || [];
}

function labelOf(it) {
  return String(it?.title || it?.name || it?.label || it?.task || it?.unitNo || it?.id || 'Item');
}

function detailOf(it) {
  return String(it?.detail || it?.reason || it?.status || it?.phase || it?.project || it?.message || '');
}

function hayOf(obj) {
  try {
    return JSON.stringify(obj || {}).toLowerCase();
  } catch {
    return String(obj || '').toLowerCase();
  }
}

function scoreHay(hay, tokens) {
  if (!tokens.length) return 0;
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length >= 5 ? 3 : 2;
  }
  return score;
}

function collectItems(context) {
  const bags = [
    context?.hotItems,
    context?.items,
    context?.risks,
    context?.hotTasks,
    context?.attention,
    context?.blockedUnits,
    context?.overdueSteps,
    context?.unitsAtRisk,
    context?.projects,
    context?.workload,
    context?.phaseRollup,
    context?.allowedApps,
  ];
  const out = [];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const it of bag) {
      if (it == null) continue;
      if (typeof it === 'string') out.push({ title: it, detail: 'app access' });
      else if (typeof it === 'object') out.push(it);
    }
  }
  return out;
}

function flattenFacts(context, path = '', depth = 0, out = []) {
  if (context == null || depth > 4) return out;
  if (typeof context !== 'object') {
    out.push({ path: path || 'value', value: context });
    return out;
  }
  if (Array.isArray(context)) {
    out.push({ path: path || 'list', value: `${context.length} items` });
    context.slice(0, 40).forEach((row, i) => flattenFacts(row, `${path}[${i}]`, depth + 1, out));
    return out;
  }
  for (const [k, v] of Object.entries(context)) {
    if (k.startsWith('_')) continue;
    const p = path ? `${path}.${k}` : k;
    if (v != null && typeof v === 'object') flattenFacts(v, p, depth + 1, out);
    else out.push({ path: p, key: k, value: v });
  }
  return out;
}

function matchTotals(totals, tokens) {
  const entries = Object.entries(totals || {});
  if (!entries.length) return [];
  if (!tokens.length) {
    return entries
      .filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && String(v).length < 40))
      .slice(0, 12)
      .map(([k, v]) => ({ key: k, value: v, score: 1 }));
  }
  return entries
    .map(([k, v]) => {
      const hay = `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`.toLowerCase();
      return { key: k, value: v, score: scoreHay(hay, tokens) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function matchItems(items, tokens) {
  if (!items.length) return [];
  if (!tokens.length) {
    return items.slice(0, 10).map((it, i) => ({ item: it, score: items.length - i }));
  }
  return items
    .map((it) => ({ item: it, score: scoreHay(hayOf(it), tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function matchFacts(facts, tokens) {
  if (!tokens.length) return [];
  return facts
    .map((f) => ({
      ...f,
      score: scoreHay(`${f.path} ${f.key || ''} ${f.value}`.toLowerCase(), tokens),
    }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function chartsFrom(matchedTotals, matchedItems, intent) {
  const charts = [];
  const numeric = matchedTotals.filter((t) => typeof t.value === 'number').slice(0, 8);
  if (numeric.length >= 2) {
    charts.push({
      type: intent === 'diagnostic' ? 'hbar' : 'donut',
      title: 'Metrics relevant to your question',
      narrative: 'Only metrics that matched keywords in your question (or top snapshot metrics if none matched).',
      data: numeric.map((t) => ({ label: String(t.key).slice(0, 18), value: t.value })),
    });
  }
  if (matchedItems.length) {
    charts.push({
      type: 'hbar',
      title: 'Items matching your question',
      narrative: 'Ranked by how strongly each item matches terms in your question.',
      data: matchedItems.slice(0, 8).map((r, i) => ({
        label: labelOf(r.item).slice(0, 18),
        value: r.score || r.item.risk || r.item.count || Math.max(1, 10 - i),
      })),
    });
  }
  return charts;
}

function formatValue(v) {
  if (v == null) return '—';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/**
 * @param {string} question
 * @param {object} context
 * @param {string} [appId]
 */
export function answerVaultAskLocally(question, context = {}, appId = 'app') {
  const q = String(question || '').trim();
  const intent = intentOf(q);
  const tokens = tokensOf(q);
  const totals = context.totals || context.summary || {};
  const items = collectItems(context);
  const facts = flattenFacts(context);

  let matchedTotals = matchTotals(totals, tokens);
  let matchedItems = matchItems(items, tokens);
  const matchedFacts = matchFacts(facts, tokens);

  // If keyword filter found nothing, fall back to ranked hotspots / totals — but say so.
  const usedFallback = !matchedItems.length && !matchedTotals.length && !matchedFacts.length;
  if (!matchedTotals.length) {
    matchedTotals = matchTotals(totals, []);
  }
  if (!matchedItems.length) {
    matchedItems = matchItems(items, []);
  }

  const highlightEntries = {};
  matchedTotals.slice(0, 6).forEach((t) => {
    highlightEntries[t.key] = t.value;
  });
  if (matchedItems.length) highlightEntries.matchedItems = matchedItems.length;

  const directLines = [];
  if (intent === 'count') {
    const byStatus = totals.byStatus && typeof totals.byStatus === 'object' ? totals.byStatus : null;
    const statusToken = tokens.find((t) => byStatus && Object.keys(byStatus).some((k) => k.toLowerCase().includes(t)));
    if (byStatus && statusToken) {
      const key = Object.keys(byStatus).find((k) => k.toLowerCase().includes(statusToken));
      directLines.push(`**Direct answer:** **${byStatus[key]}** item(s) in status **${key}** (from live ${appId} byStatus).`);
      highlightEntries[key] = byStatus[key];
    } else {
      const countKey = matchedTotals.find((t) => typeof t.value === 'number');
      if (countKey) {
        directLines.push(`**Direct answer:** \`${countKey.key}\` = **${countKey.value}** (from live ${appId} totals).`);
      } else if (matchedItems.length) {
        directLines.push(`**Direct answer:** **${matchedItems.length}** matching item(s) in the current snapshot.`);
      } else {
        directLines.push('**Direct answer:** No countable field matched your question in the live context.');
      }
    }
  } else if (matchedItems.length && tokens.length && !usedFallback) {
    directLines.push(
      `**Direct answer:** Found **${matchedItems.length}** item(s) matching your question terms (${tokens.slice(0, 6).join(', ')}). Top: **${labelOf(matchedItems[0].item)}**${detailOf(matchedItems[0].item) ? ` — ${detailOf(matchedItems[0].item)}` : ''}.`,
    );
  } else if (matchedFacts.length) {
    const f = matchedFacts[0];
    directLines.push(`**Direct answer:** Closest field \`${f.path}\` = **${formatValue(f.value)}**.`);
  } else if (matchedTotals.length) {
    const t = matchedTotals[0];
    directLines.push(`**Direct answer (best available):** \`${t.key}\` = **${formatValue(t.value)}** from the live ${appId} snapshot.`);
  } else {
    directLines.push(
      '**Direct answer:** Live context does not contain enough structured fields to answer this precisely. Open the app views or re-ask after data loads.',
    );
  }

  if (usedFallback && tokens.length) {
    directLines.push(
      `_No exact keyword hits for (${tokens.slice(0, 8).join(', ')}); showing the strongest available snapshot for ${appId}._`,
    );
  }

  const listLines = matchedItems.slice(0, 8).map((r) => {
    const it = r.item;
    const d = detailOf(it);
    return `- **${labelOf(it)}**${d ? ` — ${d}` : ''}${it.status ? ` · ${it.status}` : ''}${it.who ? ` · ${it.who}` : ''}`;
  });

  const metricLines = matchedTotals.slice(0, 10).map((t) => `- **${t.key}**: ${formatValue(t.value)}`);

  const factLines = matchedFacts.slice(0, 6).map((f) => `- **${f.path}**: ${formatValue(f.value)}`);

  const sections = [
    {
      kind: 'informative',
      title: 'Answer to your question',
      narrative: directLines.join(' '),
    },
  ];

  if (listLines.length) {
    sections.push({
      kind: 'informative',
      title: tokens.length && !usedFallback ? 'Matching items' : 'Top items in scope',
      narrative: listLines.join('\n'),
    });
  }

  if (metricLines.length) {
    sections.push({
      kind: 'informative',
      title: 'Relevant metrics',
      narrative: metricLines.join('\n'),
    });
  }

  if (intent === 'predictive' || intent === 'general') {
    sections.push({
      kind: 'predictive',
      title: 'If this stays unchanged',
      narrative: matchedItems.length
        ? `Pressure around **${labelOf(matchedItems[0].item)}** and related items is most likely to compound over the next 1–2 weeks unless owners and dates are confirmed.`
        : 'Without clearer owners/dates on open work, silent slippage is the main near-term risk.',
    });
  }

  if (intent === 'prescriptive' || intent === 'diagnostic' || intent === 'general') {
    const actions = matchedItems.slice(0, 4).map((r, i) => `${i + 1}. Act on **${labelOf(r.item)}**${detailOf(r.item) ? ` (${detailOf(r.item)})` : ''}.`);
    if (!actions.length) {
      actions.push('1. Load or refresh app data, then re-ask with a named project, person, status, or metric.');
    } else {
      actions.push(`${actions.length + 1}. Re-ask with a narrower name/ID if you need a deeper drill-down.`);
    }
    sections.push({
      kind: 'prescriptive',
      title: 'What to do next',
      narrative: actions.join(' '),
    });
  }

  const charts = chartsFrom(matchedTotals, matchedItems, intent);

  const headline =
    intent === 'count' && matchedTotals.find((t) => typeof t.value === 'number')
      ? `${matchedTotals.find((t) => typeof t.value === 'number').key}: ${matchedTotals.find((t) => typeof t.value === 'number').value}`
      : matchedItems.length && tokens.length && !usedFallback
        ? `${matchedItems.length} match(es) for “${tokens.slice(0, 3).join(' ')}”`
        : matchedItems.length
          ? `Top focus: ${labelOf(matchedItems[0].item)}`
          : `Answer from ${appId} live data`;

  const markdown = [
    `### Answer to: “${q.slice(0, 180)}”`,
    '',
    ...directLines,
    '',
    listLines.length ? '#### Matching / top items\n' + listLines.join('\n') : '',
    metricLines.length ? '\n#### Metrics\n' + metricLines.join('\n') : '',
    factLines.length ? '\n#### Related fields\n' + factLines.join('\n') : '',
    '',
    `_Local query engine · intent=${intent} · ${appId}_`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ok: true,
    source: 'local',
    intent,
    headline,
    sections,
    charts,
    markdown,
    highlights: highlightEntries,
    proposedActions: matchedItems.slice(0, 5).map((r) => ({
      type: 'note',
      label: `Review: ${labelOf(r.item)}`,
      rationale: detailOf(r.item) || 'Matched your question',
      href: r.item.href || '',
    })),
    queryTokens: tokens,
  };
}
