# Functional Inventory — GA Project Planning / Org Resource Planner (V3) (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `v3_project_acquisition`
**Route:** `/app/org-planner` — `<RequireAuth appId="v3_project_acquisition"><LegacyAppShell title="Project Acquisition (V3)" htmlFile="GA_OrgResourcePlanner_V3.html" htmlCacheVersion="20260616.2" appId={APP_IDS.V3_ORG_PLANNER} keysList={...} workspaceBlobKey="ga_planner_state_v1" defaultAutoSave={false} /></RequireAuth>` — note `defaultAutoSave=false` (periodic autosave disabled here specifically because it was overwriting Mongo with stale data; comment in `LegacyAppShell.jsx`: "periodic save was overwriting Mongo with stale 2-project tabs; server merge fixes that, but disabling avoids noise")
**Doc title:** "Golden Abodes Project Planning"
**Source of truth:** `GA_Golden_Abodes_Platform/client/public/legacy/GA_OrgResourcePlanner_V3.html` — single self-contained file (~5,750 lines, ~391KB), inline JS. Given the file's size, this inventory was built via targeted structural extraction (tabs, section headers, buttons, modals, storage/sync keys) rather than a full line-by-line read; treat as a faithful structural map of controls/behavior, not a literal transcript of every input field (the financial model in particular has dozens of granular numeric inputs not individually enumerated here).

---

## 1. Shell (`LegacyAppShell`) — identical chrome to V2

- Toolbar: Vault breadcrumb, title, version tag, **New team update — Load latest** (conditional), **Auto-save 60s** checkbox (unchecked by default here), **Restore from cloud**, **Restore snapshot (last 2)** dropdown, **Save to cloud now**
- `VaultAskAi` floating widget, `appId='v3_project_acquisition'`
- `renderCloudBar()` inside the legacy HTML is a deliberate no-op when embedded in an iframe ("Platform vault embeds this app in a full-height iframe with its own Save/Restore toolbar") — i.e. the legacy app defers all cloud save/restore UI to the React shell above.

## 2. In-page top bar

- Button **⇒ Push Projects to RP** (`pushProjectsToRP()`) — writes the current project list to `localStorage['ga_rp_projects']` for the Resource Planner (V2) to consume (see `FUNCTIONAL_INVENTORY_resource_planner_v2.md` §13); also calls `pushV3CashflowHints()`
- Button **🔒 Set delete password** (`setV3ProjectDeletePassword()`, title "Required before you can delete a project") — a lightweight per-browser password gate specifically protecting project *deletion* (distinct from V2's whole-app admin password)

## 3. Tabs (`showTab(id)` / `renderAll`)

| id | Label |
|---|---|
| `dashboard` (default) | ▲ Dashboard |
| `projects` | 🌏 Projects |
| `gadm` | 📈 GA DM |
| `calendar` | 📅 Activity Calendar |
| `dd` | 📄 Due Diligence |

## 4. Dashboard (`renderDashboard`)

- Header "Portfolio Dashboard" + project count (badge "Target GDV" shown if no project has a full financial model yet)
- Status filter chips: **All**, **Active**, **Planned**, **Pipeline**, **Non Adopted** (each shows count, click filters the charts below)
- **Investor** filter dropdown (All + distinct investor names pulled from all projects' investor records)
- KPI strip (6 cards): **Portfolio GDV**, **Operational Cost** (% of GDV), **SPV Net Profit** (margin %), **Active Projects** (+ planned count), **Avg Completion** (%), **Land + Const.** (combined cost base)
- Left column (filtered by status/investor): **SPV — GDV vs net profit** bar chart, **Cost stack by SPV (₹ Cr)** chart, **Construction completion** chart, **SPV net profit by project (₹ Cr)** chart; hint link "Open or edit financial models per SPV from the **Projects** tab."
- Right column: **SPV P&L Waterfall** card (portfolio-level waterfall: Revenue → Land Costs → Construction → Operational Cost → SPV Profit)
- Empty-state: "No projects match the current filters."

## 5. Projects (`renderProjects`)

- Hero: "Project Planning" (or "Project Planning — Draft Model" in single-project draft mode opened via **↗ Tab**) + subtitle "Pipeline first, then Planned, then Active — open a model to edit assumptions and print."
- Status chips summary (Pipeline / Planned / Active / Non Adopted counts)
- Button **+ Add project** (`openProjectModal('new')`) — hidden in draft-tab mode
- Table grouped by status (group header rows show status badge + "{n} projects"), columns: **Project** (name + location), **Status**, **Type**, **Land Area**, **Referred By**, **Contact**, **Map** (pin link), **Saleable Area**, **Units**, **Total Revenue**, **Operational Cost**, **Last Modified**, **Actions**
- Row actions: **▼ Model** / **▲ Close** (expand/collapse full financial model inline), **↗ Tab** (`openModelDraftTab` — opens that single project as an isolated draft in a new browser tab via `?draftPid=`, with its own **💾 Save & Close** button that persists via `saveDraftModelNow` and shows alert "Saved to database. You can refresh the main tab to see latest values."), **✎** (edit project modal), **✕** (delete project — gated by the delete password if set)
- Empty state: "No projects yet — click **Add project** to start."

### 5a. Add/Edit Project modal (`openProjectModal`, `renderProjFormFields`)
Representative fields (not exhaustive): Project Name*, Location, GDV (approx), Deal type, Project type / JV sharing type, Referred by, Contact Details (placeholder "Phone, email, or other contact"), Land Area (+ unit), Refundable Deposit (not counted in project cost) / Non-Refundable Deposit (added to project cost) — both support a "type in ₹ Crores" toggle, Google Maps Pin (placeholder "Paste Google Maps link or coordinates"), Approval status, plus status (Pipeline/Planned/Active/Non Adopted).

### 5b. Full Financial Model (`renderFinModel`, expands inline per project row)
Header: "{Project} — Full Financial Model" (+ "DRAFT (manual save)" tag in draft-tab mode); hint "Blue inputs = editable · White fields = auto-calculated · All values update live"; checkbox **"Type large amounts in ₹ Crores (e.g. 2 = ₹2 Cr, 0.3 = ₹30 L)"**; buttons **💾 Save & Close** (draft mode only), **✕ Close model**, **🖨 Print** (`printFinModel`), **📥 Import Area Working** (file input), conditional **Apply Shine Plaza sheet** button (name-matched Easter-egg/template loader for a specific project).

Numbered sections (`secHdr`):
1. **Key Facts / Assumptions**
2. **Revenue for Developer**
3. **Projected Expenses** — includes collapsible **INVESTOR CASH OUTFLOWS (reference only)** sub-block: Investor Principal Amount (returned at end of investment term), Investor Profit Sharing (Post-Project) (% of Gross Profit, editable)
4. **Profit Summary** (no numbered header but positioned as section 4) — **Gross Project Profit** card (Total Developer Revenue, Total Projected Expenses, Gross Profit, Margin %), **Investor Return Schedule** panel (`renderInvestorReturnSchedule`), **Quick Ratios** card (Cost/area, Revenue/area, Profit/area, Construction % of expenses, Operational Cost % of revenue) — plus **Investor Proposals** sub-section (`renderInvSection`, editable investor rows: name, notes/deal terms, etc.)
5. **Fund Requirement — Milestone Drawdown** — Launch date filter (drives inventory-gap calc for Investor Sale); milestone rows (date, particular/description, amount, include checkbox), consultant fee rows (name, rate) via **+ add consultant** / delete
6. **GA DM** — inline summary feeding into the dedicated GA DM tab

## 6. GA DM (`renderGaDm`)

- **GA Development Management — Executive Overview** card: subtitle "Operational Cost = % of Total Developer Share (Commercial + Residential) per SPV. Set all assumptions in the Planning section below."; **Net margin** stat (top-right)
- Stat grid (6 cards): **Operational revenue** (+ "{n} SPVs"), **Total GA cost** ("consultants + team + mktg"), **GA net profit** (+ margin %), **Consultant fees** ("external advisory"), **Team salaries** ("all teams + HO"), **Marketing + CP** ("channel + brand")
- **P&L waterfall** panel: Operational Cost revenue → Less: Consultants → Less: Team salaries → Less: Marketing + CP → **GA Net Profit**, plus "Net Margin vs GDV" and "Portfolio GDV (topline)" reference lines
- Per-project editable planning rows (rates/fees feeding the above, via `ufinDm`) — not individually enumerated here (see parity note)

## 7. Activity Calendar (`renderCalendar`)

- Info banner: "Project start and target completion dates from the acquisition portfolio."
- Mounted via shared `GAActivityCalendar` (`#v3-cal-root`): title "Acquisition timeline", subtitle "V3 Org Planner · active projects", legend **Project start** (indigo) / **Target completion** (violet); click → `alert(event title)`

## 8. Due Diligence (`renderDueDiligence`)

- Top banner built by `buildKeyBanner()` — shows AI-connection mode/status (proxy vs direct API key — see §9)
- Header "Due Diligence" + subtitle "Upload 7/12 or Mojni → AI reads the document → detailed structured report"; disclaimer chip: "**Screening tool only.** Engage a qualified advocate before any transaction."
- **Projects** list — one card per project: **📋 Analyse document** button (shows "⟳ Analysing…" while running), **📄 Upload 7/12** and **📐 Upload Mojni** file inputs (image/PDF), uploaded-doc chip with **✕ Clear**, hint "Upload a 7/12 or Mojni PDF, then click Analyse" when empty; inline error banner on failure
- **Results** — one card per completed analysis: "{Project} — Due Diligence Report" + analysis timestamp; color-coded top border (red = deal blocker/encumbrance detected, amber = needs verification, green = clean) derived from scanning the AI report text for 🔴/🟡 markers; markdown-lite rendered report body (bold, headings, tables, horizontal rules); button **✓ Apply to financial model** (`applyDocToModel` — pushes extracted plot-area figures into the financial model) shown only if area was extracted; button **🗑 Clear**; disclaimer: "This is an AI-generated analysis of the uploaded document only. It does not constitute a legal title opinion. Always engage a qualified advocate and perform physical searches at Sub-Registrar's office before any transaction."

---

## 9. Due Diligence AI pipeline (parity-critical)
- Model: `DD_MODEL = 'claude-sonnet-4-6'` (comment: "Best for Devanagari OCR")
- Connection modes (`_connMode`): `proxy` (auto-discovers a local proxy on a scanned port range starting at `8765`) or a direct user-supplied API key (`getDDKey()`) — `buildKeyBanner()` renders differently per mode (green "proxy connected" banner vs a key-entry prompt)
- This is the only inventoried legacy app that calls an external LLM directly from the browser for document OCR/analysis — any reskin must preserve the proxy-discovery + API-key fallback flow exactly, including the legal disclaimer copy (compliance-sensitive).

## 10. Storage / sync keys (parity-critical)
- `GA_LS_KEY = 'ga_planner_state_v1'` — matches the React shell's `workspaceBlobKey`; primary local + cloud-synced state blob (`gaSerialise()`)
- `GA_CONF_KEY = 'ga_cloud_url'`, `GA_WORKSPACE_PREFIX = 'ga_'`
- `localStorage['ga_rp_projects']` — written by `pushProjectsToRP()` / `writeGaRpProjects()` for V2 consumption (see `FUNCTIONAL_INVENTORY_resource_planner_v2.md` §13)
- `localStorage['ga_v3_last_manual_save']` — `{pid, ts}` marker set when a draft tab is saved
- `pushV3CashflowHints()` — pushes derived figures toward the Cashflow app (cross-app hint, exact payload not detailed here)
- No Mongo calls exist directly in this file — cloud sync, like V2, is entirely delegated to the React `LegacyAppShell`/`usePlannerIframeSync`.

## 11. Parity notes
- V3 has **no whole-app admin password** (unlike V2's `toggleAdmin()`); its only access-control primitive is the narrow **delete password** gating project deletion — do not conflate the two when reskinning admin gates.
- `defaultAutoSave={false}` for this app specifically (see route wiring) is an intentional product decision to avoid a known stale-overwrite bug — preserve this default even if V2's default (`true`) is kept elsewhere.
- The financial model (`renderFinModel`, ~970 lines) is the single largest, most formula-dense surface in the entire legacy suite; a reskin must not attempt to hand-copy every input from this document — instead treat `finCalc()`/`gf()`/`ufin()`/`ufinDm()` and the 6 numbered sections as the authoritative contract, and diff against the live file for exact field lists before rebuilding.
- Cross-app coupling is bidirectional and file-size-driven: V3 → V2 via `ga_rp_projects`, V3 → Cashflow via `pushV3CashflowHints()`, V3 → Due Diligence AI proxy. Any reskin touching V3's data shapes must re-verify all three downstream consumers.
