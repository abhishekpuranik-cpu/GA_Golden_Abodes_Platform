import { apiFetch } from './api.js';

async function asJson(path, init) {
  const { ok, data, status } = await apiFetch(path, init);
  if (!ok) {
    const err = new Error(data?.error || `Request failed (${status})`);
    err.status = status;
    err.data = data;
    throw err;
  }
  return data;
}

function q(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const adminServicesApi = {
  tabs: () => asJson('/api/admin-services/tabs'),
  tabCounts: () => asJson('/api/admin-services/tabs/counts'),
  meta: () => asJson('/api/admin-services/meta'),

  listLocations: (params) => asJson(`/api/admin-services/travel/locations${q(params)}`),
  createLocation: (body) => asJson('/api/admin-services/travel/locations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  updateLocation: (id, body) => asJson(`/api/admin-services/travel/locations/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  deleteLocation: (id) => asJson(`/api/admin-services/travel/locations/${id}`, { method: 'DELETE' }),

  listDistances: (params) => asJson(`/api/admin-services/travel/distances${q(params)}`),
  previewDistance: (params) => asJson(`/api/admin-services/travel/distances/preview${q(params)}`),
  createDistance: (body) => asJson('/api/admin-services/travel/distances', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  verifyDistance: (id, body) => asJson(`/api/admin-services/travel/distances/${id}/verify`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),

  listTrips: (params) => asJson(`/api/admin-services/travel/trips${q(params)}`),
  createTrip: (body) => asJson('/api/admin-services/travel/trips', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  updateTrip: (id, body) => asJson(`/api/admin-services/travel/trips/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  tripAction: (id, action, body = {}) => asJson(`/api/admin-services/travel/trips/${id}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  deleteTrip: (id) => asJson(`/api/admin-services/travel/trips/${id}`, { method: 'DELETE' }),

  listClaims: (params) => asJson(`/api/admin-services/travel/claims${q(params)}`),
  generateClaim: (body) => asJson('/api/admin-services/travel/claims/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  getClaim: (id) => asJson(`/api/admin-services/travel/claims/${id}`),
  claimAction: (id, action, body = {}) => asJson(`/api/admin-services/travel/claims/${id}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),

  pendingApprovals: () => asJson('/api/admin-services/travel/approvals/pending'),
  exceptions: () => asJson('/api/admin-services/travel/approvals/exceptions'),
  exceptionAction: (tripId, action, body) => asJson(`/api/admin-services/travel/approvals/exceptions/${tripId}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),

  getPolicy: (entityTag) => asJson(`/api/admin-services/travel/setup/policy${q({ entityTag })}`),
  updatePolicy: (entityTag, body) => asJson(`/api/admin-services/travel/setup/policy/${entityTag}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  listRates: (params) => asJson(`/api/admin-services/travel/setup/rates${q(params)}`),
  createRate: (body) => asJson('/api/admin-services/travel/setup/rates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),

  matrixHealth: () => asJson('/api/admin-services/travel/reports/matrix-health'),
  summary: (params) => asJson(`/api/admin-services/travel/reports/summary${q(params)}`)
};
