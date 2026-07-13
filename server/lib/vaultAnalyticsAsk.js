import { ANTHROPIC_API_KEY } from './config.js';

const MODEL = process.env.VAULT_ANALYTICS_MODEL || process.env.PRECON_ANALYTICS_MODEL || 'claude-sonnet-4-20250514';
const MAX_CONTEXT_CHARS = 100_000;

const APP_LABELS = {
  preconstruction: 'PreConstruction',
  post_sales: 'Post Sales Operations',
  hiring: 'Hiring & Sourcing',
  dm_spv_governance: 'Business Health / DM Governance',
  v1_cashflow: 'Cashflow V1',
  v2_resource_planner: 'Resource Planner V2',
  v3_org_planner: 'Org / Project Acquisition V3',
  v3_project_acquisition: 'Org / Project Acquisition V3',
  sales_dashboard: 'Sales Dashboard',
  marketing_kpi: 'Marketing & Sales KPI',
  finance_kpi: 'Finance KPI',
  execution: 'Construction Execution',
  vault: 'App Vault (cross-app)',
};

function trimContext(context) {
  const raw = JSON.stringify(context || {});
  if (raw.length <= MAX_CONTEXT_CHARS) return { context, truncated: false };
  return {
    truncated: true,
    context: {
      ...(context && typeof context === 'object' ? context : {}),
      _truncated: true,
      _note: `Original context was ${raw.length} chars; prefer summary/totals fields.`,
      summary: context?.summary || context?.totals || context?.highlights || null,
      highlights: context?.highlights || null,
      hotItems: Array.isArray(context?.hotItems)
        ? context.hotItems.slice(0, 30)
        : Array.isArray(context?.items)
          ? context.items.slice(0, 30)
          : undefined,
    },
  };
}

function extractJsonBlock(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* continue */
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Generic Vault Ask AI — grounded context + optional Anthropic.
 */
export async function runVaultAnalyticsAsk({ appId, question, context, appLabel }) {
  if (!ANTHROPIC_API_KEY) {
    return {
      skippedLlm: true,
      source: 'local',
      reason: 'ANTHROPIC_API_KEY not set on server',
    };
  }

  const label = appLabel || APP_LABELS[appId] || appId || 'Golden Abodes app';
  const { context: ctx, truncated } = trimContext(context);

  const system = `You are the Golden Abodes Vault analytics advisor for "${label}" (appId=${appId || 'unknown'}).
Answer ONLY from the provided JSON context (live app data). Never invent IDs, amounts, people, or projects.
Be insightful across Informative, Predictive, and Prescriptive lenses.
If the question is vague, give the most valuable executive answer from the data.
India real-estate / GA operating context.

CRITICAL OUTPUT SHAPE — return STRICT JSON only:
{
  "intent": "informative|predictive|prescriptive|diagnostic|general",
  "headline": "one clear sentence verdict",
  "highlights": { "Short KPI label": "value", "Another": "value" },
  "sections": [
    { "kind": "informative", "title": "...", "narrative": "2-4 sentences explaining what the data shows" },
    { "kind": "predictive", "title": "...", "narrative": "2-4 sentences on what will worsen if unchanged" },
    { "kind": "prescriptive", "title": "...", "narrative": "2-4 sentences with concrete next actions" }
  ],
  "charts": [
    {
      "type": "donut|bar|hbar",
      "title": "chart title",
      "narrative": "1-2 sentences explaining how to read this chart and what insight it supports",
      "unit": "optional unit",
      "data": [ { "label": "A", "value": 12 }, { "label": "B", "value": 5 } ]
    }
  ],
  "markdown": "full scannable markdown narrative (headings + bullets) that ties charts and sections together",
  "proposedActions": [
    {
      "type": "navigate|open|note",
      "label": "short UI label",
      "rationale": "why",
      "href": "optional path"
    }
  ]
}
Chart rules:
- Include 1–3 charts when numeric or categorical data exists in context (totals, byStatus, hotItems, workload).
- Every chart MUST have a narrative (not just a title).
- Use only numbers present in context (or simple counts derived from listed items). Never fabricate series.
- Prefer donut for mix/share, hbar for ranked hotspots, bar for comparisons.
- Max 6 proposedActions. If unsure, return [].`;

  const user = `App: ${label} (${appId || ''})\nQuestion:\n${String(question || '').trim()}\n\nContext JSON${truncated ? ' (truncated)' : ''}:\n${JSON.stringify(ctx)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = raw?.error?.message || raw?.message || `Anthropic HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const text = (raw.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const parsed = extractJsonBlock(text);
  if (!parsed?.markdown && !parsed?.sections?.length && !parsed?.headline) {
    return {
      ok: true,
      source: 'llm',
      model: MODEL,
      intent: 'general',
      headline: '',
      sections: [],
      charts: [],
      markdown: text || '_No answer returned._',
      highlights: {},
      proposedActions: [],
    };
  }

  return {
    ok: true,
    source: 'llm',
    model: MODEL,
    intent: parsed.intent || 'general',
    headline: parsed.headline ? String(parsed.headline) : '',
    sections: Array.isArray(parsed.sections) ? parsed.sections.slice(0, 6) : [],
    charts: Array.isArray(parsed.charts) ? parsed.charts.slice(0, 4) : [],
    markdown: String(parsed.markdown || ''),
    highlights: parsed.highlights && typeof parsed.highlights === 'object' ? parsed.highlights : {},
    proposedActions: Array.isArray(parsed.proposedActions) ? parsed.proposedActions.slice(0, 8) : [],
  };
}

export { APP_LABELS };
