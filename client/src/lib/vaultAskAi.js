/**
 * Shared Vault Ask AI client + local fallback (structured + charts).
 */

import { chartsFromContext } from './askCharts.js';

export const VAULT_ASK_EXAMPLES = {
  default: [
    'What are the biggest risks right now?',
    'What should leadership prioritize this week?',
    'Predict what will slip in the next 14 days.',
    'Summarize health and prescribe next actions.',
  ],
  hiring: [
    'Which requisitions are stuck and why?',
    'Where is the hiring funnel bottleneck?',
    'Who needs interview slots this week?',
  ],
  post_sales: [
    'Which units are blocked in the pipeline?',
    'Where are CLP / demand delays?',
    'What should ops clear first this week?',
  ],
  dm_spv_governance: [
    'What are the top business health exceptions?',
    'Which SPVs or projects need attention?',
    'Prescribe actions for DM billing risks.',
  ],
  v1_cashflow: [
    'What is the cash position and main pressure points?',
    'Which projects have collection or payable risk?',
    'Predict near-term cash squeeze scenarios.',
  ],
  vault: [
    'Across my apps, what needs attention today?',
    'Where are the cross-app bottlenecks?',
    'Prescribe a leadership focus list for this week.',
  ],
};

export function localVaultAskAnswer(question, context, appId) {
  const q = String(question || '').trim();
  const totals = context?.totals || context?.summary || {};
  const items = context?.hotItems || context?.items || context?.risks || [];
  const charts = chartsFromContext(context);

  const highlightEntries = {};
  Object.entries(totals).forEach(([k, v]) => {
    if (typeof v === 'number' || (typeof v === 'string' && String(v).length < 24)) {
      highlightEntries[k] = v;
    }
  });

  const sections = [
    {
      kind: 'informative',
      title: 'What the data shows',
      narrative: Object.keys(totals).length
        ? `Live ${appId || 'app'} snapshot has ${Object.keys(totals).length} summary fields and ${items.length} hotspot item(s). Review the charts for the mix, then the hotspot list for named pressure points.`
        : 'Limited structured totals were available in context. Open the app data views for fuller detail, or re-ask after data loads.',
    },
    {
      kind: 'predictive',
      title: 'What is likely to worsen',
      narrative: items.length
        ? `Without intervention, the top hotspots (${items
            .slice(0, 3)
            .map((it) => it.title || it.name || 'item')
            .join(', ')}) are the most likely to create further delay or cost pressure over the next 1–2 weeks.`
        : 'No strong hotspot list was present — risk of silent slippage if owners and dates stay unclear.',
    },
    {
      kind: 'prescriptive',
      title: 'What to do next',
      narrative:
        '1) Clear or reassign the top hotspots. 2) Confirm owners and next-action dates. 3) Re-ask with a narrower project/scope for a deeper action plan.',
    },
  ];

  const mdParts = [
    `### Answer (local · ${appId || 'app'})`,
    '',
    '#### Snapshot',
    Object.keys(totals).length
      ? Object.entries(totals)
          .slice(0, 12)
          .map(([k, v]) => `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join('\n')
      : '_No structured totals in context._',
  ];
  if (items.length) {
    mdParts.push('', '#### Hotspots');
    items.slice(0, 8).forEach((it) => {
      const label = it.title || it.name || it.label || it.id || 'Item';
      const detail = it.detail || it.reason || it.status || '';
      mdParts.push(`- **${label}**${detail ? ` — ${detail}` : ''}`);
    });
  }
  mdParts.push('', '#### Recommended focus', sections[2].narrative);
  if (q) mdParts.push('', `_Question received: “${q.slice(0, 200)}”_`);
  mdParts.push('', '_Local analytics engine (set ANTHROPIC_API_KEY on server for full LLM answers)._');

  return {
    ok: true,
    source: 'local',
    intent: 'general',
    headline: items.length ? `Focus on ${items.length} hotspot(s) in ${appId || 'this app'}` : `Health check · ${appId || 'app'}`,
    sections,
    charts,
    markdown: mdParts.join('\n'),
    highlights: highlightEntries,
    proposedActions: (items || []).slice(0, 4).map((it) => ({
      type: 'note',
      label: `Review: ${it.title || it.name || it.label || 'item'}`,
      rationale: it.detail || it.reason || 'Flagged in local context',
      href: it.href || '',
    })),
  };
}

export async function askVaultAi({
  appId,
  question,
  context,
  appLabel,
  signal,
}) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, error: 'Enter a question', source: 'none' };
  const local = localVaultAskAnswer(q, context || {}, appId);

  try {
    const res = await fetch('/api/vault/analytics-ask', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ appId, question: q, context: context || {}, appLabel }),
    });

    if (res.status === 401 || res.status === 403) {
      return { ...local, warning: 'Not authorized for AI assist — showing local analytics.' };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ...local, warning: data.error || `AI unavailable (${res.status}) — local answer shown.` };
    }
    if (data.skippedLlm || data.source === 'local') {
      return { ...local, warning: data.reason || 'AI key not configured — local engine used.', llmAvailable: false };
    }

    const charts = Array.isArray(data.charts) && data.charts.length ? data.charts : local.charts;
    const sections = Array.isArray(data.sections) && data.sections.length ? data.sections : local.sections;

    return {
      ok: true,
      source: data.source || 'llm',
      intent: data.intent || local.intent,
      headline: data.headline || local.headline,
      sections,
      charts,
      markdown: data.markdown || local.markdown,
      highlights: data.highlights && Object.keys(data.highlights).length ? data.highlights : local.highlights,
      proposedActions: Array.isArray(data.proposedActions) ? data.proposedActions : local.proposedActions,
      model: data.model || '',
      llmAvailable: true,
    };
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return { ...local, warning: e?.message || 'Network error — local analytics shown.' };
  }
}
