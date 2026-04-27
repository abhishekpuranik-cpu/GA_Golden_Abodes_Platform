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
export async function apiFetch(path, init) {
  const res = await fetch(path, init);
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
