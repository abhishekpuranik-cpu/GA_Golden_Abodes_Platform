# Functional Inventory — GA Resource Planner (V2) (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `v2_resource_planner`
**Route:** `/app/resource-planner` — `<RequireAuth appId="v2_resource_planner"><LegacyAppShell title="Resource Planner (V2)" htmlFile="GA_ResourcePlanner_V2.html" appId={APP_IDS.V2_RESOURCE_PLANNER} keysList={APP_LOCAL_STORAGE_KEYS[...]} workspaceBlobKey="ga_rp_state_v1" /></RequireAuth>`
**Doc title:** "GA Resource Planner"
**Source of truth:** `GA_Golden_Abodes_Platform/client/public/legacy/GA_ResourcePlanner_V2.html` — single self-contained file (~4,300 lines, ~320KB), inline JS, no separate runtime file. Given the file's size, this inventory was built via targeted structural extraction (tabs, buttons, section headers, modals, storage keys, admin gate, sync mechanism) rather than a full line-by-line read; treat as a faithful structural map, not a literal transcript of every input field.

---

## 1. Shell (`LegacyAppShell`)

- Iframe-embedded inside the React shell; toolbar above the iframe provides: Vault breadcrumb link, title, version tag, **New team update — Load latest** (conditional), **Auto-save 60s** checkbox, **Restore from cloud**, **Restore snapshot (last 2)** dropdown, **Save to cloud now** — all generic `LegacyAppShell`/`usePlannerIframeSync` chrome shared with V3 (see `FUNCTIONAL_INVENTORY_project_acquisition_v3.md` §1 for identical behavior).
- `VaultAskAi` floating widget mounted with `appId='v2_resource_planner'`, context built via shared `buildPlannerAskContext(appId, title)`.

## 2. In-page top bar (inside the legacy HTML)

- `#adm-badge` — "ADMIN · Abhishek Puranik" (hidden unless admin unlocked)
- Button **🔒 Admin** (`toggleAdmin()`) — prompts for password (`ADMIN_PW='ga@admin'` hardcoded); wrong password → alert "Wrong password."; toggles a module-level `ADMIN` flag (no server-side gate, unlike Finance KPI)
- Button **⟲ Sync** (`syncFromV3()`, `#sync-btn`)
- Button **+ Add Project** (`showAddProjectModal()`)
- Button **📋 Paste JSON** (`pasteProjectsFromClipboard()`, title "Paste JSON copied from V3 Push button")
- Button **💾 Save** (`saveState()`)
- `#sync-status` — live sync status line (colored dot + message, see §7)
- `#origin-warn` banner (hidden unless page opened via `file://`): "⚠ Sync not available — wrong URL" — explains that `file://` pages can't receive V3 pushes, with a link to `http://localhost:8765/rp` and instruction to run `Start_GA_Planner.bat` first

## 3. Tabs (`showTab(id)` / `renderTab`)

| id | Label |
|---|---|
| `dash` (default) | ▲ Dashboard |
| `band` | ◇ Band Structure |
| `res` | 📊 Headcount Plan |
| `cost` | ⚖ Cost vs Plan |
| `team` | 👤 Team View |
| `shared` | ⚖ Shared Costs |
| `pnl` | 📈 P&L View — Revenue vs Cost (hidden by default: `style="display:none"`, surfaced via internal state, not a normal nav item) |
| `kpi` | 🎯 Team KPIs |
| `hrcal` | 📅 HR Calendar |
| `hire` | 💼 Hiring |

## 4. Dashboard (`renderDash`)

- **📊 Headcount health** card summary + button **Headcount Plan** (jump to `res`)
- **📅 Upcoming HR activities** card + button **Open calendar** (jump to `hrcal`); empty state: "No upcoming events — plan your first activity" (jump to `hrcal`)
- **⚠ Critical roles to fill ({n})** alert list + button **View org structure** (jump to `band`)
- Quick-nav buttons: **◇ Org structure**, **👤 Team & payroll**, **🎯 Team KPIs**, **📅 HR calendar**, **💼 Hiring**

## 5. Band Structure (`renderBand` / `renderBandDetail` / `renderBandPlanMatrix` / `renderBandActualStructure`)

- Band-level cards colored by `BAND_COL[bandId]`, each showing planned vs approved vs actual headcount and a Scope/Status/E/S/A/Gap table (Existing / Sanctioned / Approved / Gap columns)
- Search box `#org-search` — "Find a person or role…"
- **Assign to {role}** modal (`org-modal-title`) — search input `#band-modal-search` ("Search by name or role…"), person picker with allocation chips (`renderEmpAllocChips`)
- Per-role capacity **Override** number input; per-role condition inputs (numeric + free-text "Notes…", e.g. "1 per 50k sqft")
- Cross-link: "Tag projects per person in **Team View**. Click **Save** after changes." (link jumps to `team`)
- Button **⟲ Sync** duplicated inline near the top of this tab

## 6. Headcount Plan (`renderRes` / `renderResAndHire`)

- Header **📊 Headcount Plan**
- Buttons: **⤓ Download Template**, **⤒ Upload Template** (hidden file input `#hc-file-input`), **⤓ Hiring Rules** (`dlHiringRulesTemplate`), **⤒ Upload Rules** (hidden file input `#hrules-file-input`), **📄 Export Report** (`exportHCReport`), **👥 Sync E from Team** (title: "Populate Existing (E) column from Team View employee data")
- Per-project sections: **🏘 Corporate (Shared)** and one per project (**🏛 {project name}**) with headcount rows (Existing/Sanctioned/Approved/Gap-style matrix, consistent with Band Structure)

## 7. Cost vs Plan (`renderCost`)

- Table: Project, Org Cost, DM Budget, Variance, Org/GDV — compares organization-modeled headcount cost against the DM (Development Management / Cashflow) budget per project

### P&L View (hidden tab, `renderPnL`)
- Header **📈 P&L View — Revenue vs Cost**
- Per-project row includes an editable **Marketing %** input (% of GDV) feeding a P&L calc; totals row

## 8. Team View (`renderTeam`)

- Header **👤 Team View**
- Buttons: **⤒ Export** (`exportTeamReport`), **⤒ Upload** (hidden `#team-file-input`), **+ Create Role** (`showCreateEmployeeModal`)
- Warning banner: "⚠ Team/Role mapping gaps detected" (when applicable)
- Filters: **All Projects** / per-project select, **All Verticals** / per-vertical select, **All Bands** / "Band {b}" select, search box `#team-search` ("🔍 Search...")
- **Create Employee / Role** modal: Emp ID (placeholder "GAE099"), Full Name*, Role/Designation (placeholder "Site Engineer"), Vertical (placeholder "Construction - Civil"), Band select (`0`/`A1`/`A2` default/`A3`/`B1`), Ind/Shared select (—/Individual/Shared), Fixed Salary, Variable, PF, Insurance, Allowance, Meal (all numeric, default placeholder "0"), Project name (100%) free text

## 9. Shared Costs (`renderShared` / project-costs sub-section)

- Header **⚖ Shared Cost Manager**
- Buttons: **⤓ Download Template**, **⤒ Upload Template** (hidden `#sc-file-input`)
- Summary stat cards: **Total Monthly**, **Annual**, **Active Projects**, **Per Project / mo**
- Editable cost rows: Monthly amount (number, placeholder "0"), Notes (text, placeholder "Notes...")
- **🏛 Project Direct Costs** sub-section: per-project cost rows (Description, Monthly, Notes), e.g. placeholder "Wakad Sales Office"
- **+ Add Project** modal: Project Name* (placeholder "e.g. Riverside Heights"), Location (placeholder "City, State"), GDV (approx) numeric

## 10. Team KPIs (`renderKpi`)

- **📋 Live hiring KPIs (GA Hiring app)** panel (cross-app KPI pull)
- Per-employee/role KPI sets, editable in "Edit KPIs — {set.title}" panel: frequency select (M/Q), rule-option selects (`RULE_OPTS`), **+ person** button (add another person to a KPI set), delete-KPI button (×), **⟲ Reset to handbook** button (restores default KPI template), **⤓ Export scores (Excel)** button (`exportKpiXlsx`)
- Monthly scorecard grid: sticky **Monthly Weighted Score** row and **Performance Band** row per employee across `KPI_MONTHS`, colored by `KPI_SCOL`/band thresholds
- Link buttons to open a role directly in Band Structure ("◇ {role} — Band {n}")

## 11. HR Calendar (`renderHrCal`)

- Calendar-style month view (`hrCalCursor`) of HR activities/events
- Button **Plan something** on empty days → opens **New HR activity** / **Edit event** modal (`org-modal-title`, title field placeholder "e.g. New hire induction")
- Requisition-linked view: **🏛 Hiring Tracker** panel

## 12. Hiring (`renderHire`)

- **New hiring requisition** modal — Role title (placeholder "e.g. Site Engineer"), Project (optional, placeholder "Corporate or project name")
- Button link **Open Hiring app →** (`hiringAppHref`, `target="_top"` — deep-links to the in-platform Hiring app, cross-app navigation)
- Health score card ("{n}/100") + KPI mini-stats row
- **Open from headcount plan ({n})** section — requisitions auto-suggested from Headcount Plan gaps
- Per-requisition row: Candidate name (text), Source (text, placeholder "Source (e.g. LinkedIn)"), Stage select (`HIRE_STAGES`)
- Job description actions per role: **👁 View**, **⤓ Download**, **↺ Replace JD**, or **⤒ Upload JD (PDF/Word)** if none exists yet
- **Recently closed / joined** table: Role, Candidate, Stage, Opened, Joined, Days

---

## 13. Project data sync model (parity-critical — distinct from other legacy apps)

Unlike Marketing KPI / Finance KPI, this app does **not** talk to Mongo directly. Project list is sourced from V3 (Org / Project Acquisition):
- On load and on `visibilitychange`, `syncFromV3()` reads `localStorage['ga_rp_projects']` (an array pushed by V3's "Push to RP" button) and rebuilds `PROJS`/`_D` via `setRpProjectsFromV3()`.
- If that key is empty/missing: shows gold status "V3 open — click Push to RP in V3 to sync projects" (if V3 state exists) or "Open GA_OrgResourcePlanner_V3 first, then click Push to RP".
- If opened via `file://` (both apps running as local files, no shared origin so `localStorage` isn't shared): shows the `#origin-warn` banner and status "File:// mode — use Paste JSON button below or run Start_GA_Planner.bat"; the **Paste JSON** button provides a manual `window.prompt` fallback that accepts pasted JSON from V3's clipboard export and calls `normalizeV3ProjectsForRP()` (excludes "Non Adopted" projects — only Pipeline/Planned/Active are imported).
- Local persistence: `localStorage['ga_rp_state_v1']` (versioned blob: `{v:3, ts, ex, ap, capOv, rel, col, alloc, kpiAct, kpiNames, kpiSlots, kpiDefs, bandAssign, hrEvents, hirePipeline, scen, hcRules, custom, cond, projFlags}` plus later-merged `sc`/`pc` shared/project-cost blobs) and `localStorage['ga_rp_projects']` (raw project array cache) — these are the keys the React `LegacyAppShell`/`usePlannerIframeSync` watches (`workspaceBlobKey="ga_rp_state_v1"`) and pushes to Mongo cloud storage on the React side (V2 itself has no direct Mongo calls; cloud sync is entirely delegated to the shell).

## 14. Secondary surfaces / side effects
- Admin mode is a **client-side-only** password gate (`ga@admin`), unlike Finance KPI's server-backed platform-session admin — no audit trail, no per-user distinction.
- Import/export flows (Excel/JSON) throughout: Headcount Template, Hiring Rules Template, Team roster, Shared Cost Template — each with matching Download/Upload button pairs; parse errors surface via `alert('Import error: ...')` / `alert('Import failed: ...')`.
- Team roster import explicitly does a **full overwrite** with an automatic pre-import snapshot ("Previous data saved as snapshot — use Restore button to roll back").
- `VaultAskAi` mounted from the React shell (not from inside the legacy HTML, unlike Marketing/Finance/Sales dashboards which self-mount `GAVaultAskAI`).

## 15. Parity notes
- This app's admin gate and V3-sync mechanism are unique among the legacy tools inventoried — any reskin must preserve the `localStorage['ga_rp_projects']` contract with V3 exactly (shape produced by V3's "Push to RP", consumed by `setRpProjectsFromV3`/`normalizeV3ProjectsForRP`), or cross-app sync silently breaks.
- The P&L tab is intentionally hidden from the tab bar by default (`display:none` on `#tab-pnl`) — confirm with product owner whether this is a dead feature or gated by a runtime flag before deciding to drop or keep it in the reskin.
