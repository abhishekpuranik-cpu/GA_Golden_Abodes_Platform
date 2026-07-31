import { ANTHROPIC_API_KEY } from './config.js';

/** Working Anthropic IDs for this account (claude-sonnet-4-20250514 returns 404). */
const MODEL =
  process.env.PRECON_GRAMMAR_MODEL ||
  process.env.PRECON_ANALYTICS_MODEL ||
  'claude-sonnet-4-6';
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

function tokenize(text) {
  return String(text || '').match(/\S+|\s+/g) || [];
}

/**
 * Token LCS diff → replace/delete spans in the original text.
 * Inserts alone are folded into the nearest replace when possible.
 */
export function diffToCorrections(original, corrected) {
  const a = tokenize(original);
  const b = tokenize(corrected);
  if (!a.length && !b.length) return [];
  if (String(original) === String(corrected)) return [];

  const n = a.length;
  const m = b.length;
  // Cap DP size for safety; fall back to whole-text replace.
  if (n * m > 250_000) {
    return [
      {
        start: 0,
        end: original.length,
        original,
        suggestion: corrected,
        type: 'grammar',
        message: 'Suggested rewrite',
      },
    ];
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? (dp[i + 1][j + 1] + 1) : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'eq', a: a[i], b: b[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'del', a: a[i] });
      i += 1;
    } else {
      ops.push({ op: 'ins', b: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ op: 'del', a: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ op: 'ins', b: b[j] });
    j += 1;
  }

  const corrections = [];
  let offset = 0;
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.op === 'eq') {
      offset += op.a.length;
      k += 1;
      continue;
    }
    let del = '';
    let ins = '';
    const start = offset;
    while (k < ops.length && ops[k].op !== 'eq') {
      if (ops[k].op === 'del') {
        del += ops[k].a;
        offset += ops[k].a.length;
      } else {
        ins += ops[k].b;
      }
      k += 1;
    }
    if (!del && !ins) continue;
    if (!del) {
      // Pure insert: attach to previous non-whitespace char if possible.
      if (corrections.length) {
        const prev = corrections[corrections.length - 1];
        prev.suggestion = `${prev.suggestion}${ins}`;
        prev.message = 'Wording';
        continue;
      }
      corrections.push({
        start: 0,
        end: Math.min(1, original.length) || 0,
        original: original.slice(0, Math.min(1, original.length)),
        suggestion: `${ins}${original.slice(0, Math.min(1, original.length))}`,
        type: 'grammar',
        message: 'Missing words',
      });
      continue;
    }
    const type = guessType(del, ins);
    corrections.push({
      start,
      end: start + del.length,
      original: del,
      suggestion: ins,
      type,
      message: type === 'spelling' ? 'Spelling' : type === 'punctuation' ? 'Punctuation' : 'Grammar',
    });
  }

  // Merge tiny adjacent corrections for cleaner UI.
  const merged = [];
  for (const c of corrections) {
    const prev = merged[merged.length - 1];
    if (prev && c.start <= prev.end + 1) {
      const gap = original.slice(prev.end, c.start);
      prev.original = `${prev.original}${gap}${c.original}`;
      prev.suggestion = `${prev.suggestion}${gap}${c.suggestion}`;
      prev.end = c.end;
      if (prev.type !== c.type) prev.type = 'grammar';
      prev.message = 'Grammar';
    } else {
      merged.push({ ...c });
    }
  }

  if (!merged.length && original !== corrected) {
    return [
      {
        start: 0,
        end: original.length,
        original,
        suggestion: corrected,
        type: 'grammar',
        message: 'Suggested rewrite',
      },
    ];
  }
  return merged.slice(0, 40);
}

function guessType(original, suggestion) {
  const o = String(original || '').replace(/\s+/g, '');
  const s = String(suggestion || '').replace(/\s+/g, '');
  if (!o || !s) return 'grammar';
  if (/^[\s.,;:!?'"()[\]{}-]+$/.test(original) || /^[\s.,;:!?'"()[\]{}-]+$/.test(suggestion)) {
    return 'punctuation';
  }
  if (o.length <= 18 && s.length <= 18) {
    const ol = o.toLowerCase();
    const sl = s.toLowerCase();
    if (ol !== sl && (ol.includes(sl) || sl.includes(ol) || levenshtein(ol, sl) <= 2)) {
      return 'spelling';
    }
  }
  return 'grammar';
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

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
 * Context-aware grammar + spelling check (Gmail-style).
 * Corrected full text is the source of truth; spans are derived by diff.
 */
export async function runPreconGrammarCheck({ text, field = 'comment', context = {} }) {
  // Keep exact text (do not trim) so offsets match the composer.
  const input = String(text ?? '');
  if (!input.trim()) {
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
    'You are Gmail-quality grammar and spelling correction for construction project comments.',
    'Your job is to produce the best corrected version of the text.',
    'Fix ALL issues: spelling, grammar, articles (a/an/the), verb tense, subject-verb agreement, missing words, word order, punctuation, capitalization, and awkward phrasing.',
    'Preserve meaning, people names, project names, codes, dates, numbers, and technical construction terms.',
    'Do not invent facts or add new information.',
    'Prefer clear professional Indian/British English.',
    'Keep a natural tone suitable for site / design coordination notes — not overly formal.',
    'If the text is already correct, return the same text.',
    'Return JSON only with this shape:',
    '{"correctedText":"...","summary":"short note of what changed"}',
    'correctedText must be the complete corrected comment, not a partial snippet.',
  ].join(' ');

  const user = [
    `Field: ${fieldLabel}`,
    projectName ? `Project: ${projectName}` : '',
    phaseName ? `Phase: ${phaseName}` : '',
    taskName ? `Task: ${taskName}` : '',
    '',
    'Correct the following text:',
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
      max_tokens: 2200,
      temperature: 0,
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
  let correctedText = String(parsed.correctedText ?? '').replace(/\r\n/g, '\n');
  if (!correctedText.trim() && reply && !reply.trim().startsWith('{')) {
    correctedText = reply;
  }
  if (!correctedText.trim()) correctedText = input;

  // Preserve trailing whitespace style from input when model strips it.
  if (input.endsWith('\n') && !correctedText.endsWith('\n')) {
    correctedText += '\n';
  }

  let corrections = diffToCorrections(input, correctedText);

  // Prefer LLM-provided spans only when they locate cleanly AND cover useful edits.
  const llmItems = Array.isArray(parsed.corrections) ? parsed.corrections : [];
  if (llmItems.length) {
    const located = locateCorrections(input, llmItems);
    if (located.length && applyAllCorrections(input, located) === correctedText) {
      corrections = located;
    }
  }

  if (correctedText === input) {
    return {
      ok: true,
      source: 'llm',
      model: MODEL,
      corrections: [],
      correctedText: input,
      unchanged: true,
      summary: parsed.summary || '',
    };
  }

  if (!corrections.length) {
    corrections = [
      {
        start: 0,
        end: input.length,
        original: input,
        suggestion: correctedText,
        type: 'grammar',
        message: String(parsed.summary || 'Suggested rewrite').slice(0, 160),
      },
    ];
  }

  return {
    ok: true,
    source: 'llm',
    model: MODEL,
    corrections,
    correctedText,
    unchanged: false,
    summary: String(parsed.summary || '').slice(0, 240),
  };
}
