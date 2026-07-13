import { ANTHROPIC_API_KEY } from './config.js';

const MODEL = process.env.PRECON_ANALYTICS_MODEL || 'claude-sonnet-4-20250514';
const MAX_CONTEXT_CHARS = 90_000;

function trimContext(context) {
  const raw = JSON.stringify(context || {});
  if (raw.length <= MAX_CONTEXT_CHARS) return { context, truncated: false };
  const slim = {
    ...context,
    hotTasks: (context.hotTasks || []).slice(0, 25),
    workload: (context.workload || []).slice(0, 15),
    phaseRollup: (context.phaseRollup || []).slice(0, 12),
    projects: (context.projects || []).map((p) => ({
      ...p,
      topRisks: (p.topRisks || []).slice(0, 5),
    })),
  };
  return { context: slim, truncated: true };
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

function normalizeActions(list, context) {
  const byTask = new Map();
  for (const t of context?.hotTasks || []) {
    byTask.set(String(t.taskId), t);
  }
  const out = [];
  for (const a of list || []) {
    if (!a || typeof a !== 'object') continue;
    const type = String(a.type || '').trim();
    if (!['openProject', 'markDone', 'setTaskStatus', 'updTask', 'addComment'].includes(type)) {
      continue;
    }
    const taskId = a.tId || a.taskId;
    const hit = taskId ? byTask.get(String(taskId)) : null;
    out.push({
      type,
      label: String(a.label || a.title || type).slice(0, 160),
      rationale: String(a.rationale || a.reason || '').slice(0, 240),
      projId: a.projId || a.projectId || hit?.projectId || '',
      phId: a.phId || a.phaseId || hit?.phaseId || '',
      tId: taskId || hit?.taskId || '',
      fields: a.fields && typeof a.fields === 'object' ? a.fields : undefined,
      status: a.status,
      comment: a.comment && typeof a.comment === 'object' ? a.comment : undefined,
      openProject: a.openProject !== false,
    });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Call Anthropic with grounded PreConstruction context.
 * Returns { skippedLlm, reason } when no key.
 */
export async function runPreconAnalyticsAsk({ question, context }) {
  if (!ANTHROPIC_API_KEY) {
    return {
      skippedLlm: true,
      source: 'local',
      reason: 'ANTHROPIC_API_KEY not set on server',
    };
  }

  const { context: ctx, truncated } = trimContext(context);
  const system = `You are the Golden Abodes PreConstruction analytics advisor.
Answer ONLY from the provided JSON context (live app data). Never invent projects, tasks, dates, or people.
India real-estate pre-construction context.

CRITICAL — ANSWER THE USER'S QUESTION:
- headline MUST directly answer the specific question (not a generic portfolio health line).
- First section MUST be a Direct answer with named projects/tasks/people from context.
- If they named a person, project, phase, or status, filter to that evidence first.
- If data is missing, say what is missing and what IS known.

Return STRICT JSON only:
{
  "intent": "informative|predictive|prescriptive|diagnostic|general",
  "headline": "one clear sentence verdict",
  "highlights": { "overdue": number, "nextActionOverdue": number, "complianceBreaches": number, "hotCount": number },
  "sections": [
    { "kind": "informative", "title": "...", "narrative": "2-4 sentences" },
    { "kind": "predictive", "title": "...", "narrative": "2-4 sentences" },
    { "kind": "prescriptive", "title": "...", "narrative": "2-4 sentences with concrete actions" }
  ],
  "charts": [
    {
      "type": "donut|bar|hbar",
      "title": "chart title",
      "narrative": "1-2 sentences explaining the chart insight",
      "unit": "",
      "data": [ { "label": "A", "value": 3 }, { "label": "B", "value": 5 } ]
    }
  ],
  "markdown": "full scannable markdown tying charts + sections together",
  "proposedActions": [
    {
      "type": "openProject|markDone|setTaskStatus|updTask|addComment",
      "label": "short UI label",
      "rationale": "why",
      "projId": "",
      "phId": "",
      "tId": "",
      "fields": { "status": "inprogress" },
      "openProject": true
    }
  ]
}
Chart rules: 1–3 charts from context.totals / hotTasks / workload only. Every chart needs a narrative. Prefer donut for status mix, hbar for ranked risks.
ProposedActions: only grounded hotTasks ids; max 6.`;

  const user = `Question:\n${String(question || '').trim()}\n\nContext JSON${truncated ? ' (truncated)' : ''}:\n${JSON.stringify(ctx)}`;

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
      highlights: ctx.totals
        ? {
            overdue: ctx.totals.overdue || 0,
            nextActionOverdue: ctx.totals.nextActionOverdue || 0,
            complianceBreaches: ctx.totals.complianceBreaches || 0,
            hotCount: (ctx.hotTasks || []).length,
          }
        : {},
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
    highlights: parsed.highlights || {},
    proposedActions: normalizeActions(parsed.proposedActions, ctx),
  };
}
