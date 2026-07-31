import { ANTHROPIC_API_KEY } from './config.js';
import { answerAskDomain } from './askAi/router.js';

const MODEL = process.env.VAULT_ANALYTICS_MODEL || process.env.PRECON_ANALYTICS_MODEL || 'claude-sonnet-4-6';
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
  // Keep entity lookups — never drop focusedUnit / queryParse when truncating
  return {
    truncated: true,
    context: {
      ...(context && typeof context === 'object' ? context : {}),
      _truncated: true,
      _note: `Original context was ${raw.length} chars; prefer summary/totals fields.`,
      summary: context?.summary || context?.totals || context?.highlights || null,
      totals: context?.totals || null,
      highlights: context?.highlights || null,
      focusedUnit: context?.focusedUnit || null,
      queryParse: context?.queryParse || null,
      unitLookup: context?.unitLookup || null,
      hotItems: Array.isArray(context?.hotItems)
        ? context.hotItems.slice(0, 30)
        : Array.isArray(context?.items)
          ? context.items.slice(0, 30)
          : undefined,
    },
  };
}

/** Unit / entity answers must stay domain-locked — LLM often reverts to portfolio totals. */
function shouldSkipLlmForDomain(appId, context, local) {
  if (context?.focusedUnit) return true;
  if (context?.queryParse?.unitNumber && appId === 'post_sales') return true;
  if (local?.insufficientData && /unit not found/i.test(local?.headline || '')) return true;
  return false;
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
 * Always computes a query-grounded local answer; LLM (when available) must answer THAT question.
 */
export async function runVaultAnalyticsAsk({ appId, question, context, appLabel }) {
  const label = appLabel || APP_LABELS[appId] || appId || 'Golden Abodes app';
  const { context: ctx, truncated } = trimContext(context);
  const local = answerAskDomain(appId, String(question || '').trim(), ctx);

  // Phase 2: never call LLM when we refused for low-quality context
  if (local.refused) {
    return {
      ...local,
      skippedLlm: true,
      source: 'local',
      reason: 'Refused — context quality below Phase-2 threshold (no guessing)',
    };
  }

  if (shouldSkipLlmForDomain(appId, ctx, local)) {
    return {
      ...local,
      skippedLlm: true,
      source: 'local',
      reason: 'Domain engine locked for entity-specific question (unit/project focus)',
    };
  }

  if (!ANTHROPIC_API_KEY) {
    return {
      ...local,
      skippedLlm: true,
      source: 'local',
      reason: `Domain engine (${local.engine || 'local'}) · confidence=${local.confidence || 'n/a'} · ANTHROPIC_API_KEY not set`,
    };
  }

  const system = `You are the Golden Abodes Vault analytics advisor for "${label}" (appId=${appId || 'unknown'}).
You are a NARRATOR over verified evidence — not a free-form analyst.

HARD RULES:
1. Answer ONLY using DomainEvidence and Context JSON below. Never invent numbers, names, or projects.
2. The headline MUST answer the user's question directly.
3. First section title must be "Direct answer" and must include concrete numbers/names from DomainEvidence.
4. If DomainEvidence.insufficientData is true, say what is missing — do not pad with generic advice.
5. Every number you write must appear in DomainEvidence.metrics, DomainEvidence.evidence, or Context totals/hotItems.
6. Prefer DomainEvidence as the source of truth; refine wording only.

Return STRICT JSON only:
{
  "intent": "informative|predictive|prescriptive|diagnostic|count|general",
  "headline": "one clear sentence that answers the question",
  "highlights": { "Short KPI label": "value" },
  "sections": [
    { "kind": "informative", "title": "Direct answer", "narrative": "..." },
    { "kind": "predictive", "title": "...", "narrative": "..." },
    { "kind": "prescriptive", "title": "...", "narrative": "..." }
  ],
  "charts": [ { "type": "donut|bar|hbar", "title": "...", "narrative": "...", "data": [{"label":"A","value":1}] } ],
  "markdown": "opens with direct answer, then evidence",
  "proposedActions": [ { "type": "note", "label": "...", "rationale": "...", "href": "" } ]
}
Max 6 proposedActions. Max 3 charts. Never fabricate chart series.`;

  const user = `App: ${label} (${appId || ''})
Question:
${String(question || '').trim()}

DomainEvidence (AUTHORITATIVE — verify every claim against this):
${JSON.stringify({
    headline: local.headline,
    confidence: local.confidence,
    insufficientData: local.insufficientData,
    highlights: local.highlights,
    evidence: local.evidence,
    sections: local.sections,
    metrics: local.highlights,
    contextQuality: local.contextQuality,
  })}

Context JSON${truncated ? ' (truncated)' : ''}:
${JSON.stringify(ctx)}`;

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
      temperature: 0.1,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = raw?.error?.message || raw?.message || `Anthropic HTTP ${res.status}`;
    return {
      ...local,
      skippedLlm: true,
      source: 'local',
      reason: `LLM error (${res.status}): ${msg} — domain engine used`,
      warning: msg,
    };
  }

  const text = (raw.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const parsed = extractJsonBlock(text);
  if (!parsed?.markdown && !parsed?.sections?.length && !parsed?.headline) {
    return {
      ...local,
      source: 'llm',
      model: MODEL,
      markdown: text || local.markdown,
      warning: 'LLM returned unstructured text — showing domain evidence answer',
    };
  }

  return {
    ok: true,
    source: 'llm',
    model: MODEL,
    engine: local.engine,
    confidence: local.confidence,
    insufficientData: local.insufficientData,
    contextQuality: local.contextQuality,
    evidence: local.evidence,
    intent: parsed.intent || local.intent,
    headline: parsed.headline ? String(parsed.headline) : local.headline,
    sections: Array.isArray(parsed.sections) && parsed.sections.length ? parsed.sections.slice(0, 6) : local.sections,
    // Prefer domain charts/highlights — LLM often invents portfolio KPI strips
    charts: Array.isArray(local.charts) && local.charts.length
      ? local.charts
      : Array.isArray(parsed.charts) && parsed.charts.length
        ? parsed.charts.slice(0, 4)
        : [],
    markdown: String(parsed.markdown || local.markdown),
    highlights:
      local.highlights && typeof local.highlights === 'object' && Object.keys(local.highlights).length
        ? local.highlights
        : parsed.highlights && typeof parsed.highlights === 'object'
          ? parsed.highlights
          : {},
    proposedActions: Array.isArray(parsed.proposedActions) ? parsed.proposedActions.slice(0, 8) : local.proposedActions,
    roadmapVersion: local.roadmapVersion,
  };
}

export { APP_LABELS };
