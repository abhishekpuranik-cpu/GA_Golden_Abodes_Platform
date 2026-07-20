# Functional Inventory — Sales Analytics Dashboard (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `sales_dashboard`
**Vault tile:** "Sales Analytics" — *"Funnel, sources and Rate per Sq. Ft. by project."* (icon 📈, glyph `SL`, group `sales`, `desk: true` default desk module, status `LIVE`, `external: true`)
**Vault path:** `/legacy/ga_sales_dashboard.html` (opens externally/new tab, not React-routed)
**Source of truth:** `GA_Golden_Abodes_Platform/client/public/legacy/ga_sales_dashboard.html` (markup/CSS/tabs) + `ga_sales_dashboard_runtime.js` (data/logic, 89KB — not line-inventoried here; treat as behavioral contract to preserve, see §5)
**Vault wiring:** `VaultHome.jsx` — `SALES_URL_LS_KEY='ga_sales_url'`; default URL `/legacy/ga_sales_dashboard.html`, admin override button **"Sales dashboard"** (sets custom URL); `salesHref` gets `?v=` cache-bust param (shares `cashflowVersion`)
**Doc title:** "Golden Abodes · Sales Command Centre"

---

## 1. Top bar

| Control | Label / options | Behaviour |
|---|---|---|
| Brand | `Golden Abodes · Sales Command Centre` + `#asOfLabel` (default "As of —") | static/data-driven |
| `#layerSel` | **View layer**: `Board` / `Operations` / `Sales` | title "View layer" (filters KPI depth, per runtime) |
| `#periodSel` | **FY 2025–26 YTD** / **Q4 FY 2025–26** / **Q3 FY 2025–26** / **Q2 FY 2025–26** | `onchange="updatePeriod(this.value)"` |
| Button | **Refresh** | `refreshDash(this)` |
| Button | **Import Excel** | opens hidden `#fileXlsx` (`.xlsx,.xls`) |
| Button | **Import JSON** | opens hidden `#fileJson` (`.json`) |
| Button | **Export JSON** | `#btnExportJson` |
| Button | **Export CSV** | `exportCSV()` |
| Button | **Reset** | `#btnReset` |
| Status line | `#dataStatus` (default "Data loaded") | data toolbar |

## 2. Tabs (`switchTab(id, el)`)

| Tab id | Nav label |
|---|---|
| `executive` | Business |
| `operations` | Operational |
| `salesteam` | Sales |
| `insights` | Insight |
| `calendar` | Activity Calendar |

Default active: `executive` ("Business").

### 2a. Business (`#executive`)
- Section title `#execTitle`: "Business Performance · FY 2025–26 YTD"
- `#execKpis` — KPI card grid (5-col), `#execBadges` — badge row (populated by runtime)
- **Revenue vs Target** chart (`#revenueChart`)
- **Project Revenue Mix** donut (`#projectDonut`) + `#donutLegend`
- **Project Progress** (`#execProjectProg`) + mini stats: **Booked / Target Units** (`#execUnitsSummaryVal`), **Demand (FY)** (`#execDemandCr`), **Pending Collections** (`#execPendingCr`)
- **Collections & CSAT**: collections chart (`#collectionsChart`), CSAT gauge (`#csatGauge`) + mini stats: **CSAT / NPS** (`#csatScore`), **Collection Efficiency** (`#execColEff`), **Source** (`#dataSourceTag`, default "Model")

### 2b. Operational (`#operations`)
- Section title `#opsTitle`: "Operational Health · FY 2025–26 YTD"
- `#opsKpis` KPI grid, `#opsBadges` badges
- **Funnel** (`#funnelMount`) — funnel-row bars with conversion % annotation
- **Source Mix** donut (`#sourceChart`) + `#sourceLegend`
- **Lead Trend** chart (`#leadTrendChart`)
- **Channel Performance**: `#channelChart`, `#roiChart`
- **CPL** (`#cplMount`) + mini stats: **Marketing Spend** (`#mktgSpend`), **Blended CPL** (`#blendedCpl`), **SLA Overall** (`#slaOverall`)
- **SLA** (`#slaMount`)

### 2c. Sales (`#salesteam`)
- Section title: "Sales Team Productivity · FY 2025–26 YTD"
- `#salesKpis` KPI grid, `#salesBadges` badges
- **Leaderboard** table (`#lbBody`) — columns: `#`, Rep, Project, Leads, Closures, Value (₹L), Conv%, Status
- **Leads vs Closures** scatter chart (`#scatterChart`)
- **Activity Mix**: `#activityChart`, **Call trend**: `#callTrendChart`
- **Monthly Tracker** (`#monthlyTracker`)
- **Pipeline Tracker** (`#pipelineTracker`)

### 2d. Insight (`#insights`)
- Heading "Insights & Actions"; `#insightsBody` — insight cards (severity classes `sev-high`/`sev-med`), each with owner tag, title, recommended action text

### 2e. Activity Calendar (`#calendar`)
- Heading "Sales activity calendar"; copy: *"Site visits, follow-ups, collection due dates, and campaign windows from imported CRM workbooks."*
- `#sales-cal-root` — mounts shared `ga_activity_calendar_core.js`/`.css` component

## 3. Displayed status/severity vocab
- Deviation pills: `dev-ok` / `dev-warn` / `dev-bad`
- Badges: `badge-green` / `badge-amber` / `badge-blue`
- Progress % coloring: `prog-pct.up` (green) / `.neutral` (amber) / `.down` (red)
- Insight severity: `sev-high` (red border) / `sev-med` (amber border)

## 4. Secondary surfaces / side effects
- `VaultAskAi`-equivalent inline mount: `GAVaultAskAI.mount({appId:'sales_dashboard', appLabel:'Sales Dashboard', title:'Ask Sales', ...})` — context builder reads `window.GA_SALES_STATE`/`SALES_STATE`/`salesState`/`DASH` globals (totals + up to 30 "hot" items from `inventory`/`units`/`bookings`/`hot`/`atRisk` pools), falling back to scanning `localStorage` keys matching `/sales|crm|booking|inventory/i` or prefixed `ga_`. Suggested example prompts: *"What is inventory and booking risk?"*, *"Where are sales bottlenecks?"*, *"What should sales leadership do this week?"*
- Dependent scripts: Chart.js 4.4.3 (CDN), SheetJS xlsx 0.20.1 (CDN), `/legacy/ga_activity_calendar_core.js`/`.css`, `ga_sales_dashboard_runtime.js`, `/legacy/ga_vault_ask_ai.js`
- Import/export: Excel import (`.xlsx/.xls`), JSON import/export, CSV export — exact transformation logic lives in `ga_sales_dashboard_runtime.js` (not reproduced here; must be preserved byte-for-byte in Phase 2, only the chrome/markup is Phase-0-inventoried)

## 5. Parity notes
- All chart/KPI/table mount points are empty `<div>`/`<canvas>` containers populated entirely by `ga_sales_dashboard_runtime.js` at runtime — the HTML/CSS above is the full static contract; runtime.js owns data shape, computed KPIs, and interactivity and must be treated as a black-box dependency during reskin (do not rewrite without separately auditing that file).
- Global state exposed for Ask AI (`GA_SALES_STATE` etc.) is an implicit cross-file contract — preserve variable name(s) if reskinning the runtime.
