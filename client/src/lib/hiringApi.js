import { apiFetch } from './api.js';

const BASE = '/api/hiring';

function unwrap(promise) {
  return promise.then((r) => {
    if (!r.ok) throw new Error(r.data?.error || 'Request failed');
    return r.data;
  });
}

export const hiringApi = {
  health: () => unwrap(apiFetch(`${BASE}/health`)),

  listRequisitions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return unwrap(apiFetch(`${BASE}/requisitions${q ? `?${q}` : ''}`));
  },
  getRequisition: (id) => unwrap(apiFetch(`${BASE}/requisitions/${id}`)),
  createRequisition: (body) => unwrap(apiFetch(`${BASE}/requisitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),
  updateRequisition: (id, body) => unwrap(apiFetch(`${BASE}/requisitions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),
  deleteRequisition: (id, opts = {}) => {
    const q = opts.mode ? `?mode=${encodeURIComponent(opts.mode)}` : '';
    return unwrap(apiFetch(`${BASE}/requisitions/${id}${q}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: opts.mode,
        reason: opts.reason,
        force: !!opts.force
      })
    }));
  },
  sourceRequisition: (id) => unwrap(apiFetch(`${BASE}/requisitions/${id}/source`, { method: 'POST' })),
  syncRequisition: (id) => unwrap(apiFetch(`${BASE}/requisitions/${id}/sync`, { method: 'POST' })),

  listCandidates: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return unwrap(apiFetch(`${BASE}/candidates${q ? `?${q}` : ''}`));
  },
  getCandidate: (id) => unwrap(apiFetch(`${BASE}/candidates/${id}`)),
  refreshCandidateProfile: (id) => unwrap(apiFetch(`${BASE}/candidates/${id}/refresh-profile`, { method: 'POST' })),
  createCandidate: (body) => unwrap(apiFetch(`${BASE}/candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),
  previewImport: ({ requisitionId, entityTag, channel, file }) => {
    const fd = new FormData();
    fd.append('requisitionId', requisitionId);
    fd.append('entityTag', entityTag);
    fd.append('channel', channel);
    fd.append('file', file);
    return unwrap(apiFetch(`${BASE}/candidates/import/preview`, { method: 'POST', body: fd }));
  },
  importCandidatesFile: ({ requisitionId, entityTag, channel, file }) => {
    const fd = new FormData();
    fd.append('requisitionId', requisitionId);
    fd.append('entityTag', entityTag);
    fd.append('channel', channel);
    fd.append('file', file);
    return unwrap(apiFetch(`${BASE}/candidates/import`, { method: 'POST', body: fd }));
  },
  updateCandidate: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),
  updateStage: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),
  addFeedback: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),

  listInterviews: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return unwrap(apiFetch(`${BASE}/interviews${q ? `?${q}` : ''}`));
  },
  scheduleInterview: (body) => unwrap(apiFetch(`${BASE}/interviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),
  updateInterview: (id, body) => unwrap(apiFetch(`${BASE}/interviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),

  createOffer: (body) => unwrap(apiFetch(`${BASE}/offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),
  updateOffer: (id, body) => unwrap(apiFetch(`${BASE}/offers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })),

  dashboard: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return unwrap(apiFetch(`${BASE}/dashboard${q ? `?${q}` : ''}`));
  }
};
