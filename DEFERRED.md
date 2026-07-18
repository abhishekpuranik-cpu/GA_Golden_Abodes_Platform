# DEFERRED — Brand UI rebuild

Items skipped under the zero-behaviour / non-destructive rule.

| Item | Reason | Paths |
|---|---|---|
| Persisted pinned modules (“Your desk”) | Requires `user.pinnedModules` schema + API migration | `server/routes/auth.js`, user documents |
| Federated per-module search results | No module search endpoints exist | `server/` |
| Deep restyle of legacy HTML apps (Cashflow, Sales, Finance KPI, Marketing KPI) | Iframe content; behaviour risk; tokens applied to shell only | `client/public/legacy/*`, `LegacyAppShell.jsx` |
| Full CSS rewrite of Post Sales Demands / Loans write screens | Financial write-paths flagged RISK — shell + tokens only | `client/src/pages/postsales/*`, `post-sales.css` |
| Full CSS rewrite of DM billing / invoices / approvals | Highest-risk financial paths — shell + tokens only | `client/src/pages/dmGovernance/*`, `dm-governance.css` |
| Lighthouse CI automation | No Lighthouse tooling in repo | `package.json` |
| New Vitest/Jest render suite | Spec allowed lightweight smoke; installing a test framework would add deps beyond palette | — |
| Screenshot PNG gallery under `docs/theme-screenshots/` | No headless screenshot runner wired; deferred to manual QA | — |
| Removing module-internal topbars | Spec: keep module-internal nav; shared `PlatformShell` is additive | Hiring / Post Sales / DM layouts |
