import { ANTHROPIC_API_KEY } from './config.js';

const MODEL =
  process.env.PRECON_GRAMMAR_MODEL ||
  process.env.PRECON_ANALYTICS_MODEL ||
  'claude-sonnet-4-20250514';
const MAX_TEXT = 8_000;

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
 * Locate each (original → suggestion) in text. Prefer later matches when applying
 * reverse order so overlapping edits stay stable.
 */
export function locateCorrections(text, items) {
  const source = String(text || '');
  const out = [];
  let searchFrom = 0;
  for (const item of items || []) {
    const original = String(item?.original ?? '');
    const suggestion = String(item?.suggestion ?? '');
    if (!original || suggestion === original) continue;
    const at = source.indexOf(original, searchFrom);
    const idx = at >= 0 ? at : source.indexOf(original);
    if (idx < 0) continue;
    const end = idx + original.length;
    const type = /spell/i.test(String(item.type || ''))
      ? 'spelling'
      : /punct/i.test(String(item.type || ''))
        ? 'punctuation'
        : 'grammar';
    out.push({
      start: idx,
      end,
      original,
      suggestion,
      type,
      message: String(item.message || item.reason || type).slice(0, 160),
    });
    searchFrom = end;
  }
  return out.slice(0, 40);
}

export function applyAllCorrections(text, corrections) {
  let next = String(text || '');
  const ordered = [...(corrections || [])].sort((a, b) => b.start - a.start);
  for (const c of ordered) {
    if (c.start < 0 || c.end > next.length) continue;
    if (next.slice(c.start, c.end) !== c.original) continue;
    next = `${next.slice(0, c.start)}${c.suggestion}${next.slice(c.end)}`;
  }
  return next;
}

/**
 * Context-aware grammar + spelling check (Gmail-style suggestions).
 */
export async function runPreconGrammarCheck({ text, field = 'comment', context = {} }) {
  const input = String(text || '').trim();
  if (!input) {
    return { ok: true, corrections: [], correctedText: '', unchanged: true };
  }
  if (input.length > MAX_TEXT) {
    const err = new Error(`Text too long (max ${MAX_TEXT} characters)`);
    err.status = 400;
    throw err;
  }
  if (!ANTHROPIC_API_KEY) {
    return {
      ok: true,
      skippedLlm: true,
      reason: 'ANTHROPIC_API_KEY not set on server',
      corrections: [],
      correctedText: input,
      unchanged: true,
    };
  }

  const projectName = String(context.projectName || '').slice(0, 120);
  const phaseName = String(context.phaseName || '').slice(0, 120);
  const taskName = String(context.taskName || '').slice(0, 200);
  const fieldLabel = field === 'nextAction' ? 'next action' : 'task comment';

  const system = [
    'You are a writing assistant like Gmail grammar & spelling correction.',
    'Fix grammar, spelling, punctuation, and awkward phrasing using context.',
    'Preserve meaning, names, project codes, dates, numbers, and technical terms.',
    'Do not invent facts. Prefer British/Indian English for construction site notes when ambiguous.',
    'Keep a professional but natural tone suitable for construction project updates.',
    'If the text is already correct, return an empty corrections array and the same correctedText.',
    'Respond with JSON only:',
    '{"correctedText":"...","corrections":[{"original":"...","suggestion":"...","type":"spelling|grammar|punctuation","message":"short reason"}]}',
    'Each correction.original must be an exact contiguous substring of the input text.',
    'List corrections in the order they appear in the input. Max 40 corrections.',
  ].join(' ');

  const user = [
    `Field: ${fieldLabel}`,
    projectName ? `Project: ${projectName}` : '',
    phaseName ? `Phase: ${phaseName}` : '',
    taskName ? `Task: ${taskName}` : '',
    '',
    'Text to proofread:',
    input,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1800,
      temperature: 0.1,
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

  const reply = (raw.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const parsed = extractJsonBlock(reply) || {};
  const llmCorrections = Array.isArray(parsed.corrections) ? parsed.corrections : [];
  let corrections = locateCorrections(input, llmCorrections);

  let correctedText = String(parsed.correctedText || '').trim();
  if (!correctedText) {
    correctedText = corrections.length ? applyAllCorrections(input, corrections) : input;
  }
  // Prefer applying located corrections so offsets stay consistent with UI.
  if (corrections.length) {
    const fromOffsets = applyAllCorrections(input, corrections);
    if (fromOffsets && fromOffsets !== input) correctedText = fromOffsets;
  }

  if (correctedText === input && !corrections.length) {
    return {
      ok: true,
      source: 'llm',
      model: MODEL,
      corrections: [],
      correctedText: input,
      unchanged: true,
    };
  }

  // If model returned a full rewrite but no locatable spans, expose one whole-text suggestion.
  if (!corrections.length && correctedText && correctedText !== input) {
    corrections = [
      {
        start: 0,
        end: input.length,
        original: input,
        suggestion: correctedText,
        type: 'grammar',
        message: 'Suggested rewrite',
      },
    ];
  }

  return {
    ok: true,
    source: 'llm',
    model: MODEL,
    corrections,
    correctedText,
    unchanged: correctedText === input && corrections.length === 0,
  };
}
