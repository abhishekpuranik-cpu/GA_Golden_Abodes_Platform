# Functional Inventory — Cashflow V1 (Phase 0)

**Source of truth:** live vault HTML  
`GA_Golden_Abodes_Platform/client/public/legacy/GA_Cashflow_V1.html`  
(`CF_VERSION = 72`; document `<title>` still says “GA Cashflow Tracker V2”)

**React port (exists, not inventory primary):**  
`GA_Cashflow_V1_React/` — npm package `ga-cashflow-v1-react` (Vite/React 19). Vault ships the HTML path below; React is a separate port with `dev:vault` / `build:vault` (`base /v1/`).

---

## 1. Route / entry

| Item | Value |
|------|--------|
| Vault URL | `/legacy/GA_Cashflow_V1.html` |
| Vault app id | `v1_cashflow` (`MONGO_APP_ID`) |
| Vault wiring | `VaultHome.jsx`: `v1_cashflow` → `cashflowHref` (default `/legacy/GA_Cashflow_V1.html`, optional `ga_v1_cashflow_url` override + `?v=` version param) |
| Branding in chrome | Logo text: **GA Cashflow** |
| Dependent scripts | CDN: pptxgenjs, SheetJS xlsx; local: `ga_accounting_categories_parser.js`, `ga_accounting_categories.js`, `/legacy/ga_activity_calendar_core.js`, `/legacy/ga_vault_ask_ai.js` (+ CSS `ga_activity_calendar_core.css`) |

### Top-level pages (`showTab` / `#page-*`)

| Tab id | Nav label | Password gate |
|--------|-----------|---------------|
| `cashflow` | Cashflow | Yes (finance unlock) |
| `pl` | P&L | Yes |
| `activities` | Activity Calendar | Yes |
| `sales` | Planning → Sales & collections | No (public planning) |
| `capital` | Planning → Capital structure | No |
| `expenses` | Planning → Expense schedules | No |
| `debt` | Planning → Debt service | Yes |
| `ga` | Planning → GA consolidated rollup | Yes |

**Finance unlock:** tabs that are *not* `sales` / `capital` / `expenses` require session password (`sessionStorage` `ga_cf_finance_tabs_ok`). Prompt: *“Enter password to open Monthly Cashflow, P&L, Debt Service, and GA Rollup.”* Password = remove-project admin password (default `ga@admin`, overridable via `ga_cf_remove_project_password`).

**Default visible page on load:** `#page-sales` is not `hidden` in markup; finance-gated tabs fall back to `sales` if unlock fails.

---

## 2. Global chrome (all tabs)

### 2.1 Top bar — project filters & project ops

| Control | Exact label / placeholder | Behaviour |
|---------|---------------------------|-----------|
| `#proj-select` | Project dropdown (options built dynamically; empty: “No projects”) | `selectProj` — can select `__ga__` / `__rollup__` / `__root__\|…` specials |
| `#proj-root-select` | Multi-select; option **All Projects** | Project group filter |
| `#phase-select` | Multi-select; **All phases** | Phase filter |
| Button | **All phases** | `setPhaseAll()` |
| `#building-select` | Multi-select; **All buildings** | Building filter |
| Button | **All buildings** | `setBuildingAll()` |
| Button | **↻ Sync V3** | `syncFromV3()` — merges V3 project list from `ga_rp_projects` / Mongo V3 |
| Button | **+ Manual** | Add project modal |
| Button | **⚙ Hierarchy** | Project hierarchy mapping modal |
| Button | **− Remove project** | Password + remove from workbook (and Mongo if enabled) |
| Button | **↺ Restore deleted** | Restore last deleted project from snapshot key |

### 2.2 Sync bar

| Group | Controls (exact labels) |
|-------|-------------------------|
| Status | `#sync-msg` (e.g. Loading…); `#today-date`; `#mongo-cf-status`; `#coding-master-status` |
| **Tally feed** | **Live sync**, **Import XML/CSV** |
| **Server** | **Save**, **Load**, **↺ Snapshot**, **Setup** |
| **Coding** | Badge **SoT**; **Upload XLSX**, **Reset** |

### 2.3 Hidden file inputs (imports)

| `#id` | Accept | Handler |
|-------|--------|---------|
| `tally-file-input` | `.csv,.tsv,.txt,.xml,.xlsx,.xls` (multiple) | `importTallyFile` |
| `cap-template-input` | `.xlsx,.xls` | `importCapitalTemplate` |
| `cf-import-input` | `.json` | (present; JSON import wiring) |
| `sales-milestones-input` | `.xlsx,.xls,.xlsm` | `importMilestoneTemplate` |
| `expense-schedule-input` | `.xlsx,.xls` | `importExpenseSchedule` |
| `sales-inventory-input` | `.xlsx,.xls,.xlsm` | `importInventoryTemplate` |
| `unsold-inventory-input` | `.xlsx,.xls,.xlsm` | `importUnsoldInventoryTemplate` |
| `crm-postsales-input` | `.xlsx,.xls,.xlsm` | `importCRMPostSalesWorkbook` |
| `coding-master-input` | `.xlsx,.xls,.xlsm` | `importCodingMasterWorkbook` |

### 2.4 Ask AI (footer mount)

`GAVaultAskAI.mount({ appId:'v1_cashflow', appLabel:'Cashflow V1', title:'Ask Cashflow', … })` — builds context from projects, sold/unsold units, payment-risk counts, actuals.

---

## 3. Status / category vocabularies (code constants)

### 3.1 Legacy cashflow categories (`INFLOW_CATS` / `OUTFLOW_CATS`)

**Inflows:** Sales Revenue · Equity Infusion · Investor Funding · Unsecured Loan · Customer Collections · Customer UL · Other Income · Other Inflow (synonym → Other Income)

**Outflows:** Land · NOC · Consultant · Regulatory & Consulting · Construction · Marketing · GA DM Fee · Contingency · Interest Paid · Principal Repaid

Display columns may be replaced by GA Accounting Categories V3 L1 labels when `GA_ACCT_SCHEMA === 'v3'`.

### 3.2 Project status (manual add + GA cards)

`Active` · `Planned` · `Pipeline` · (`Completed` used in GA card colour map)

### 3.3 Sold-unit payment health (`UNIT_PAYMENT_STATUS_OPTS`)

| Value | Label |
|-------|-------|
| `ok` | OK |
| `at_risk` | At risk |
| `delayed` | Delayed |
| `payment_denied` | Payment denied |
| `agreement_pending` | Agreement pending |

### 3.4 Funding / loan

- **Funding source:** `self` → “Self contribution”; `loan` → “Loan”
- **Loan sanctioned:** `yes` / `no` (UI: Yes / No)
- **Pay type:** `const` → “Construction-linked (milestone)”; `install` → “Custom Installments”

### 3.5 Unit type (Add Sold Unit modal)

Office · Residential · Showroom · Restaurant · Other

### 3.6 Activity calendar event status

`overdue` · `today` · (else undefined) — from `GAActivityCalendar` vs milestone target YMD

### 3.7 Debt schedule party kinds (display tags)

Investor · Unsecured · Debt tranche

### 3.8 Tally pull modes

`payment_receipt` → “Payment + Receipt only (recommended)”  
`single` → “Single report ID (still filtered to Payment/Receipt on import)”

### 3.9 Expense / payable side labels (Vendor GST / bills)

Payable · Paid (and bill tables: Taxable, GST, Balance, etc.)

### 3.10 Sales grid “As of today” buckets

Due · Received · Pending (and row labels Received / Pending in month columns)

---

## 4. Tab: Cashflow (`cashflow`)

### 4.1 Subviews (`_cfSubview`)

| Subview | Button labels |
|---------|---------------|
| `monthly` | **Monthly grid** / **← Monthly cashflow** |
| `forecast` | **Forecast · L1 × Milestone** / **Open Forecast · L1 × Milestone** |
| `payables` | **Payables & timing** (single-project only; hidden in multi-project rollup) |

### 4.2 Monthly grid — controls

- **+ Add Transaction**
- **⬆ Import Tally (CSV or XML)**
- **⚡ Tally live**
- **⬇ Export TSV**
- **📊 Investor PPT**
- **Remove project**
- TIME: **Monthly** | **Quarterly**
- Checkbox: **Show prior calendar years**
- Forecast Controls (future months): **Expand** / **Collapse**, **Reset**
  - Sliders: Sales pace (incl. unsold); Collection efficiency (future); Other inflow factor; Construction + consultant cost; Marketing factor; GA DM Fee factor (future)
  - **Monthly risk buffer (₹)**
- KPI strip: Total Inflows · Total Outflows · Net Cashflow · Closing Balance · Peak Funding Need · Project Months
- Table groups (collapsible headers): **INFLOWS** · **OUTFLOWS** · **SUMMARY** · **DEBT METRICS**
  - Summary cols: Net CF · Closing Cash
  - Debt cols: CADS · Debt Svc · DSCR · Closing Debt · Drawdown
- Actuals ledger (below grid): **Tally raw XML**, **Tally parsed TSV**, **+ Add**; per-row delete **×**
- Empty state: **↺ Sync from V3**, **+ Add Manually**

Rollup title when multiple projects visible: **Monthly Cashflow — Rollup (N selected projects)**.

### 4.3 Forecast · L1 × Milestone

- Project picker when rollup filters active (`cf-forecast-pick-proj`)
- Simple stage forecast: **From this month** / **All stages**; **Prediction (from this month)** / **All months**
- Stage rows toggle (`cf-stage-toggle`) for L1 outflow expand
- **Show advanced** / **Hide advanced** — sensitivity sliders + full L1 × stage matrix

### 4.4 Payables & timing

- Badge: **Timing view**
- KPIs: Lines · Net cash (signed) · Absolute movement
- Sections: **By category**, **Detail ledger** (Date · Party · Category · L3 · Amount)
- Scope note: Common · Payables (W) and Retention (R3) from V3 coding

---

## 5. Tab: P&L (`pl`)

- Title: **Profit & Loss — {project}**
- Badge when V3: **V3 master**
- PERIOD: **This month** · **FY YTD** · **Full FY** (Indian FY Apr–Mar)
- KPIs: Revenue (inflows) · Expenses (outflows) · Net (actuals) · Unmapped abs. (if any)
- Sections: **Building scope**, **Common scope** (PL L1 rows from master)
- Note: cash-only / journals without cash impact excluded from P&L

---

## 6. Tab: Activity Calendar (`activities`)

- Intro copy: construction milestone target dates for selected project(s)
- Mounts `GAActivityCalendar` with title **Construction milestones**, subtitle **Cashflow V1 · plan dates**
- Legend: **Milestone target**
- Click event → `alert` with milestone title

---

## 7. Planning → Sales & collections (`sales`)

### 7.1 Outer subtabs

| Panel | Button |
|-------|--------|
| `inventory` | **Sales & Inventory** |
| `postsales` | **Post-sales dashboard** |

### 7.2 Sales & Inventory

**Construction milestone dates**

- Columns: Milestones · % Due at Milestone · Cum. Due % · Cum. Pending % · Milestone Target Date · Milestone Achieved Date
- **Milestone template** · **Upload milestones**
- Roadmap SVG (`htmlPostSalesRoadmap`)

**Sold Units KPIs**

- Units Sold · Total Sale Value · Collected to Date · Balance Receivable · Collective Pending as of Today · Agreement pending · Payment with issue

**Sold Units grid toolbar**

- Columns: **Months** · **Quarters**
- **Expand all Q** · **Collapse all Q**
- **⬇ Sold Units Excel** · **⬇ Template** · **⬆ Upload** · **CRM Post-Sales** · **+ Add Unit**
- Checkbox: **Prior years**
- Search: placeholder **Search unit / client**

**Fixed grid headers (`SALES_GRID_FIXED_HDRS`)**

Unit · Type · Sale Value · Booking · Collected · Bal · Loan Amount · OC · Final loan · Payment status · Exp. agr. · As of today  
(+ optional **CRM line** for installment units)

Per unit tools: **Comments (n)** · **CLP (n)** · **Delete**  
Inline: payment status select, expected agreement date, funding source, loan amount, sanctioned Yes/No, OC received, OC pending (manual/Auto), bank loan notes.

Month columns show Due / Received / Pending style rows.

**Unsold Inventory — Revenue Projection**

- **⬇ Unsold template** · **⬆ Upload unsold** · **+ Add unsold unit**
- Sales pace plan: View **By sq.ft** / **By units**; Input **per month** / **per quarter**; **Target**; **Set as baseline**
- KPIs: Unsold lines · Total planned unsold value · Planned unsold revenue (next 12 mo.) · vs baseline (when set)
- Table cols: Unit Number · Unit Type · Saleable Area · Planned Rate / Sq.Ft. · Planned Sale Value · Proj. sale · Project CLP · Actions

### 7.3 Post-sales dashboard (inner subtabs)

| Panel | Button |
|-------|--------|
| `overview` | **Command center** |
| `monthly` | **Monthly performance** |

**Command center KPIs (examples from code):** Sold demand (till date) · Realized · Expected · Next 12M sold / unsold / total projected · funding mix (loan/self, sanctioned counts) · delay scenario schedules · etc.

**Monthly performance** table concepts: Sold demand · Realized · Mo gap · Sold proj. · Unsold @ bkgs · Unsold CLP · Total proj. · New bkgs · Cum. bkgs · Unsold inv. · Inv. units · Exp. bkgs — with efficiency mini-bars.

Supports multi-project rollup variants when multiple projects are filtered in.

---

## 8. Planning → Capital structure (`capital`)

- Title: **Capital Structure — {project}**
- Optional **Investor Payables Snapshot (from Capital)** KPIs: Principal due · Interest due · Total payable
- **⚡ Tally live sync** · **⬇ Download Template** · **⬆ Upload Template**

### Sections

| # | Title | Add button |
|---|-------|------------|
| ① | Equity Infusion | **+ Add Equity Partner** |
| ② | Investor Funding (External) | **+ Add Investor** |
| ③ | Unsecured Loans | **+ Add Unsecured Loan** |
| ④ | Customer UL / Advance | **+ Add Customer UL** |
| ⑤ | Other Inflows | **+ Add Other Inflow** |

Fields: Name/Party, Amount (₹), Draw date / Date, Rate %, Term (yrs), Notes (other), row delete **×**.

---

## 9. Planning → Expense schedules (`expenses`)

### Toolbar

**⬆ Import feed** · **⬇ Schedule template** · **⬆ Upload schedule**

### Subtabs

| Panel | Button |
|-------|--------|
| `dashboard` | **Dashboard** |
| `insights` | **Insights** |
| `narration` | **Narration** |
| `gst-vendor` | **Vendor GST** |
| `schedule` | **Schedules** |

### 9.1 Dashboard

- Filters: From month · To month · Cashflow category · **Apply** · **Reset**
- Metrics dashboard (planned vs actual burn, runway, etc. via `htmlExpenseMetricsDashboard`)
- **Category mix** · **Top cost centres**
- **GA chart — L1 → L2 → L3 → voucher** with **Expand all** / **Collapse all**
- Payable/paid section from last Tally XML; inflows section

### 9.2 Insights

- Business KPI charts from actuals
- Filters: From/To month · Cashflow cat · Cost centre (contains) · GA L1 (contains) · **Apply** / **Reset**
- **Expense burn trend (monthly outflow, filtered)**
- **Cashflow category mix (filtered outflows — chart)**

### 9.3 Narration

- Smart search: placeholder **Ask: FY, year, or capital…**
- Insight search: **Search text…**
- Checkbox: **Cashflow only (hide autosweeps in table)**

### 9.4 Vendor GST

- Search: **Search vendor...**
- KPIs: Taxable base · GST amount · Total bill (GST view) · Payable · Paid · Open balance
- Vendor drill: **← All vendors** · payable vs paid by bill
- Excel: **Bills (₹)** · **Bills (lac)** · **Vendor summary** · **By month** · **All reports**
- Individual bills table (amounts in lac)
- **Ledger lines — search by GA L1 / L2 / L3**

### 9.5 Schedules

| # | Section title | Schedule key |
|---|---------------|--------------|
| ① | Land & Acquisition (incl. Partner Buyout) | `landSchedule` |
| ② | NOC & Statutory Approvals | `nocSchedule` |
| ③ | Consultants (Architect, RCC, MEP, Legal…) | `consultantSchedule` |
| — | Regulatory & Consulting (GA L1) | `regulatoryConsultingSchedule` |
| ④ | Construction Cost Schedule | `constructionSchedule` (**+ Add Period**) |
| ⑤ | Marketing Spend Schedule | `marketingSchedule` (**+ Add Period**) |
| ⑥ | GA DM Fee — Monthly Fixed Cost | `gaMonthly`, `gaGAAnnual`, `gaMktgAnnual` |
| ⑦ | Contingency | `contingencyPct` (% of Construction) |

Row adds: **+ Add Entry** / **+ Add Period**; fields Date, Plan date, Month #, Amount, Description, Cost Centre.

---

## 10. Planning → Debt service (`debt`)

- Title: **Debt Service — {project}**
- Per-tranche card: Tranche ID · Lender Name · Sanctioned Amount · Annual Interest Rate % · Draw Date · **Remove**
- Principal Repayment Schedule: Due date · Month # · Amount · **+ Add Repayment**
- **Investor / Lender Payment Schedule (Single Source)**
  - Filter: **All lenders / investors** (+ per-party options)
  - Columns: Month · Party · Type · Rate % · Interest Due · Mark Int Paid · Principal Due · Mark Prin Paid · Paid Total · Outstanding
- **+ Add Debt Tranche**

Cashflow Interest Paid / Principal Repaid post only for rows marked paid.

---

## 11. Planning → GA consolidated rollup (`ga`)

- Title: **GA Consolidated Cashflow — All Projects**
- TIME: **Monthly** · **Quarterly** · **Show prior calendar years**
- KPIs: Portfolio GDV · Total Inflows · Total Outflows · Net Cashflow · GA DM Fee (Portfolio, mo.)
- **Hierarchy rollup (Buildings + Common Amenities → Phase → Project)** — click building → `goto-proj`
- Per-project cards (GDV, GA DM, In/Out/Closing) — click opens project
- Consolidated monthly/quarterly table (same inflow/outflow collapse pattern as Cashflow)
- **⬇ Export TSV** (`export-ga-tsv`)

---

## 12. Secondary surfaces (modals)

| Modal | Title / purpose | Primary actions |
|-------|-----------------|-----------------|
| Tally live | **Tally Prime — live sync (local)** | Bridge URL, Pull mode, dates, cost-centre filter, Auto-allocate, Send company name, Replace, **Test bridge**, **Pull Payment + Receipt (full history)**, **Close**, download raw XML / parsed TSV |
| Add Transaction | **Add Transaction** | Date, Party, Category, Amount, Cost Centre, Notes · **Save** / **Cancel** |
| Add Sold Unit | **Add Sold Unit** | Unit No., Type, Sale Value, Booking Date, pay type radios, installment rows · **Save Unit** / **Cancel** · **+ Add Installment** |
| Add Project | **Add Project Manually** | Name, Project Group, Phase, Building, Status, GDV, GA DM Fee monthly, Duration, Start Date · **Add Project** / **Cancel** |
| Hierarchy | **Project Hierarchy Mapping** | Project Group / Phase / Building / Chart prefix / Common owner radio · **Save hierarchy** / **Cancel** |
| Unit comments | Comments log | Append comment · close |
| Unit CLP | Unit CLP override dates | Save / Clear / Download template / Upload |
| Restore snapshot | Prompt-driven list of server snapshots | Pick line # → confirm → restore full workbook |
| Password prompts | Remove project; finance tab unlock | Admin password |

---

## 13. Side effects

### 13.1 Mongo / API (`v1_cashflow`)

| Endpoint pattern | Use |
|------------------|-----|
| `GET/PUT /api/apps/v1_cashflow/state` | Load / save workbook (`mongoStateApiUrl`) |
| `/api/apps/v1_cashflow/snapshots` (+ `/:id`) | List / fetch snapshots |
| `/api/apps/v1_cashflow/restore/:id` | Restore snapshot |
| `/api/apps/v1_cashflow/import` | Import helper URL |
| `/api/apps/v1_cashflow/restore-best-morning` | Morning auto-restore |
| `GET /api/apps/v3_org_planner/state` | Sync V3 project list (`MONGO_V3_APP_ID`) |
| `/api/postsales/demands/export` | Sync collections into sold units |

Enable flag: `localStorage.ga_mongo_state_enable === '1'`. Optional API base: `ga_mongo_api_base`.  
UI: **Setup**, **Save**, **Load**, **↺ Snapshot**; auto-save debounce; poll newer Mongo every 15s.

### 13.2 Local Tally bridge (not Mongo)

- Default bridge URL pattern: `http://127.0.0.1:34876`
- `GET …/health`, `POST …/tally/ping`, `POST …/tally/export`
- Session dumps: `window.__gaLastTallyExportRaw`, `__gaLastTallyParsedRows`
- Settings persisted in `localStorage` key **`ga_cf_tally_settings`**

### 13.3 localStorage / sessionStorage keys

| Key | Role |
|-----|------|
| `ga_cf_v1` | Full workbook snapshot (when Mongo not master) |
| `ga_mongo_state_enable` | Server sync on/off |
| `ga_mongo_api_base` | Optional API host |
| `ga_cf_tally_settings` | Tally bridge prefs |
| `ga_acct_master_override` | Uploaded coding master override |
| `ga_v1_building_prefix_map` | Building chart-prefix map |
| `ga_v1_project_group_filter` | Filter persistence |
| `ga_v1_proj_root_filter` | Project root filter |
| `ga_v1_phase_filter` | Phase filter |
| `ga_v1_building_filter` | Building filter |
| `ga_v1_show_prior_years` | Prior-years checkbox (`1`/`0`) |
| `ga_cf_remove_project_password` | Admin password override |
| `ga_cf_last_deleted_snapshot` | Last deleted project restore payload |
| `ga_rp_projects` | V3 project list mirror |
| `ga_v3_cf_sync` | V3→CF sync blob |
| `ga_v2_proj_costs` | V2 cost push into schedules / GA DM / marketing |
| `ga_cloud_url` | Google Apps Script cloud URL (`CF_CLOUD_CONF_KEY`) |
| `ga_user_name` | Actor name on comments / cloud saves |
| `ga_v1_cashflow_url` | Vault override (platform, not necessarily set by HTML) |
| `sessionStorage` `ga_cf_finance_tabs_ok` | Finance tabs unlocked for session |

### 13.4 Excel / TSV / PPT import–export

| Action | Format |
|--------|--------|
| Import Tally | XML / CSV / TSV / XLSX |
| Export cashflow | TSV |
| Export GA consolidated | TSV |
| Investor PPT | pptxgenjs presentation |
| Coding master | Upload XLSX (V3 SoT); Reset clears override |
| Capital / expense / milestone / inventory / unsold templates | XLSX download + upload |
| Sold Units Excel | Multi-sheet (Sold Units + monthly Due/Received/Pending) |
| CRM Post-Sales workbook | XLSX import |
| Vendor GST reports | XLSX (bills ₹/lac, vendor summary, by month, workbook-all) |
| Unit CLP template | Download / upload per unit |
| Tally session dumps | Raw XML + parsed TSV download |

### 13.5 Cross-app sync behaviours

- **Sync V3:** reads `ga_rp_projects` (local or Mongo V3 state), updates `PROJS`, may write Mongo `v1_cashflow`
- **V2 costs:** interval reads `ga_v2_proj_costs` into project cost / GA DM / marketing fields
- **Cloud (optional):** push/pull via Apps Script URL in `ga_cloud_url`
- **Tally coding authority:** voucher type Payment → cash out; Receipt → cash in; Cashflow owns category (`codingAuthority:'cashflow'`)

### 13.6 Persist triggers

`saveAll()` writes local snapshot and/or schedules Mongo PUT; many edits call `saveAll` + re-render. Tally merge can force immediate `mongoStatePutNow()`.

---

## 14. Per-project data model (high level)

From `emptyProjData` — fields the UI edits or engines consume:

- Timeline: `startDate`, `totalMonths`
- Capital: `investors`, `unsecuredLoans`, `customerUL`, `otherInflows`, `debtTranches`, `debtPaymentMarks`
- Schedules: `landSchedule`, `nocSchedule`, `consultantSchedule`, `regulatoryConsultingSchedule`, `constructionSchedule`, `marketingSchedule`, `gaMonthly`, `gaGAAnnual`, `gaMktgAnnual`, `contingencyPct`
- Sales: `units`, `unsoldUnits`, `unsoldPace`, `milestonesDates`, `milestonesAchievedDates`
- `actuals[]` (manual + `source:'tally'`), `overrides`, `forecast{…}`
- Tally per-project: date range, cost-centre filter, company name, `tallyCommonCostOwner`

---

## 15. React port note (non-primary)

Path: `C:\Users\HP\OneDrive\Projects\API\Cursor\GA_Cashflow_V1_React\`  
Package: `ga-cashflow-v1-react` v0.1.0 — Vite, React 19, recharts, xlsx, pptxgenjs.  
**Live App Vault entry remains the HTML file** at `/legacy/GA_Cashflow_V1.html` with id `v1_cashflow`. This inventory does not enumerate React screens.

---

*Generated from code inspection of `GA_Cashflow_V1.html` (CF_VERSION 72). Features not present in source were omitted.*
