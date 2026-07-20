# Functional Inventory — Marketing & Sales Control Tower / KPI Dashboard (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `marketing_kpi`
**Vault path:** `/legacy/GA_MarketingSales_KPI_Dashboard.html`
**Doc title:** "Marketing & Sales · Control Tower"; sidebar brand: "Sales Control Tower"
**Source of truth:** `GA_Golden_Abodes_Platform/client/public/legacy/GA_MarketingSales_KPI_Dashboard.html` (single self-contained file — markup + inline JS, no separate runtime file)
**Vault wiring:** `VaultHome.jsx` — `KPI_URL_LS_KEY='ga_marketing_kpi_url'`; default `/legacy/GA_MarketingSales_KPI_Dashboard.html`; admin override control; `kpiHref` versioned with shared `?v=` param
**Storage:** `localStorage['ga_mkt_kpi_state_v1']`; optional Mongo sync via `GET/PUT /api/apps/marketing_kpi/state` when `localStorage['ga_mongo_state_enable']==='1'` (auto-enabled after authenticated session detected via `/api/auth/session`)

---

## 1. Shell

### Sidebar nav (`.nav-btn[data-page]`)
| `data-page` | Label | Page title shown |
|---|---|---|
| `exec` (default active) | Executive Overview | Executive Overview |
| `funnel` | Funnel & Leakage | Funnel & Leakage |
| `source` | Source / Campaign | Source / Campaign |
| `owner` | Owner / Team | Owner / Team |
| `ops` | Operations | Operations |
| `calendar` | Activity Calendar | Activity Calendar |
| `intel` | Lead Intelligence | Lead Intelligence |

### Topbar
- `#page-title` (dynamic, matches active nav label)
- Button **Upload Excel** (primary) → hidden `#file-xlsx` input (`.xlsx,.xls`)
- Button **Load Demo** → seeds 10 fixed demo leads (`DEMO_JSON`) + 22 generated synthetic rows
- Button **Clear data** (ghost) → clears `state.leads` and intel search

### Global filters bar (`#global-filters`, applies to all pages)
| Filter | Options |
|---|---|
| Project | dynamic from data |
| Source | dynamic from data |
| Owner | dynamic from data |
| Journey stage | dynamic from data |
| Age bucket | `0–2 days` / `3–5 days` / `6–10 days` / `10+ days` |

Clicking a funnel segment (Funnel page) also sets an implicit `funnelStageFilter` synced into the Journey stage dropdown.

---

## 2. Executive Overview (`#page-exec`)

- KPI strip: **Total leads**, **Lead→Contact %**, **Contact→Visit %**, **Visit→Neg %**, **Neg→Booking %**, **With next action %**, **Stale (7d+) %**
- **Action board** cards: `No next action`, `High-intent, no follow-up`, `Site visit booked (not completed)`, `Negotiation, no next step`, `Stale (>10d activity)`
- **Executive narrative** card — auto-generated sentence: *"Pipeline snapshot: **{n}** leads under current filters. Priority is clearing next actions on negotiation-stage opportunities and reducing stale touchpoints. Source mix should be reviewed on the Source page; owner load on the Team page."*
- **Activity breakdown — Channel Partner (Broker)** card: if broker-tagged leads exist, action-board cards (`CP leads (in filter)`, `Share of leads`, `With site visit`, `Progressed (past new)`, `At negotiation`, `Booking / won`, `With next action`, `Stale (7d+)`, `Distinct partners (Sub_Source)`) + hint: *"Tagged when **Source Name** or **Sub_Source** matches broker / channel partner (same rules as the Command Centre Excel template). Use **Sub_Source** for the partner firm name."*; else hint: *"No broker-tagged leads in the current filter. Set **Lead_Source** to `Channel_Partner` (or tag **Sub_Source** with the partner name) in your Excel export."*
- **Ageing distribution** bar chart (age buckets)
- **Top 10 priority leads** table: Priority, Name, Stage, Source, Sub_Source, Owner, Issue summary

## 3. Funnel & Leakage (`#page-funnel`)

- **Customer journey funnel** chart (Plotly funnel, stages = `JOURNEY`: `New Lead` → `Site Visit Booked` → `Site Visit Completed` → `Revisit Booked` → `Revisit Completed` → `Negotiation` → `Booking / Won`); hint: *"Snapshot counts by current stage. Tooltip shows median and oldest lead age (days since creation)."*; clicking a segment toggles stage filter
- **Intermediate statuses** — chip list (`Lost`, `Follow-up / no response`, `Reschedule`, `Open`, or `—`)
- **Stage leakage (sequential view)** table: From, To, At "to" stage, Conv. index, Likely blocker (`Strong drop — check SLA & follow-up` if conversion <30%, else `Monitor progression`)
- **Stage ageing** bar chart (avg age per stage)
- **Leads** list (filtered by clicked funnel segment) — Name, Stage, Age, Owner (capped at 40 rows)

## 4. Source / Campaign (`#page-source`)

- **Source volume** bar chart
- **Progressed %** / **Visit %** bar charts (side by side)
- **Source quality matrix** table: Source, Leads, Progressed %, Visit %, Booking %, Problem %

## 5. Owner / Team (`#page-owner`)

- **Lead load by owner** / **Action coverage %** bar charts
- **Owner leaderboard** table: Owner, Leads, Next action %, Progressed %, Problem %, Avg age, Stale

## 6. Operations (`#page-ops`)

- KPI strip: **Total leads**, **CP lead share %**, **CP → visit %**, **CP → booking %**, **Distinct partners**, **Avg age CP (d)**, **Avg age non-CP (d)**
- **Operations — backlog & risk** action-board: `No next action (excl. won)`, `Stale touch (7d+)`, `CP stale (7d+)`, `CP with no next step`
- **Throughput** table: Leads with visit recorded, In negotiation, Booked / won, CP leads with visit
- **Channel partner (Sub_Source)** table: Partner, Leads, Visits %, Won (or hint *"No CP-tagged leads."*)

## 7. Activity Calendar (`#page-calendar`)

- Mounted via shared `GAActivityCalendar` component (`mkt-cal-root`)
- Title **"Lead follow-ups & visits"**, subtitle **"Marketing KPI · filtered leads"**, accent `#db2777`
- Legend: **Next call** (blue), **Tentative visit** (green)
- Events derived from each lead's `nextCall` / `tentativeVisit` dates; title `{name} · follow-up call` / `{name} · site visit`; overdue/today status coloring
- Click event → `alert(ev.title)` (simple browser alert, not a modal)

## 8. Lead Intelligence (`#page-intel`)

- Search input `#intel-q` — placeholder *"Name, phone, source, Sub_Source, comment, owner…"* (debounced 280ms, filters by name/phone/comments/owner/source/subSource substring)
- **Lead explorer** table: Pri, Name, Stage, Source, Sub_Source, Owner, Age, Issues (capped 200 rows, sorted by priority desc)
- **Comment intelligence** tabs: **Demand signals**, **Friction signals**, **Action signals** — each shows a rule-derived theme table (Theme, Leads count) + narrative: *"Focus sales playbooks on the highest-count themes; align site visits for demand signals and remove friction on price or family decision where counts are rising."*

---

## 9. Data model & derived fields (parity-critical)

### Excel column → internal field aliases (`mapRow`)
`Created At/Created/Lead date`→`createdAt`; `Updated At/Updated`→`updatedAt`; `Status`; `First Name`→`firstName`; `Phone`; `Email`; `Source Name/Source`→`sourceName`; `Sub Source/Sub_Source/Sub-Source`→`subSource`; `Reference Projects Name/Project`→`projectName`; `Employees/Owner`→`owner`; `Lead Comments/Comments`→`comments`; `Next Call Date`→`nextCall`; `Visit Count`→`visitCount`; `Configuration Name`→`configName`; `Presale Stage`→`presaleStage`; `Campaign Ad Name`→`campaign`; `Lead Stage`→`leadStage`; `Tentative Visit Date`→`tentativeVisit`

### Journey classification (`classifyJourney`) — regex-matched over status+leadStage+presaleStage
Priority order: `booking|won|closed|token`→Booking/Won(`won`) → `negotiat`→Negotiation(`neg`) → revisit completed(`rvc`) → revisit booked(`rvb`) → site visit completed(`svc`) → site visit booked(`svb`) → `lost|dead`→New Lead + intermediate `Lost` → `follow|no response|no answer`→New Lead + intermediate `Follow-up / no response` → `reschedule`→New Lead + intermediate `Reschedule` → `open|new lead`→New Lead + intermediate `Open` → default New Lead.

### Broker/Channel-Partner detection (`isBrokerSource`)
Normalized (lowercase, alnum-only) source/sub-source matches: contains `channelpartner`; equals `cp`; contains `cplead`; starts with `cp_`; contains `broker`; contains `chpartner`; contains `partner` AND (`channel` or `sales`).

### Age buckets (`ageBucket`, days since `createdAt`)
`0-2` ≤2d · `3-5` ≤5d · `6-10` ≤10d · `10+` else.

### Problem flags (`problemFlags`) — any of
No next action (no `nextCall`/`tentativeVisit`) · Low engagement signal (comments <4 chars) · No presale classification · Visit mismatch (visitCount=0 but journey mentions visit) · Missing configuration · Missing email · Intent without follow-up (comments mention negotiate/price/visit but no next call).

### Priority score (`priorityScore`, 0–100, base 50)
+40 won · +28 negotiation · +18 site/revisit completed · +10 site/revisit booked · +12 has next call/visit · +8 comments >20 chars · +6 has presale stage · −15 no next action · −5 no email; clamped 0–100.

### Comment intelligence rule tags (`textIntel`)
`demand` (regex: bhk/visit/interested/positive/budget/configuration/sq ft) · `friction` (price/expensive/family/decision/not reachable/busy/compare/competitor) · `action` (callback/revisit/negotiat/tomorrow/evening/monday/friday).

---

## 10. Secondary surfaces / side effects

- `VaultAskAi`-equivalent inline mount: `GAVaultAskAI.mount({appId:'marketing_kpi', appLabel:'Marketing KPIs', title:'Ask Marketing KPIs', ...})` — reads `window.GA_MKT_KPI_STATE.leads` (fallback to `localStorage['ga_mkt_kpi_state_v1']`); aggregates `byStatus`/`byOwner`/`bySource` counts + up to 25 "hot" leads matching `/new|follow|callback|warm|booked/i`. Example prompts: *"Which KPIs are off track?"*, *"Predict channel underperformance."*, *"Prescribe marketing focus for this week."*
- Dependent scripts: Plotly 2.27.0 (CDN), SheetJS xlsx 0.20.1 (CDN), `/legacy/ga_activity_calendar_core.js`/`.css`, `/legacy/ga_vault_ask_ai.js`
- Boot sequence (`bootState`): checks `/api/auth/session`; if authenticated, force-enables Mongo state sync flag, then tries `pullMongoState()` → falls back to `localStorage` → falls back to `loadDemo()`
- Persistence: every `refreshAll()` call writes to `localStorage` and schedules a debounced (800ms) `PUT /api/apps/marketing_kpi/state` when Mongo sync is enabled, with optimistic-concurrency `expectedVersion`
- Excel import via SheetJS (`XLSX.read` → `sheet_to_json` with `header:1`) — first sheet only, header row + data rows re-run through `mapRow`/`buildLead`

## 11. Parity notes
- This dashboard is a **single fully self-contained HTML file** (all logic inline) — unlike Sales Dashboard/Cashflow, there is no separate runtime.js to treat as a black box; the entire behavior above is authoritative and small enough to reskin directly.
- Broker/CP classification rules are explicitly called out as matching "the Command Centre Excel template" — any reskin must keep this rule set identical or it will silently reclassify partner leads.
