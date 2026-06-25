import { apiFetch } from './api.js';

const BASE = '/api/postsales';
const ALLOCATION_TOKEN_KEY = 'ps_allocation_token';

function allocationHeaders(extra = {}) {
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ALLOCATION_TOKEN_KEY) : '';
  return token ? { ...extra, 'X-PS-Allocation-Token': token } : extra;
}

function allocationFetch(path, init = {}) {
  return apiFetch(path, {
    ...init,
    headers: allocationHeaders(init.headers || {}),
  });
}

export const postSalesApi = {
  verifyAllocationAdmin: async (password) => {
    const r = await apiFetch(`${BASE}/allocation/verify-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) throw new Error(r.data?.error || 'Invalid password');
    if (r.data?.token && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ALLOCATION_TOKEN_KEY, r.data.token);
    }
    return r.data;
  },
  clearAllocationAdmin: () => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ALLOCATION_TOKEN_KEY);
  },
  hasAllocationAdmin: () => typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(ALLOCATION_TOKEN_KEY),
  dashboard: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/dashboard${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error || 'Dashboard fetch failed'); return r.data; });
  },

  bootstrap: (body = {}) => apiFetch(`${BASE}/bootstrap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  getSyncPreferences: () => apiFetch(`${BASE}/bootstrap/sync-preferences`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  purgeAllUnits: () => apiFetch(`${BASE}/units/purge-all`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE_ALL_UNITS' }) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  uploadCrmUnits: async (file, { project, phase, building, dryRun = true } = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    const q = new URLSearchParams();
    if (project) q.set('project', project);
    if (phase) q.set('phase', phase);
    if (building) q.set('building', building);
    q.set('dryRun', dryRun ? 'true' : 'false');
    const r = await apiFetch(`${BASE}/units/crm-upload?${q}`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(r.data?.error || 'CRM upload failed');
    return r.data;
  },
  listCrmImportBatches: () => apiFetch(`${BASE}/units/import-batches`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  getInventoryFilters: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/inventory/filters${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  getInventoryCatalog: () => apiFetch(`${BASE}/inventory/catalog`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  addCatalogProject: (body) => apiFetch(`${BASE}/inventory/catalog/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateCatalogProject: (body) => apiFetch(`${BASE}/inventory/catalog/projects`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  deleteCatalogProject: (name, force = false) => apiFetch(`${BASE}/inventory/catalog/projects/${encodeURIComponent(name)}${force ? '?force=true' : ''}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  addCatalogPhase: (body) => apiFetch(`${BASE}/inventory/catalog/phases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateCatalogPhase: (body) => apiFetch(`${BASE}/inventory/catalog/phases`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  deleteCatalogPhase: (project, name, force = false) => {
    const q = new URLSearchParams({ project, name, ...(force ? { force: 'true' } : {}) }).toString();
    return apiFetch(`${BASE}/inventory/catalog/phases?${q}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  addCatalogBuilding: (body) => apiFetch(`${BASE}/inventory/catalog/buildings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateCatalogBuilding: (body) => apiFetch(`${BASE}/inventory/catalog/buildings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  deleteCatalogBuilding: (project, phase, name, force = false) => {
    const q = new URLSearchParams({ project, phase, name, ...(force ? { force: 'true' } : {}) }).toString();
    return apiFetch(`${BASE}/inventory/catalog/buildings?${q}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  importCatalogFromV1: () => apiFetch(`${BASE}/inventory/catalog/import-v1`, { method: 'POST' }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  pushCatalogToV1: () => apiFetch(`${BASE}/inventory/catalog/push-v1`, { method: 'POST' }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  getV1InventoryStatus: () => apiFetch(`${BASE}/inventory/v1-status`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  syncFromCashflowV1: (body = {}) => apiFetch(`${BASE}/inventory/sync-v1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error || r.data?.message); return r.data; }),

  listUnits: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/units${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  listUnitsLite: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/units/list${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  getUnit: (id) => apiFetch(`${BASE}/units/${id}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  createUnit: (body) => apiFetch(`${BASE}/units`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateUnit: (id, body) => apiFetch(`${BASE}/units/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  createCustomer: (body) => apiFetch(`${BASE}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  getSteps: (unitId) => apiFetch(`${BASE}/units/${unitId}/steps`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateStep: (unitId, stepNumber, body) => apiFetch(`${BASE}/units/${unitId}/steps/${stepNumber}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  addStepComment: (unitId, stepNumber, body) => apiFetch(`${BASE}/units/${unitId}/steps/${stepNumber}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  toggleChecklist: (unitId, stepNumber, index, body) => apiFetch(`${BASE}/units/${unitId}/steps/${stepNumber}/checklist/${index}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  listAssignees: () => apiFetch(`${BASE}/tasks/assignees`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  getMyTasks: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/tasks/my${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  getTaskQueue: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/tasks/queue${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },

  getAllocation: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return allocationFetch(`${BASE}/allocation${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  getActivityCatalog: () => allocationFetch(`${BASE}/allocation/catalog`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  addActivityCatalogItem: (body) => allocationFetch(`${BASE}/allocation/catalog`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateActivityCatalogItem: (number, body) => allocationFetch(`${BASE}/allocation/catalog/${number}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  deleteActivityCatalogItem: (number) => allocationFetch(`${BASE}/allocation/catalog/${number}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  assignAllocationExecutives: (body) => allocationFetch(`${BASE}/allocation/executives`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  assignAllocationSteps: (body) => allocationFetch(`${BASE}/allocation/assign-steps`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  autoAssignAllocation: (body) => allocationFetch(`${BASE}/allocation/auto-assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  listDocuments: (unitId) => apiFetch(`${BASE}/documents?unitId=${unitId}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  documentFileUrl: (fileId) => `${BASE}/documents/files/${encodeURIComponent(fileId)}`,
  uploadDocumentFile: async (file, meta = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(meta).forEach(([k, v]) => {
      if (v != null && v !== '') fd.append(k, String(v));
    });
    const r = await apiFetch(`${BASE}/documents/upload`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(r.data?.error || 'Upload failed');
    return r.data;
  },
  createDocument: (body) => apiFetch(`${BASE}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateDocument: (id, body) => apiFetch(`${BASE}/documents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  listDemands: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/demands${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  updateDemand: (id, body) => apiFetch(`${BASE}/demands/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  createClpLetterTask: (demandId, body = {}) => apiFetch(`${BASE}/demands/${demandId}/clp-letter-task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  importDemands: (rows) => apiFetch(`${BASE}/demands/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) }).then((r) => { if (!r.ok) throw new Error(r.data?.error || r.data?.message); return r.data; }),
  syncDemandsFromV1: (body = {}) => apiFetch(`${BASE}/demands/sync-from-v1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error || r.data?.message); return r.data; }),
  uploadDemandsExcel: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await apiFetch(`${BASE}/demands/upload`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(r.data?.error || 'Upload failed');
    return r.data;
  },
  exportDemandsForCashflow: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/demands/export${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },

  getLoan: (unitId) => apiFetch(`${BASE}/loans?unitId=${unitId}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  upsertLoan: (body) => apiFetch(`${BASE}/loans`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  listTickets: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/tickets${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  getTicket: (id) => apiFetch(`${BASE}/tickets/${id}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  createTicket: (body) => apiFetch(`${BASE}/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateTicket: (id, body) => apiFetch(`${BASE}/tickets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  listMilestones: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/milestones${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  createMilestone: (body) => apiFetch(`${BASE}/milestones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  triggerMilestone: (id) => apiFetch(`${BASE}/milestones/${id}/trigger`, { method: 'POST' }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  getCollectionRegister: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/reports/collection-register${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  getDisbursementForecast: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/reports/disbursement-forecast${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  saveCollectionForecast: (unitId, body) => apiFetch(`${BASE}/reports/forecasts/${unitId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  getDisbursementTasks: (unitId) => apiFetch(`${BASE}/reports/disbursement-tasks/${unitId}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  completeDisbursementTask: (taskId, body = {}) => apiFetch(`${BASE}/reports/disbursement-tasks/${taskId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  delayDisbursementTask: (taskId, body) => apiFetch(`${BASE}/reports/disbursement-tasks/${taskId}/delay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  getClpSchedule: (project) => apiFetch(`${BASE}/milestones/clp-schedule?project=${encodeURIComponent(project)}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  saveClpSchedule: (body) => apiFetch(`${BASE}/milestones/clp-schedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  triggerClpDemandTasks: (body) => apiFetch(`${BASE}/milestones/clp-schedule/trigger-demands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  downloadClpScheduleTemplate: async () => {
    const res = await fetch(`${BASE}/milestones/clp-schedule/template`, { credentials: 'include' });
    if (!res.ok) throw new Error('Template download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CLP_Schedule_Template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  },
  uploadClpScheduleExcel: async (project, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project', project);
    const r = await apiFetch(`${BASE}/milestones/clp-schedule/upload`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(r.data?.error || 'Upload failed');
    return r.data;
  },

  downloadReportsTemplate: async () => {
    const res = await fetch(`${BASE}/reports/template`, { credentials: 'include' });
    if (!res.ok) throw new Error('Template download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PostSales_Reports_Template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  },
  downloadCollectionRegisterExcel: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE}/reports/export${q ? `?${q}` : ''}`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PostSales_Collection_Register_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
  uploadReportsExcel: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await apiFetch(`${BASE}/reports/upload`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(r.data?.error || r.data?.message || 'Upload failed');
    return r.data;
  },
};
