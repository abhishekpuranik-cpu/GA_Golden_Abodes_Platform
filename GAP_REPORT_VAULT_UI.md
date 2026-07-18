# GAP REPORT — Vault UI Brand Rebuild

Branch: `theme/ga-platform`  
Date: 2026-07-17  
Repo: `GA_Golden_Abodes_Platform` (isolated worktree)

## Evidence map

| Area | Path |
|---|---|
| Routes | `client/src/App.jsx` |
| Access | `client/src/pages/AccessPage.jsx` |
| Vault home | `client/src/pages/VaultHome.jsx` |
| Platform apps registry | `client/src/lib/vaultCatalog.js` |
| App IDs | `client/src/appRegistry.js` |
| Auth gate | `client/src/components/RequireAuth.jsx` |
| Global CSS | `client/src/index.css` |
| Legacy shell | `client/src/pages/LegacyAppShell.jsx` |
| Post Sales shell | `client/src/pages/postsales/PostSalesLayout.jsx` + `post-sales.css` |
| Hiring shell | `client/src/pages/hiring/HiringLayout.jsx` + `hiring.css` |
| DM Governance shell | `client/src/pages/dmGovernance/DmGovernanceLayout.jsx` + `dm-governance.css` |
| Auth API | `server/routes/auth.js` (`/login`, `/logout`, `/session`, `/bootstrap*`) |
| Fonts | `client/index.html` (Outfit + Playfair; Jost missing) |
| Brand renders | none previously; added `client/public/brand/access-renders.webp` |
| Tests | almost none (`scripts/hiring-viewer-403-test.mjs` only) |
| Search endpoints | none found under `server/` for federated module search |
| Pinned modules | no `pinnedModules` field/schema |

## Registered launchable modules (true list)

### In-platform React (`VAULT_PLATFORM_APPS`)
1. `post_sales` → `/app/post-sales`
2. `hiring` → `/app/hiring` (featured)
3. `dm_spv_governance` → `/app/dm-governance`

### Vault ACL / legacy + external
4. `v3_project_acquisition` → `/app/org-planner`
5. `v2_resource_planner` → `/app/resource-planner`
6. `v1_cashflow` → `/legacy/GA_Cashflow_V1.html`
7. `finance_kpi` / `finance_kpi_admin` → `/legacy/GA_Finance_KPI.html`
8. `sales_dashboard` → `/legacy/ga_sales_dashboard.html`
9. `marketing_kpi` → `/legacy/GA_MarketingSales_KPI_Dashboard.html`
10. `execution` → external/env URL
11. `preconstruction` → `/preconstruction/` or env URL
12. `admin_security` → `/admin/security`

## Spec item status

| # | Spec | Status | Evidence / note |
|---|---|---|---|
| 1 | Design tokens (`ga-tokens.css`) | EXISTS | `client/src/theme/ga-tokens.css` |
| 1b | Playfair + Jost | EXISTS | `client/index.html` |
| 2 | Access split-screen brand page | EXISTS | `AccessPage.jsx` + `ga-access.css` |
| 2b | Existing auth endpoints preserved | EXISTS | `authApi.login/bootstrap/session` |
| 3 | Vault greeting strip | EXISTS | `VaultHome.jsx` |
| 3b | Module grid from registry + ACL | EXISTS | `vaultModules.js` + VaultHome |
| 3c | LIVE/BETA/LOCKED chips | EXISTS | `StatusPill` + locked cards |
| 3d | Pinned “Your desk” | DEFERRED | No pin field — see `DEFERRED.md` |
| 3e | Chrome footer + env tag | EXISTS | Vault footer |
| 4 | Shared App shell top bar | EXISTS | `PlatformShell.jsx` |
| 4b | `<PageHeader/>` | EXISTS | `ga-kit/PageHeader.jsx` |
| 5 | Cmd/Ctrl-K command palette | EXISTS | Module-name search only |
| 6 | Motion system | EXISTS | `ga-motion.css` |
| 7 | Lighthouse / render tests | DEFERRED | No frontend test runner wired |
| 8 | ga-kit library | EXISTS | `client/src/components/ga-kit/` |
| 8.2 | Module-by-module theming | PARTIAL | Shell + tokens; deep restyles deferred for financial screens |

## Risk-ranked rollout

1. **Lowest risk (pilot):** Access + Vault home + shared shell chrome + Admin Security tokens/`PageHeader`
2. **Medium:** Hiring (forms/KPIs, no financial write-path)
3. **Medium-high:** Post Sales (many screens; collections/demands write-path → careful)
4. **High / last:** DM Governance billing/invoices/approvals; Cashflow/Finance legacy HTML (iframe — tokens on shell only)

## Deferred candidates (will also land in `DEFERRED.md`)

- User-persisted pinned modules (requires schema/API)
- Federated per-module search results (no endpoints)
- Deep restyle of legacy HTML apps inside iframes
- Full CSS rewrite of financial write screens beyond tokens + PageHeader
- Lighthouse CI automation (no tooling present)
- New test framework install beyond lightweight render smoke scripts

## Zero-behaviour contract

- Keep all routes, `authApi`, ACL app IDs, launch URLs, and validations unchanged.
- Additive CSS/components only.
- Unauthorized apps remain inaccessible (LOCKED chip may display for discoverability without changing open behaviour).
