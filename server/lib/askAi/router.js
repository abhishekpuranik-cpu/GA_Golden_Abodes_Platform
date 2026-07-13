/**
 * Domain Ask AI router — picks the right engine per appId.
 */
import { ASK_AI_ROADMAP_VERSION } from './roadmap.js';
import { scoreAskContext } from './contextQuality.js';
import { answerCashflow } from './domain/cashflow.js';
import { answerHiring } from './domain/hiring.js';
import { answerPostSales } from './domain/postSales.js';
import { answerFinance, answerMarketing } from './domain/finance.js';
import { answerVaultAskLocally as answerGeneric } from '../vaultAskLocalEngine.js';

const DOMAIN = {
  v1_cashflow: answerCashflow,
  hiring: answerHiring,
  post_sales: answerPostSales,
  finance_kpi: answerFinance,
  finance_kpi_admin: answerFinance,
  marketing_kpi: answerMarketing,
};

/**
 * @param {string} appId
 * @param {string} question
 * @param {object} context
 */
export function answerAskDomain(appId, question, context) {
  const quality = scoreAskContext(context);
  const id = String(appId || '');
  const fn = DOMAIN[id];

  let answer;
  if (fn) {
    answer = fn(question, context || {});
  } else {
    answer = answerGeneric(question, context || {}, id || 'app');
    answer.engine = answer.engine || 'generic';
  }

  // Honest low-quality gate
  if (quality.level === 'low') {
    answer.confidence = 'low';
    answer.insufficientData = true;
    answer.warning =
      answer.warning ||
      `Context quality is low (${quality.score}/100: ${quality.reasons.join(', ') || 'thin data'}). Answer may be incomplete — open the app and re-ask after data loads.`;
    if (!answer.sections?.some((s) => /limitation|Direct answer/i.test(s.title || ''))) {
      answer.sections = [
        {
          kind: 'informative',
          title: 'Data limitation',
          narrative: answer.warning,
        },
        ...(answer.sections || []),
      ];
    }
  }

  return {
    ...answer,
    contextQuality: quality,
    roadmapVersion: ASK_AI_ROADMAP_VERSION,
  };
}

export function hasDomainEngine(appId) {
  return !!DOMAIN[String(appId || '')];
}
