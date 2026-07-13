/**
 * Enrich Ask context with question-specific DB lookups (Phase 2.1).
 */
import Unit from '../../models/postsales/Unit.js';
import Demand from '../../models/postsales/Demand.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Ticket from '../../models/postsales/Ticket.js';
import { computeUnitCumulative } from '../postsales/demandAmounts.js';
import { parsePostSalesEntityQuery, unitNumberMatches, escapeRe } from './parseEntityQuery.js';

function snip(s, n = 160) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function inr(n) {
  const v = Math.round(Number(n) || 0);
  return `₹${v.toLocaleString('en-IN')}`;
}

export async function lookupPostSalesFocusedUnit(question) {
  const parsed = parsePostSalesEntityQuery(question);
  if (!parsed.unitNumber && !parsed.project) return null;

  const filter = { overallStatus: { $ne: 'cancelled' } };
  if (parsed.project) {
    filter.project = new RegExp(escapeRe(parsed.project), 'i');
  }

  let candidates = await Unit.find(filter).populate('customerId').lean();
  if (parsed.unitNumber) {
    const hit = candidates.filter((u) => unitNumberMatches(u.unitNumber, parsed.unitNumber));
    if (!hit.length && parsed.project) {
      // retry without project filter if unit is unique globally
      const all = await Unit.find({ overallStatus: { $ne: 'cancelled' } }).populate('customerId').lean();
      candidates = all.filter((u) => unitNumberMatches(u.unitNumber, parsed.unitNumber));
    } else {
      candidates = hit;
    }
  }

  if (!candidates.length) {
    return {
      parsed,
      found: false,
      message: `No Post Sales unit matched${parsed.project ? ` project “${parsed.project}”` : ''}${
        parsed.unitNumber ? ` unit “${parsed.unitNumber}”` : ''
      }.`,
    };
  }

  // Prefer exact unit match; if multiple, prefer project match then first
  let unit = candidates[0];
  if (candidates.length > 1 && parsed.project) {
    const tighter = candidates.find((u) => new RegExp(escapeRe(parsed.project), 'i').test(u.project));
    if (tighter) unit = tighter;
  }

  const [demands, steps, tickets] = await Promise.all([
    Demand.find({ unitId: unit._id }).lean(),
    PipelineStep.find({ unitId: unit._id }).lean(),
    Ticket.find({ unitId: unit._id, status: { $nin: ['resolved', 'closed'] } }).lean(),
  ]);
  const asOf = new Date();
  const cum = computeUnitCumulative(demands, asOf);
  const outstanding = (cum.agreementPending || 0) + (cum.gstPending || 0);
  const collectPct =
    cum.agreementDue > 0 ? Math.round((cum.agreementReceived / cum.agreementDue) * 1000) / 10 : null;
  const slaSteps = steps.filter((s) => s.slaBreach || s.status === 'overdue');
  const customer =
    unit.customerId && typeof unit.customerId === 'object'
      ? unit.customerId.name || unit.customerId.fullName || unit.customerId.email || ''
      : '';

  const focusedUnit = {
    id: String(unit._id),
    project: unit.project,
    unitNumber: unit.unitNumber,
    building: unit.building || unit.tower || '',
    phase: unit.phase || '',
    status: unit.overallStatus,
    customer,
    salesExecutive: unit.salesExecutive || '',
    paymentPlan: unit.paymentPlan || '',
    totalCost: unit.totalCost || 0,
    bookingAmount: unit.bookingAmount || 0,
    agreementDue: cum.agreementDue,
    agreementReceived: cum.agreementReceived,
    agreementPending: cum.agreementPending,
    gstDue: cum.gstDue,
    gstReceived: cum.gstReceived,
    gstPending: cum.gstPending,
    totalOutstanding: outstanding,
    collectPct,
    slaBreaches: slaSteps.length,
    openTickets: tickets.length,
    currentStepNumber: unit.currentStepNumber,
    href: `/app/post-sales/units/${unit._id}`,
    detail: snip(
      `${unit.project} ${unit.unitNumber} · collected ${inr(cum.agreementReceived)} of ${inr(cum.agreementDue)} · outstanding ${inr(outstanding)}`,
    ),
  };

  return {
    parsed,
    found: true,
    focusedUnit,
    matchCount: candidates.length,
  };
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} appId
 * @param {string} question
 * @param {object} context
 */
export async function enrichAskContextForQuestion(db, appId, question, context) {
  const ctx = context && typeof context === 'object' ? { ...context } : {};
  const id = String(appId || '');

  if (id === 'post_sales') {
    try {
      const lookup = await lookupPostSalesFocusedUnit(question);
      if (lookup) {
        ctx.queryParse = lookup.parsed;
        ctx.focusedUnit = lookup.found ? lookup.focusedUnit : null;
        ctx.unitLookup = {
          found: lookup.found,
          message: lookup.message || '',
          matchCount: lookup.matchCount || 0,
        };
        if (lookup.found && lookup.focusedUnit) {
          // Put the focused unit at the front of evidence bags
          ctx.hotItems = [
            {
              title: `${lookup.focusedUnit.project} ${lookup.focusedUnit.unitNumber}`,
              detail: lookup.focusedUnit.detail,
              status: lookup.focusedUnit.status,
              risk: 10,
              href: lookup.focusedUnit.href,
              id: lookup.focusedUnit.id,
            },
            ...(Array.isArray(ctx.hotItems) ? ctx.hotItems : []),
          ].slice(0, 35);
        }
      }
    } catch (e) {
      ctx.unitLookupError = e?.message || String(e);
    }
  }

  return ctx;
}

export { inr };
