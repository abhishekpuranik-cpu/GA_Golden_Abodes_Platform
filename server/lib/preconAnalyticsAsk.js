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
    projectBrief: context.projectBrief
      ? {
          ...context.projectBrief,
          missed: (context.projectBrief.missed || []).slice(0, 15),
          challenges: (context.projectBrief.challenges || []).slice(0, 12),
          horizons: {
            week: (context.projectBrief.horizons?.week || []).slice(0, 12),
            fortnight: (context.projectBrief.horizons?.fortnight || []).slice(0, 15),
            month: (context.projectBrief.horizons?.month || []).slice(0, 20),
          },
        }
      : undefined,
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
  for (const t of context?.projectBrief?.missed || []) {
    byTask.set(String(t.taskId), {
      taskId: t.taskId,
      phaseId: t.phaseId,
      projectId: context.projectBrief?.project?.id,
    });
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
      projId: a.projId || a.projectId || hit?.projectId || context?.projectBrief?.project?.id || '',
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
 * When preferNarrateOnly / lockFacts: LLM may only narrate; client keeps numbers.
 */
export async function runPreconAnalyticsAsk({
  question,
  context,
  localAnswer = null,
  preferNarrateOnly = false,
}) {
  if (!ANTHROPIC_API_KEY) {
    return {
      skippedLlm: true,
      source: 'local',
      reason: 'ANTHROPIC_API_KEY not set on server',
    };
  }

  const lockFacts = !!(preferNarrateOnly || localAnswer?.lockFacts);
  const { context: ctx, truncated } = trimContext(context);

  const system = lockFacts
    ? `You are the Golden Abodes PreConstruction narrative writer.
You receive a FACT-LOCKED project brief / evidence JSON already computed from the live app.
Your ONLY job is to write a clear executive narrative in plain English.

HARD RULES (anti-hallucination):
- Use ONLY facts present in the evidence / context JSON.
- Do NOT invent projects, tasks, dates, owners, percentages, or comments.
- Do NOT change any number. If a figure is missing, say it is not in the record.
- Do NOT add speculative causes unless the comment text itself states them — and then quote lightly.
- Prefer citing task names and dates that appear in evidence.missed, evidence.challenges, evidence.horizons.

Return STRICT JSON only:
{
  "intent": "project_brief",
  "headline": "one sentence that restates the locked headline facts (same numbers)",
  "narrative": "4-8 short paragraphs covering: current state, missed timelines, challenges from comments, next week / fortnight / month. No new metrics.",
  "markdown": "optional markdown version of narrative only"
}`
    : `You are the Golden Abodes PreConstruction analytics advisor.
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

  const userParts = [
    `Question:\n${String(question || '').trim()}`,
    localAnswer?.headline ? `\nLocked local headline:\n${localAnswer.headline}` : '',
    localAnswer?.evidence
      ? `\nFact-locked evidence JSON:\n${JSON.stringify(localAnswer.evidence).slice(0, 60_000)}`
      : '',
    `\nContext JSON${truncated ? ' (truncated)' : ''}:\n${JSON.stringify(ctx)}`,
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: lockFacts ? 1800 : 2500,
      temperature: lockFacts ? 0.1 : 0.2,
      system,
      messages: [{ role: 'user', content: userParts.filter(Boolean).join('\n') }],
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
  if (lockFacts) {
    const narrative =
      (parsed && (parsed.narrative || parsed.markdown)) ||
      text ||
      '';
    return {
      ok: true,
      source: 'llm',
      model: MODEL,
      intent: 'project_brief',
      narrateOnly: true,
      headline: localAnswer?.headline || String(parsed?.headline || ''),
      narrative: String(narrative).slice(0, 8000),
      markdown: String(parsed?.markdown || narrative || '').slice(0, 8000),
      sections: [],
      charts: [],
      highlights: localAnswer?.highlights || {},
      proposedActions: [],
    };
  }

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
