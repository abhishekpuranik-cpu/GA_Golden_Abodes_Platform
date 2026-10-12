import { apiFetch } from '../api.js';

const BASE = '/api/hiring/tracker';

function unwrap(promise) {
  return promise.then((r) => {
    if (!r.ok) {
      const err = new Error(r.data?.error || 'Request failed');
      err.status = r.status;
      err.data = r.data;
      throw err;
    }
    return r.data;
  });
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {})
});

const qs = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return q ? `?${q}` : '';
};

export const trackerApi = {
  me: () => unwrap(apiFetch(`${BASE}/me`)),
  users: () => unwrap(apiFetch(`${BASE}/users`)),
  positions: () => unwrap(apiFetch(`${BASE}/positions`)),
  createPosition: (body) => unwrap(apiFetch(`${BASE}/positions`, json('POST', body))),
  updatePosition: (id, body) => unwrap(apiFetch(`${BASE}/positions/${id}`, json('PATCH', body))),

  templates: (positionId) => unwrap(apiFetch(`${BASE}/templates${qs({ positionId })}`)),
  saveTemplate: (positionId, kind, questions) => unwrap(apiFetch(`${BASE}/templates/${positionId}/${kind}`, json('PUT', { questions }))),
  resetTemplate: (positionId, kind) => unwrap(apiFetch(`${BASE}/templates/${positionId}/${kind}/reset`, json('POST'))),

  candidates: (params) => unwrap(apiFetch(`${BASE}/candidates${qs(params)}`)),
  candidate: (id) => unwrap(apiFetch(`${BASE}/candidates/${id}`)),
  createCandidate: (body) => unwrap(apiFetch(`${BASE}/candidates`, json('POST', body))),
  updateCandidate: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}`, json('PATCH', body))),
  removeCandidate: (id, reason) => unwrap(apiFetch(`${BASE}/candidates/${id}`, json('DELETE', { reason }))),
  transition: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}/transition`, json('POST', body))),
  schedule: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}/schedule`, json('PATCH', body))),
  decide: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}/decision`, json('POST', body))),
  uploadResume: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return unwrap(apiFetch(`${BASE}/candidates/${id}/resume`, { method: 'POST', body: fd }));
  },
  resumeUrl: (id, download = false) => `${BASE}/candidates/${id}/resume${download ? '?download=1' : ''}`,

  hrEval: (id) => unwrap(apiFetch(`${BASE}/candidates/${id}/hr-eval`)),
  saveHrEval: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}/hr-eval`, json('PUT', body))),
  preRead: (id) => unwrap(apiFetch(`${BASE}/candidates/${id}/pre-read`)),
  regeneratePreRead: (id) => unwrap(apiFetch(`${BASE}/candidates/${id}/pre-read`, json('POST'))),
  savePreRead: (id, body) => unwrap(apiFetch(`${BASE}/candidates/${id}/pre-read`, json('PUT', body))),
  mgmtEval: (id, round) => unwrap(apiFetch(`${BASE}/mgmt/candidates/${id}/eval/${round}`)),
  saveMgmtEval: (id, round, body) => unwrap(apiFetch(`${BASE}/mgmt/candidates/${id}/eval/${round}`, json('PUT', body))),
  setSecondRound: (id, required) => unwrap(apiFetch(`${BASE}/mgmt/candidates/${id}/second-round`, json('POST', { required }))),

  dashboard: (params) => unwrap(apiFetch(`${BASE}/dashboard${qs(params)}`))
};
