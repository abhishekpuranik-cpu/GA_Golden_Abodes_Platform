# Functional Inventory — Construction Execution Dashboard (Phase 0 — Vault Wiring Only)

**Status: DEFERRED — full UI inventory out of scope.** This app is an **external, unbundled** tool with no source code inside `GA_Golden_Abodes_Platform` (no HTML file under `client/public/legacy/`, no React route in `App.jsx`). Only the platform's *wiring* to it is inventoried here. See `DEFERRED.md` for the formal deferral entry.

---

**App ID:** `execution`
**Vault tile (`vaultModules.js`):** title **"Construction KPIs"**, purpose *"Progress, quality and site cadence dashboards."*, icon 🏗️, glyph `EX`, group `construction`, `desk: true` (included in the default desk-module set alongside Post Sales, Sales Dashboard, and Hiring — see `DESK_DEFAULT_IDS`), status `LIVE`, `path: ''` (no in-platform route — the tile navigates straight to an external URL)
**No React route exists** for `execution` in `client/src/App.jsx` — unlike every other inventoried app, there is no `<Route>` entry, no lazy-loaded page component, and no `LegacyAppShell`/iframe embed. Confirmed via full-text search of `App.jsx`.

## Vault wiring (`VaultHome.jsx`)

- `VAULT_EXEC_VERSION = '20260511-exec-progress-roadmap'` — cache-busting version tag for whatever URL is configured
- `EXEC_URL_LS_KEY = 'ga_execution_dashboard_url'` — per-browser localStorage override
- URL resolution order (`execUrl`): (1) `vaultFromApi.execution` — value of `executionDashboardUrl` fetched from a server-side vault-config API endpoint, (2) build-time env var `VITE_EXECUTION_DASHBOARD_URL`, (3) `execCustomUrl` (the localStorage override), (4) otherwise empty
- The resolved URL is versioned (`execVersionedUrl`, via `withVersionParam(url, 'v', ...)`) and exposed as `modules.execution` in the vault's module-URL map (consumed by whatever renders the Vault tiles/cards)
- Admin control: button **"Set Execution URL"** (`ga-vault-mini`) → `setCustomDashboardUrl('Construction Execution Dashboard', EXEC_URL_LS_KEY, setExecCustomUrl)` — prompts an admin to paste/override the dashboard URL for this browser
- Server-side config: the vault's config API returns `vault.executionDashboardUrl` (fetched alongside `vault.preconstructionUrl` in the same call) — i.e. there is a backend-managed canonical URL, overridable per-browser via localStorage, overridable at build time via env var

## What is explicitly NOT covered here
- The actual dashboard UI (screens, controls, data, KPIs) — it lives in a separate, externally-hosted application with no source present in this repository or its sibling repos found during this audit.
- Any data contract between the platform and that external tool beyond the URL itself — no shared localStorage keys, no `GET/PUT /api/apps/execution/state` calls, no iframe embed were found, meaning (unlike PreConstruction) this tool is not even embedded — it is a plain outbound link/new-tab launch.

## Parity notes
- If Phase 2 reskin work needs to touch Construction KPIs, the actual application must be located (likely a separate deployment/repo not present here) before any inventory or parity work can proceed on its internal screens.
- The vault-side contract to preserve is narrow and already fully captured above: the tile metadata, the 3-tier URL resolution order, and the admin override button/localStorage key.
