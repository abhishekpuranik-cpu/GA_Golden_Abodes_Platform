# Phase 0 — Deferred Items

Items below were **explicitly not fully inventoried** in Phase 0, with the reason and what would be needed to close the gap before Phase 2 touches them.

---

## 1. Execution (Construction KPIs) — full UI, DEFERRED (hard blocker)

**Why deferred:** This is an external, unbundled application. There is no HTML file under `client/public/legacy/`, no React route in `App.jsx`, and no iframe embed anywhere in the platform (confirmed by full-text search). The Vault only stores a resolvable URL (`ga_execution_dashboard_url` / `VITE_EXECUTION_DASHBOARD_URL` / a server-side `executionDashboardUrl`) and opens it as a plain external link.

**What is inventoried instead:** `FUNCTIONAL_INVENTORY_execution.md` covers the vault tile metadata and the 3-tier URL resolution/override mechanism only.

**To close before Phase 2 work on this module:** Locate the actual dashboard application (likely a separate deployment/repository not present in this workspace or its known siblings), then run a full Phase 0 pass against its live source using the same per-screen format used for the other apps.

---

## 2. Legacy runtime/business-logic files treated as black boxes (partial deferral)

These files are the single-file legacy apps' entire *data and interaction logic* layer. Where the HTML markup/CSS/shell was fully inventoried, the runtime script's exact internal algorithms were **not** transcribed line-by-line — they were characterized behaviorally (inputs, outputs, side effects) rather than reproduced as pseudocode, because doing so would either (a) not add parity value beyond "preserve this file's behavior exactly," or (b) require reproducing tens of thousands of lines of minified/dense JS.

| App | File | Note |
|---|---|---|
| Sales Dashboard | `ga_sales_dashboard_runtime.js` (89KB, separate from the HTML) | Explicitly called out in `FUNCTIONAL_INVENTORY_sales_dashboard.md` §5 as a black-box dependency — chrome/markup is fully inventoried, but chart/KPI computation logic lives entirely in this file and must be diffed/preserved separately if it's ever touched. |

**To close:** If Phase 2 needs to modify (not just restyle) sales dashboard data logic, run a dedicated read-through of `ga_sales_dashboard_runtime.js` before making changes.

---

## 3. Oversized single-file legacy apps — structural inventory only, not exhaustive field-by-field (partial deferral)

Three legacy apps are themselves single HTML files large enough (320KB–391KB) that a full line-by-line transcription was impractical within Phase 0's efficiency constraints. For these, the inventory captures **all tabs, sections, buttons, modals, status vocab, storage keys, and cross-app contracts**, but does **not** enumerate every individual form field in the densest sections (in particular, the multi-hundred-line financial-model and KPI-manager sections).

| App | File | Densest under-enumerated section(s) |
|---|---|---|
| Resource Planner (V2) | `GA_ResourcePlanner_V2.html` (~320KB) | Individual Headcount Plan / Shared Cost / Team roster input cells (structure and buttons captured; not every column literally listed) |
| Project Acquisition (V3) | `GA_OrgResourcePlanner_V3.html` (~391KB) | The ~970-line per-project Financial Model (`renderFinModel`) — all 6 numbered sections and their purpose are captured, but not every individual numeric input; the GA DM per-project planning inputs are similarly summarized rather than enumerated |
| Finance KPI & Governance | `GA_Finance_KPI.html` (~126KB) | Fully inventoried in practice (file was read in full), flagged here only because the SR/JR/FN KPI template *catalogs* (27 KPI definitions total) were transcribed as summarized category lists rather than reproducing every `target`/`formula`/`src` string verbatim |

**To close:** Before a Phase 2 reskin actually rebuilds these screens' input layers (not just re-themes them), re-read the specific function in the live file (`renderFinModel`, `renderKpiMgr`, `renderRes`, `renderShared`, `renderTeam`, etc.) referenced in each inventory and extract the literal field list at that time, since these are also the files most likely to have drifted since this audit.

---

## 4. Shared black-box sub-components (not separately inventoried)

These are reused React components referenced from an inventoried page but whose *internal* controls were not enumerated, since they're shared infrastructure rather than page-specific:

| Component | Referenced from | Note |
|---|---|---|
| `BandwidthReport` | Admin Security | Renders a bandwidth visualization from `authApi.bandwidthReport()`; internal controls/labels not inventoried. |
| `ProjectAssignPicker` | Admin Security (Create user, per-user edit) | Multi-select picker for PreConstruction projects; internal controls not inventoried. |
| `GAActivityCalendar` / `ga_activity_calendar_core.js` | Sales Dashboard, Marketing KPI, Resource Planner V2 (HR Calendar), Project Acquisition V3 (Activity Calendar) | Shared calendar widget; mount options (title/subtitle/accent/legend/events) are documented per-caller, but the widget's own internal UI (day cells, navigation) is not separately inventoried. |
| `GAVaultAskAI` / `VaultAskAi` | Nearly every app | Shared "Ask AI" chat widget; each app's *context-building* logic is documented per-app, but the widget's own chat UI/controls are not separately inventoried. |

**To close:** If Phase 2 reskins these shared components, inventory them once (they'll affect every consuming app identically) rather than per-app.

---

## Summary

Only **Execution** is a *hard* deferral (no accessible source at all). Everything else above is a *scoping* deferral — the structural/behavioral contract is captured, but literal exhaustive field lists for the three largest legacy files, plus a handful of shared sub-components, should be re-read from the live source immediately before any Phase 2 change that goes beyond visual restyling.
