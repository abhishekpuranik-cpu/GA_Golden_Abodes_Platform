import { apiFetch } from './api.js';

const BASE = '/api/dm-governance';

export const dmGovernanceApi = {
  async meta() {
    const { ok, data, status } = await apiFetch(`${BASE}/meta`);
    if (!ok) throw new Error(data?.error || `Meta failed (${status})`);
    return data;
  },
  async dashboard() {
    const { ok, data, status } = await apiFetch(`${BASE}/dashboard/consolidated`);
    if (!ok) throw new Error(data?.error || `Dashboard failed (${status})`);
    return data;
  },
  async proactiveScan() {
    const { ok, data, status } = await apiFetch(`${BASE}/dashboard/proactive-scan`, { method: 'POST' });
    if (!ok) throw new Error(data?.error || `Proactive scan failed (${status})`);
    return data;
  },
  async listSpvs() {
    const { ok, data, status } = await apiFetch(`${BASE}/spvs`);
    if (!ok) throw new Error(data?.error || `SPVs failed (${status})`);
    return data;
  },
  async getSpv(id) {
    const { ok, data, status } = await apiFetch(`${BASE}/spvs/${encodeURIComponent(id)}`);
    if (!ok) throw new Error(data?.error || `SPV failed (${status})`);
    return data;
  },
  async saveSpv(id, payload) {
    const { ok, data, status } = await apiFetch(`${BASE}/spvs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Save SPV failed (${status})`);
    return data;
  },
  async createSpv(payload) {
    const { ok, data, status } = await apiFetch(`${BASE}/spvs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Create SPV failed (${status})`);
    return data;
  },
  async listProjects() {
    const { ok, data, status } = await apiFetch(`${BASE}/projects`);
    if (!ok) throw new Error(data?.error || `Projects failed (${status})`);
    return data;
  },
  async getProject(id) {
    const { ok, data, status } = await apiFetch(`${BASE}/projects/${encodeURIComponent(id)}`);
    if (!ok) throw new Error(data?.error || `Project failed (${status})`);
    return data;
  },
  async saveProject(id, payload) {
    const { ok, data, status } = await apiFetch(`${BASE}/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Save project failed (${status})`);
    return data;
  },
  async syncRegistry() {
    const { ok, data, status } = await apiFetch(`${BASE}/projects/sync-registry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!ok) throw new Error(data?.error || `Sync failed (${status})`);
    return data;
  },
  async getBillingConfig(projectId) {
    const { ok, data, status } = await apiFetch(`${BASE}/projects/${encodeURIComponent(projectId)}/billing-config`);
    if (!ok) throw new Error(data?.error || `Billing config failed (${status})`);
    return data;
  },
  async saveBillingConfig(projectId, payload) {
    const { ok, data, status } = await apiFetch(`${BASE}/projects/${encodeURIComponent(projectId)}/billing-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Save billing config failed (${status})`);
    return data;
  },
  async syncCashflow(projectId) {
    const { ok, data, status } = await apiFetch(`${BASE}/integrations/sync/cashflow-v1/${encodeURIComponent(projectId)}`, {
      method: 'POST'
    });
    if (!ok) throw new Error(data?.error || `Cashflow sync failed (${status})`);
    return data;
  },
  async integrationStatus() {
    const { ok, data, status } = await apiFetch(`${BASE}/integrations/status`);
    if (!ok) throw new Error(data?.error || `Integration status failed (${status})`);
    return data;
  },
  async calculate(projectId, periodMonth) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/calculate?month=${encodeURIComponent(periodMonth)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    if (!ok) throw new Error(data?.error || `Calculate failed (${status})`);
    return data;
  },
  async getPreRevenue(projectId, month) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/pre-revenue/${encodeURIComponent(month)}`
    );
    if (!ok) throw new Error(data?.error || `Pre-revenue failed (${status})`);
    return data;
  },
  async savePreRevenue(projectId, month, payload) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/pre-revenue/${encodeURIComponent(month)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!ok) throw new Error(data?.error || `Save pre-revenue failed (${status})`);
    return data;
  },
  async syncCostAllocation(projectId, month) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/cost-allocation/${encodeURIComponent(month)}/sync-v2`,
      { method: 'POST' }
    );
    if (!ok) throw new Error(data?.error || `Cost allocation sync failed (${status})`);
    return data;
  },
  async getCostAllocation(projectId, month) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/cost-allocation/${encodeURIComponent(month)}`
    );
    if (!ok) throw new Error(data?.error || `Cost allocation failed (${status})`);
    return data;
  },
  async listInvoices(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const { ok, data, status } = await apiFetch(`${BASE}/invoices${qs ? `?${qs}` : ''}`);
    if (!ok) throw new Error(data?.error || `Invoices failed (${status})`);
    return data;
  },
  async getInvoice(id) {
    const { ok, data, status } = await apiFetch(`${BASE}/invoices/${encodeURIComponent(id)}`);
    if (!ok) throw new Error(data?.error || `Invoice failed (${status})`);
    return data;
  },
  async generateInvoice(projectId, payload) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/invoices/generate`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!ok) throw new Error(data?.error || `Generate invoice failed (${status})`);
    return data;
  },
  async transitionInvoice(id, action, comment = '') {
    const { ok, data, status } = await apiFetch(`${BASE}/invoices/${encodeURIComponent(id)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment })
    });
    if (!ok) throw new Error(data?.error || `Transition failed (${status})`);
    return data;
  },
  async recordPayment(id, amount, remarks = '') {
    const { ok, data, status } = await apiFetch(`${BASE}/invoices/${encodeURIComponent(id)}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, remarks })
    });
    if (!ok) throw new Error(data?.error || `Payment failed (${status})`);
    return data;
  },
  async approvalInbox() {
    const { ok, data, status } = await apiFetch(`${BASE}/approvals/inbox`);
    if (!ok) throw new Error(data?.error || `Inbox failed (${status})`);
    return data;
  },
  async syncAll(projectId) {
    const { ok, data, status } = await apiFetch(`${BASE}/projects/${encodeURIComponent(projectId)}/sync-all`, {
      method: 'POST'
    });
    if (!ok) throw new Error(data?.error || `Full sync failed (${status})`);
    return data;
  },
  async listExpenses(projectId) {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const { ok, data, status } = await apiFetch(`${BASE}/expenses${qs}`);
    if (!ok) throw new Error(data?.error || `Expenses failed (${status})`);
    return data;
  },
  async createExpense(payload) {
    const { ok, data, status } = await apiFetch(`${BASE}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Create expense failed (${status})`);
    return data;
  },
  async importExpenses(projectId) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/expenses/import-cashflow`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    if (!ok) throw new Error(data?.error || `Import failed (${status})`);
    return data;
  },
  async getReconciliation(projectId, fy) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/reconciliation/${encodeURIComponent(fy)}`
    );
    if (!ok) throw new Error(data?.error || `Reconciliation failed (${status})`);
    return data;
  },
  async buildReconciliation(projectId, fy) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/reconciliation/${encodeURIComponent(fy)}/build`,
      { method: 'POST' }
    );
    if (!ok) throw new Error(data?.error || `Build recon failed (${status})`);
    return data;
  },
  async lockReconciliation(projectId, fy) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/reconciliation/${encodeURIComponent(fy)}/lock`,
      { method: 'POST' }
    );
    if (!ok) throw new Error(data?.error || `Lock recon failed (${status})`);
    return data;
  },
  async listReconciliations() {
    const { ok, data, status } = await apiFetch(`${BASE}/reconciliations`);
    if (!ok) throw new Error(data?.error || `Reconciliations failed (${status})`);
    return data;
  },
  async getCompliance(spvId) {
    const { ok, data, status } = await apiFetch(`${BASE}/compliance/spv/${encodeURIComponent(spvId)}`);
    if (!ok) throw new Error(data?.error || `Compliance failed (${status})`);
    return data;
  },
  async saveComplianceDoc(docId, payload) {
    const { ok, data, status } = await apiFetch(`${BASE}/compliance/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Save compliance failed (${status})`);
    return data;
  },
  async listRisks(projectId) {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const { ok, data, status } = await apiFetch(`${BASE}/risks${qs}`);
    if (!ok) throw new Error(data?.error || `Risks failed (${status})`);
    return data;
  },
  async scanRisks(projectId) {
    const { ok, data, status } = await apiFetch(`${BASE}/risks/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectId ? { projectId } : {})
    });
    if (!ok) throw new Error(data?.error || `Risk scan failed (${status})`);
    return data;
  },
  async resolveRisk(id, status) {
    const { ok, data, status: httpStatus } = await apiFetch(`${BASE}/risks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!ok) throw new Error(data?.error || `Resolve risk failed (${httpStatus})`);
    return data;
  },
  async listBillingTriggers(projectId) {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const { ok, data, status } = await apiFetch(`${BASE}/billing-triggers${qs}`);
    if (!ok) throw new Error(data?.error || `Triggers failed (${status})`);
    return data;
  },
  async getReport(reportId) {
    const { ok, data, status } = await apiFetch(`${BASE}/reports/${encodeURIComponent(reportId)}`);
    if (!ok) throw new Error(data?.error || `Report failed (${status})`);
    return data;
  },
  async exportReport(reportId) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/reports/${encodeURIComponent(reportId)}/export?format=json`
    );
    if (!ok) throw new Error(data?.error || `Export failed (${status})`);
    return data;
  },
  async runScenario(projectId, assumptions) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/scenarios/run`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assumptions) }
    );
    if (!ok) throw new Error(data?.error || `Scenario failed (${status})`);
    return data;
  },
  async listScenarios(projectId) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/scenarios`
    );
    if (!ok) throw new Error(data?.error || `Scenarios failed (${status})`);
    return data;
  },
  async alerts() {
    const { ok, data, status } = await apiFetch(`${BASE}/alerts`);
    if (!ok) throw new Error(data?.error || `Alerts failed (${status})`);
    return data;
  },
  async ackAlert(id) {
    const { ok, data, status } = await apiFetch(`${BASE}/alerts/${encodeURIComponent(id)}/ack`, {
      method: 'POST'
    });
    if (!ok) throw new Error(data?.error || `Ack failed (${status})`);
    return data;
  },
  async executiveSummary() {
    const { ok, data, status } = await apiFetch(`${BASE}/executive/summary`);
    if (!ok) throw new Error(data?.error || `Executive failed (${status})`);
    return data;
  },
  async getMilestones(projectId) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/milestones`
    );
    if (!ok) throw new Error(data?.error || `Milestones failed (${status})`);
    return data;
  },
  async syncMilestones(projectId) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/sync-milestones`,
      { method: 'POST' }
    );
    if (!ok) throw new Error(data?.error || `Milestone sync failed (${status})`);
    return data;
  },
  async syncExecution(projectId) {
    const { ok, data, status } = await apiFetch(
      `${BASE}/projects/${encodeURIComponent(projectId)}/sync-execution`,
      { method: 'POST' }
    );
    if (!ok) throw new Error(data?.error || `Execution sync failed (${status})`);
    return data;
  }
};

export function formatCr(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function riskColor(status) {
  if (status === 'critical' || status === 'red') return '#b91c1c';
  if (status === 'high') return '#c2410c';
  if (status === 'medium' || status === 'amber') return '#b45309';
  if (status === 'low') return '#64748b';
  return '#047857';
}

export function riskClass(status) {
  if (status === 'critical' || status === 'red') return 'dm-risk-critical';
  if (status === 'high') return 'dm-risk-high';
  if (status === 'medium' || status === 'amber') return 'dm-risk-medium';
  if (status === 'low') return 'dm-risk-low';
  return 'dm-risk-ok';
}
