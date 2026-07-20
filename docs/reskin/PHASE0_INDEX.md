# Phase 0 — Functional Inventory Index

This index catalogs all Phase 0 functional-inventory documents produced for the GA Platform reskin, and defines the **module order for Phase 2** (the reskin implementation phase). Every inventory below was built by reading the live codebase (React source, or the shipped legacy HTML/JS) — none were invented. They are intended to serve as **parity contracts**: before/after any visual reskin, the controls, labels, data/status strings, and side effects listed must still match.

See also: `DEFERRED.md` for apps/screens explicitly out of scope for Phase 0/2, and `FUNCTIONAL_INVENTORY_dm_governance.md` (pre-existing, untouched by this pass).

---

## Inventory files

| # | File | Source | Size |
|---|---|---|---|
| 1 | `FUNCTIONAL_INVENTORY_dm_governance.md` | DM / SPV Governance React app (pre-existing — not regenerated) | 40,982 B |
| 2 | `FUNCTIONAL_INVENTORY_cashflow.md` | GA Cashflow V1 (copied from repo root) | 23,152 B |
| 3 | `FUNCTIONAL_INVENTORY_post_sales.md` | `client/src/pages/postsales` + `App.jsx` routes | 32,036 B |
| 4 | `FUNCTIONAL_INVENTORY_hiring.md` | `client/src/pages/hiring` | 15,681 B |
| 5 | `FUNCTIONAL_INVENTORY_preconstruction.md` | Sibling repo `GA_PreConstruction_React` | 14,023 B |
| 6 | `FUNCTIONAL_INVENTORY_admin_security.md` | `AdminSecurityPage.jsx` | 6,788 B |
| 7 | `FUNCTIONAL_INVENTORY_sales_dashboard.md` | Legacy `ga_sales_dashboard.html` | 6,254 B |
| 8 | `FUNCTIONAL_INVENTORY_marketing_kpi.md` | Legacy `GA_MarketingSales_KPI_Dashboard.html` | 11,105 B |
| 9 | `FUNCTIONAL_INVENTORY_finance_kpi.md` | Legacy `GA_Finance_KPI.html` | 17,160 B |
| 10 | `FUNCTIONAL_INVENTORY_resource_planner_v2.md` | Legacy `GA_ResourcePlanner_V2.html` + `LegacyAppShell` | 11,908 B |
| 11 | `FUNCTIONAL_INVENTORY_project_acquisition_v3.md` | Legacy `GA_OrgResourcePlanner_V3.html` + `LegacyAppShell` | 12,906 B |
| 12 | `FUNCTIONAL_INVENTORY_execution.md` | Vault wiring only — external app, no source in repo (deferred) | 3,365 B |

*(Sizes as generated in this pass; re-check on disk if files are edited afterward.)*

---

## Module order for Phase 2 (lowest risk first; cashflow & financial write-paths last)

The ordering below front-loads modules that are **read-heavy, low-blast-radius, and least entangled** with other systems, and pushes modules with **live financial write-paths, cross-app data contracts, or admin/security implications** to the end. Cashflow (the platform's most financially sensitive, most cross-referenced app) is deliberately last.

| Order | Module | Why this position |
|---|---|---|
| 1 | **Admin Security** | Small, self-contained, single screen, no legacy-HTML twin, no financial data — safest place to prove out new UI patterns. |
| 2 | **Hiring** | Pure React, self-contained CRUD-style app (requisitions/candidates/interviews), no legacy HTML twin, no write-paths into other apps' financial data. |
| 3 | **Post Sales** | Larger React surface but still transactionally isolated to post-sales operations (units, documents, demands, tickets) — no cross-app financial writes. |
| 4 | **Sales Dashboard** (legacy HTML) | Read-mostly analytics dashboard; import/export exists but no cross-app write-path; runtime.js is a well-isolated black box to preserve behind a new shell. |
| 5 | **Marketing KPI** (legacy HTML) | Same profile as Sales Dashboard — self-contained, single-file, read-mostly with local Excel/JSON import; broker/CP classification rules must be preserved but are self-contained. |
| 6 | **Execution (vault wiring only)** | Trivial — it's just a tile + URL resolver with no in-repo UI; reskinning is limited to the vault tile itself. Order here reflects "do it whenever" — zero risk either way. |
| 7 | **PreConstruction** | External React app; larger state machine (views/modals) and Mongo sync, but no financial write-paths shared with Cashflow/DM Governance — sequenced after the simpler wins to reuse the by-then-established component patterns. |
| 8 | **Resource Planner (V2)** | Has a real (if simple, password-only) admin gate and depends on a cross-app sync contract from V3 (`ga_rp_projects`) — must be reskinned only after the team is comfortable preserving legacy `localStorage` contracts exactly. |
| 9 | **Project Acquisition (V3)** | Very large financial-modeling surface (SPV P&L, investor returns, fund milestones) plus an external AI (Claude) document-analysis pipeline and its own cross-app pushes to both V2 and Cashflow — high complexity, but not itself the canonical financial system of record. |
| 10 | **Finance KPI & Governance** | Deep business logic (KPI templates, weighted scoring, appraisal sign-off, audit trail, server-backed admin gate) with real HR/compensation consequences if broken — sequenced near the end for that reason, though it does not touch Cashflow's ledger directly. |
| 11 | **DM / SPV Governance** | Platform's governance/compliance system of record for SPVs — high blast radius, but positioned just before Cashflow since it's "adjacent to" rather than "the" financial ledger. |
| 12 | **Cashflow (V1)** | **Last.** This is the platform's core financial write-path (ledgers, actuals, approvals) referenced by nearly every other module (Resource Planner, V3, DM Governance, Finance KPI all read or write in its direction). Any regression here has the widest and most costly blast radius — reskin only after every other module's patterns, shared components, and legacy-parity process have been validated end-to-end. |

### Cross-cutting sequencing notes
- **Shared legacy chrome first:** Since Resource Planner (V2) and Project Acquisition (V3) share `LegacyAppShell.jsx` and `usePlannerIframeSync`, any shell-level reskin work should land once and be validated against V2 (simpler) before V3 (far more complex) consumes it.
- **Shared components:** `GAVaultAskAI`, `GAActivityCalendar`, `VaultAskAi` (React) are reused across almost every module — reskin these shared components early (effectively "module 0", not tied to a single app) so downstream modules inherit the new look consistently.
- **Cross-app contracts to re-verify after any reskin touching data shapes:** `ga_rp_projects` (V3→V2), `pushV3CashflowHints()` (V3→Cashflow), Mongo `GET/PUT /api/apps/{appId}/state` payload shapes (Marketing KPI, Finance KPI, Sales Dashboard, Resource Planner/V3 via the shell), and the Hiring↔Resource-Planner-V2 KPI pull (§10 of `FUNCTIONAL_INVENTORY_resource_planner_v2.md`).
