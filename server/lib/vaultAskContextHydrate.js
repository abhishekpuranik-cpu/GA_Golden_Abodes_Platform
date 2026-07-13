/**
 * Hydrate Ask AI context from Mongo app_states when the client sent thin/wrong shape.
 * Ensures local engine + LLM see real portfolio facts.
 */

import {
  loadCashflowEnvelope,
  loadFinanceKpiState,
  loadMarketingKpiState,
  loadV2PlannerState,
  loadV3PlannerState,
} from './dmGovernance/integrations/appStateReader.js';
import { mergeAskContexts, scoreAskContext } from './askAi/contextQuality.js';

function snip(s, n = 140) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function isThinAskContext(context) {
  if (!context || typeof context !== 'object') return true;
  const totals = context.totals || context.summary || {};
  const keys = Object.keys(totals);
  const items = context.hotItems || context.hotTasks || context.items || [];
  if (Array.isArray(items) && items.length >= 3) return false;
  if (keys.length >= 5 && keys.some((k) => typeof totals[k] === 'number' && totals[k] > 0)) return false;
  // Classic bad payloads
  if (totals.keysLoaded != null && (!items.length || items.every((it) => /localStorage|snapshot|ga_/i.test(String(it.title || it.detail || ''))))) {
    return true;
  }
  if (keys.length <= 2 && (!items || !items.length)) return true;
  return false;
}

function cashflowFromEnvelope(envelope) {
  const data = envelope?.data && typeof envelope.data === 'object' ? envelope.data : {};
  const manual = Array.isArray(envelope?.manualProjs) ? envelope.manualProjs : [];
  const ids = new Set([...Object.keys(data), ...manual.map((p) => p?.id).filter(Boolean)]);
  const nameById = new Map(manual.map((p) => [String(p.id), p.name || p.id]));

  const totals = {
    projects: 0,
    unitsSold: 0,
    unsoldUnits: 0,
    collectionsTtd: 0,
    agreementPendingUnits: 0,
    paymentIssueUnits: 0,
    actualsRows: 0,
  };
  const hotItems = [];

  for (const pid of ids) {
    const cfg = data[pid];
    if (!cfg || typeof cfg !== 'object') continue;
    totals.projects += 1;
    const units = Array.isArray(cfg.units) ? cfg.units : [];
    const unsold = Array.isArray(cfg.unsoldUnits) ? cfg.unsoldUnits : [];
    const actuals = Array.isArray(cfg.actuals) ? cfg.actuals : [];
    totals.unitsSold += units.length;
    totals.unsoldUnits += unsold.length;
    totals.actualsRows += actuals.length;

    let collections = 0;
    let agreementPending = 0;
    let payIssues = 0;
    for (const u of units) {
      collections += Number(u.receivedToDate || u.collected || 0) || 0;
      const st = String(u.paymentStatus || u.payStatus || '').toLowerCase();
      if (st.includes('agreement')) agreementPending += 1;
      else if (st && st !== 'ok' && st !== 'clear' && st !== 'paid') payIssues += 1;
    }
    totals.collectionsTtd += collections;
    totals.agreementPendingUnits += agreementPending;
    totals.paymentIssueUnits += payIssues;

    const name = nameById.get(String(pid)) || cfg.projName || pid;
    const risk = agreementPending * 2 + payIssues * 3 + (unsold.length > units.length ? 2 : 0);
    hotItems.push({
      title: String(name),
      detail: snip(
        `sold ${units.length}, unsold ${unsold.length}, collected ₹${Math.round(collections)}, agreement pending ${agreementPending}, pay issues ${payIssues}, actuals ${actuals.length}`,
      ),
      status: payIssues ? 'payment_risk' : agreementPending ? 'agreement_pending' : 'ok',
      risk,
      projectId: pid,
    });
  }

  hotItems.sort((a, b) => (b.risk || 0) - (a.risk || 0));
  return {
    generatedAt: new Date().toISOString(),
    app: 'v1_cashflow',
    source: 'mongo_hydrate',
    totals,
    hotItems: hotItems.slice(0, 30),
    projects: hotItems.slice(0, 30),
  };
}

function financeFromBlob(blob) {
  const S = blob || {};
  const today = new Date().toISOString().slice(0, 10);
  const fyStart = `${new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0)}-04-01`;
  const compliance = Array.isArray(S.compliance) ? S.compliance : [];
  const overdue = compliance.filter((c) => !c.actual && c.due && c.due < today && c.due >= fyStart);
  const next14 = compliance.filter((c) => {
    if (c.actual || !c.due) return false;
    const d = (new Date(c.due) - new Date(today)) / 86400000;
    return d >= 0 && d <= 14;
  });
  const openRa = (S.raBills || []).filter((b) => !b.paymentDate);
  const hotItems = [
    ...overdue.slice(0, 15).map((c) => ({
      title: c.obligation || 'Filing',
      detail: snip(`OVERDUE · due ${c.due} · ${c.authority || ''}`),
      status: 'overdue',
      risk: 10,
    })),
    ...next14.slice(0, 10).map((c) => ({
      title: c.obligation || 'Filing',
      detail: snip(`Due ${c.due} · ${c.authority || ''}`),
      status: 'due_soon',
      risk: 7,
    })),
    ...openRa.slice(0, 10).map((b) => ({
      title: b.vendor || b.billNo || 'RA bill',
      detail: snip(`Open RA · ${b.amount != null ? b.amount : ''} · ${b.project || ''}`),
      status: 'ra_open',
      risk: 6,
    })),
  ];
  return {
    generatedAt: new Date().toISOString(),
    app: 'finance_kpi',
    source: 'mongo_hydrate',
    totals: {
      overdueCompliance: overdue.length,
      dueNext14: next14.length,
      openRaBills: openRa.length,
      complianceRows: compliance.length,
      employees: (S.employees || []).filter((e) => e.active !== false).length,
      corrections: (S.corrections || []).length,
    },
    hotItems: hotItems.slice(0, 30),
  };
}

function marketingFromBlob(blob) {
  const leads = Array.isArray(blob?.leads) ? blob.leads : Array.isArray(blob) ? blob : [];
  const byStatus = {};
  const byOwner = {};
  const bySource = {};
  const hotItems = [];
  for (const L of leads) {
    const st = String(L.status || L.stage || L.leadStage || 'unknown');
    const owner = String(L.owner || L.employee || L.Employees || 'unassigned');
    const src = String(L.source || L.sourceName || L['Source Name'] || 'unknown');
    byStatus[st] = (byStatus[st] || 0) + 1;
    byOwner[owner] = (byOwner[owner] || 0) + 1;
    bySource[src] = (bySource[src] || 0) + 1;
  }
  const stale = leads
    .filter((L) => /new|follow|callback|warm/i.test(String(L.status || L.stage || '')))
    .slice(0, 20);
  for (const L of stale) {
    hotItems.push({
      title: L.name || L.firstName || L['First Name'] || L.phone || 'Lead',
      detail: snip(`${L.status || L.stage || ''} · ${L.owner || L.employee || ''} · ${L.source || L.sourceName || ''}`),
      status: L.status || L.stage || '',
      risk: 5,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    app: 'marketing_kpi',
    source: 'mongo_hydrate',
    totals: {
      leads: leads.length,
      statuses: Object.keys(byStatus).length,
      owners: Object.keys(byOwner).length,
      sources: Object.keys(bySource).length,
      byStatus,
      byOwner,
      bySource,
    },
    hotItems: hotItems.slice(0, 30),
  };
}

function plannerFromState(appId, state) {
  const projects = state?.projects || [];
  const hotItems = projects.slice(0, 25).map((p) => ({
    title: p.name || p.title || p.id || 'Project',
    detail: snip([p.status, p.loc, p._gdv != null ? `GDV ${p._gdv}` : ''].filter(Boolean).join(' · ')),
    status: p.status || '',
    risk: /risk|delay|hold/i.test(String(p.status || '')) ? 8 : 3,
  }));
  return {
    generatedAt: new Date().toISOString(),
    app: appId,
    source: 'mongo_hydrate',
    totals: { projects: projects.length, hotCount: hotItems.length },
    hotItems,
    storage: {
      hasBlob: !!state?.blob,
      cfSyncKeys: state?.cfSync ? Object.keys(state.cfSync).slice(0, 20) : [],
    },
  };
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} appId
 * @param {object} clientContext
 */
export async function hydrateVaultAskContext(db, appId, clientContext) {
  const client = clientContext && typeof clientContext === 'object' ? clientContext : {};
  let mongoCtx = null;

  try {
    if (appId === 'v1_cashflow') {
      const envelope = await loadCashflowEnvelope(db);
      if (envelope) mongoCtx = cashflowFromEnvelope(envelope);
    } else if (appId === 'finance_kpi' || appId === 'finance_kpi_admin') {
      const fin = await loadFinanceKpiState(db);
      if (fin?.blob) mongoCtx = financeFromBlob(fin.blob);
    } else if (appId === 'marketing_kpi') {
      const mkt = await loadMarketingKpiState(db);
      if (mkt?.blob) mongoCtx = marketingFromBlob(mkt.blob);
    } else if (appId === 'v2_resource_planner') {
      const st = await loadV2PlannerState(db);
      if (st) mongoCtx = plannerFromState(appId, st);
    } else if (appId === 'v3_org_planner' || appId === 'v3_project_acquisition') {
      const st = await loadV3PlannerState(db);
      if (st) mongoCtx = plannerFromState(appId, st);
    }
  } catch (e) {
    return {
      context: {
        ...client,
        hydrateError: e?.message || String(e),
      },
      hydrated: false,
      quality: scoreAskContext(client),
    };
  }

  if (!mongoCtx) {
    return { context: client, hydrated: false, quality: scoreAskContext(client) };
  }

  // Always merge: client live memory + Mongo server of record
  const thin = isThinAskContext(client);
  const merged = thin ? { ...mongoCtx, clientNote: 'Mongo primary (client context was thin)' } : mergeAskContexts(client, mongoCtx);
  merged.hydrated = true;
  return { context: merged, hydrated: true, quality: scoreAskContext(merged) };
}
