/**
 * Domain Ask AI router â€” picks the right engine per appId.
 * Phase 2: hard-refuse when context quality is below threshold.
 */
import { ASK_AI_ROADMAP_VERSION } from './roadmap.js';
import { scoreAskContext, shouldRefuseAskContext } from './contextQuality.js';
import { answerCashflow } from './domain/cashflow.js';
import { answerHiring } from './domain/hiring.js';
import { answerPostSales } from './domain/postSales.js';
import { answerFinance, answerMarketing } from './domain/finance.js';
import { answerDm, answerExecution, answerPrecon } from './domain/dmExecutionPrecon.js';
import { packAnswer } from './domain/_shared.js';
import { answerVaultAskLocally as answerGeneric } from '../vaultAskLocalEngine.js';

const DOMAIN = {
  v1_cashflow: answerCashflow,
  hiring: answerHiring,
  post_sales: answerPostSales,
  finance_kpi: answerFinance,
  finance_kpi_admin: answerFinance,
  marketing_kpi: answerMarketing,
  dm_spv_governance: answerDm,
  execution: answerExecution,
  preconstruction: answerPrecon,
};

function refuseAnswer(appId, question, quality) {
  const reasons = quality?.reasons?.join(', ') || 'insufficient live evidence';
  return {
    ...packAnswer({
      appId: appId || 'app',
      question,
      intent: 'general',
      headline: 'Cannot answer reliably â€” insufficient live data',
      direct: `**Cannot answer reliably:** context quality is **${quality?.score ?? 0}/100** (${reasons}). The server did not receive enough real metrics/evidence to answer â€œ${String(question || '').slice(0, 120)}â€ without guessing. Open the app so data loads, then re-ask â€” or ask inside an app with live boards (Cashflow, Hiring, Post Sales, PreConstruction, DM).`,
      evidence: [],
      metrics: { contextQuality: quality?.score ?? 0 },
      actions: [
        'Open the target app and wait for data to finish loading',
        'Re-ask with a named project, person, or metric',
      ],
      confidence: 'refused',
      insufficientData: true,
    }),
    refused: true,
    source: 'local',
    engine: 'refuse',
    contextQuality: quality,
    roadmapVersion: ASK_AI_ROADMAP_VERSION,
  };
}

/**
 * @param {string} appId
 * @param {string} question
 * @param {object} context
 */
export function answerAskDomain(appId, question, context) {
  const quality = scoreAskContext(context);
  const id = String(appId || '');

  if (shouldRefuseAskContext(quality)) {
    return refuseAnswer(id, question, quality);
  }

  const fn = DOMAIN[id];
  let answer;
  if (fn) {
    answer = fn(question, context || {});
  } else {
    answer = answerGeneric(question, context || {}, id || 'app');
    answer.engine = answer.engine || 'generic';
  }

  if (quality.level === 'low') {
    answer.confidence = answer.confidence === 'high' ? 'medium' : answer.confidence || 'low';
    answer.insufficientData = true;
    answer.warning =
      answer.warning ||
      `Context quality is modest (${quality.score}/100: ${quality.reasons.join(', ') || 'thin data'}). Treat as provisional.`;
  }

  return {
    ...answer,
    refused: false,
    contextQuality: quality,
    roadmapVersion: ASK_AI_ROADMAP_VERSION,
  };
}

export function hasDomainEngine(appId) {
  return !!DOMAIN[String(appId || '')];
}

