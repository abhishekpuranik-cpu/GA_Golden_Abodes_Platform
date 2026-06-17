import { apiFetch } from './api.js';

const BASE = '/api/postsales';

export const postSalesApi = {
  dashboard: () => apiFetch(`${BASE}/dashboard`).then((r) => { if (!r.ok) throw new Error(r.data?.error || 'Dashboard fetch failed'); return r.data; }),

  listUnits: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/units${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  getUnit: (id) => apiFetch(`${BASE}/units/${id}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  createUnit: (body) => apiFetch(`${BASE}/units`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateUnit: (id, body) => apiFetch(`${BASE}/units/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  createCustomer: (body) => apiFetch(`${BASE}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  getSteps: (unitId) => apiFetch(`${BASE}/units/${unitId}/steps`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateStep: (unitId, stepNumber, body) => apiFetch(`${BASE}/units/${unitId}/steps/${stepNumber}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  toggleChecklist: (unitId, stepNumber, index, body) => apiFetch(`${BASE}/units/${unitId}/steps/${stepNumber}/checklist/${index}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  listDocuments: (unitId) => apiFetch(`${BASE}/documents?unitId=${unitId}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  createDocument: (body) => apiFetch(`${BASE}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),
  updateDocument: (id, body) => apiFetch(`${BASE}/documents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

  listDemands: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`${BASE}/demands${q ? `?${q}` : ''}`).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; });
  },
  updateDemand: (id, body) => apiFetch(`${BASE}/demands/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error(r.data?.error); return r.data; }),

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
};
