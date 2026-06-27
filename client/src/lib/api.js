/** @param {Response} res */
export async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * @template T
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<{ ok: boolean, status: number, data: T }>}
 */
export async function apiFetch(path, init = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { ...(init.headers || {}) }
  });
  const data = await parseJson(res);
  return { ok: res.ok, status: res.status, data };
}

export const workspaceApi = {
  /** @returns {Promise<{ keys: Record<string, string>, updatedAt?: string | null }>} */
  async getKeys() {
    const { ok, data, status } = await apiFetch('/api/workspace-keys');
    if (!ok) throw new Error(data?.error || `GET failed (${status})`);
    return data;
  },
  /** @param {Record<string, string>} keys */
  async putKeysMerge(keys) {
    const { ok, data, status } = await apiFetch('/api/workspace-keys', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys, merge: true })
    });
    if (!ok) throw new Error(data?.error || `PUT failed (${status})`);
    return data;
  }
};

export const appStateApi = {
  async getState(appId) {
    const { ok, data, status } = await apiFetch(`/api/apps/${encodeURIComponent(appId)}/state`);
    if (!ok) throw new Error(data?.error || `GET state failed (${status})`);
    return data;
  },
  async getMeta(appId) {
    const { ok, data, status } = await apiFetch(`/api/apps/${encodeURIComponent(appId)}/meta`);
    if (!ok) throw new Error(data?.error || `GET meta failed (${status})`);
    return data;
  },
  async putState(appId, payload) {
    const { ok, data, status } = await apiFetch(`/api/apps/${encodeURIComponent(appId)}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) {
      const err = new Error(data?.error || `PUT state failed (${status})`);
      err.status = status;
      err.payload = data;
      throw err;
    }
    return data;
  },
  async importState(appId, payload) {
    const { ok, data, status } = await apiFetch(`/api/apps/${encodeURIComponent(appId)}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Import failed (${status})`);
    return data;
  },
  async listSnapshots(appId, limit = 20) {
    const { ok, data, status } = await apiFetch(`/api/apps/${encodeURIComponent(appId)}/snapshots?limit=${Number(limit) || 20}`);
    if (!ok) throw new Error(data?.error || `GET snapshots failed (${status})`);
    return data;
  },
  async restoreSnapshot(appId, snapshotId, payload = {}) {
    const { ok, data, status } = await apiFetch(
      `/api/apps/${encodeURIComponent(appId)}/restore/${encodeURIComponent(snapshotId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (!ok) throw new Error(data?.error || `Restore failed (${status})`);
    return data;
  }
};

export const accessApi = {
  async status() {
    const { ok, data, status } = await apiFetch('/api/access/status');
    if (!ok) throw new Error(data?.error || `GET access status failed (${status})`);
    return data;
  },
  async login(code) {
    const { ok, data, status } = await apiFetch('/api/access/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!ok) throw new Error(data?.error || `Login failed (${status})`);
    return data;
  },
  async logout() {
    const { ok, data, status } = await apiFetch('/api/access/logout', {
      method: 'POST'
    });
    if (!ok) throw new Error(data?.error || `Logout failed (${status})`);
    return data;
  }
};

export const authApi = {
  async bootstrapStatus() {
    const { ok, data, status } = await apiFetch('/api/auth/bootstrap-status');
    if (!ok) throw new Error(data?.error || `Bootstrap status failed (${status})`);
    return data;
  },
  async bootstrap(payload) {
    const { ok, data, status } = await apiFetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Bootstrap failed (${status})`);
    return data;
  },
  async login(email, password) {
    const { ok, data, status } = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!ok) throw new Error(data?.error || `Login failed (${status})`);
    return data;
  },
  async logout() {
    const { ok, data, status } = await apiFetch('/api/auth/logout', { method: 'POST' });
    if (!ok) throw new Error(data?.error || `Logout failed (${status})`);
    return data;
  },
  async session() {
    const { ok, data, status } = await apiFetch('/api/auth/session');
    if (!ok) {
      if (status === 401) return { authenticated: false };
      throw new Error(data?.error || `Session failed (${status})`);
    }
    return data;
  },
  async listRoles() {
    const { ok, data, status } = await apiFetch('/api/auth/admin/roles');
    if (!ok) throw new Error(data?.error || `Roles failed (${status})`);
    return data;
  },
  async saveRoles(roles) {
    const { ok, data, status } = await apiFetch('/api/auth/admin/roles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles })
    });
    if (!ok) throw new Error(data?.error || `Save roles failed (${status})`);
    return data;
  },
  async listUsers() {
    const { ok, data, status } = await apiFetch('/api/auth/admin/users');
    if (!ok) throw new Error(data?.error || `Users failed (${status})`);
    return data;
  },
  async createUser(payload) {
    const { ok, data, status } = await apiFetch('/api/auth/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Create user failed (${status})`);
    return data;
  },
  async updateUser(id, payload) {
    const { ok, data, status } = await apiFetch(`/api/auth/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(data?.error || `Update user failed (${status})`);
    return data;
  },
  async resetUserPassword(id, password) {
    const { ok, data, status } = await apiFetch(`/api/auth/admin/users/${encodeURIComponent(id)}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!ok) throw new Error(data?.error || `Reset password failed (${status})`);
    return data;
  },
  async listPreconstructionProjects() {
    const { ok, data, status } = await apiFetch('/api/auth/admin/preconstruction-projects');
    if (!ok) throw new Error(data?.error || `Project catalog failed (${status})`);
    return data;
  },
  async bandwidthReport() {
    const { ok, data, status } = await apiFetch('/api/auth/admin/bandwidth-report');
    if (!ok) throw new Error(data?.error || `Bandwidth report failed (${status})`);
    return data;
  }
};
