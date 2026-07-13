/**
 * Shared Vault Ask AI client + local fallback (query-grounded).
 */

import { answerVaultAskLocally } from './vaultAskLocalEngine.js';

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
  return answerVaultAskLocally(question, context || {}, appId);
}

function mergeAnswer(preferred, fallback) {
  if (!preferred || typeof preferred !== 'object') return fallback;
  return {
    ok: true,
    source: preferred.source || fallback.source,
    intent: preferred.intent || fallback.intent,
    headline: preferred.headline || fallback.headline,
    sections: Array.isArray(preferred.sections) && preferred.sections.length ? preferred.sections : fallback.sections,
    charts: Array.isArray(preferred.charts) && preferred.charts.length ? preferred.charts : fallback.charts,
    markdown: preferred.markdown || fallback.markdown,
    highlights:
      preferred.highlights && typeof preferred.highlights === 'object' && Object.keys(preferred.highlights).length
        ? preferred.highlights
        : fallback.highlights,
    proposedActions: Array.isArray(preferred.proposedActions) ? preferred.proposedActions : fallback.proposedActions,
    model: preferred.model || '',
    warning: preferred.warning || preferred.reason || fallback.warning,
    llmAvailable: preferred.llmAvailable,
    queryTokens: preferred.queryTokens || fallback.queryTokens,
    contextHydrated: preferred.contextHydrated,
    contextHotCount: preferred.contextHotCount,
    contextTotals: preferred.contextTotals,
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

    // Server may return a full grounded local answer when LLM is off — prefer it.
    if (data.skippedLlm || data.source === 'local') {
      const merged = mergeAnswer(data, local);
      return {
        ...merged,
        source: 'local',
        warning: data.reason || 'Local query engine used (LLM key not configured or skipped).',
        llmAvailable: false,
      };
    }

    return {
      ...mergeAnswer(data, local),
      source: data.source || 'llm',
      llmAvailable: true,
      model: data.model || '',
    };
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return { ...local, warning: e?.message || 'Network error — local analytics shown.' };
  }
}
