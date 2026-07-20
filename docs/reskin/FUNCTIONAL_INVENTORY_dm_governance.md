# Functional Inventory — DM SPV Governance / Business Health (Board Room)

**Phase 0 · GA Platform reskin**  
**App ID:** `dm_spv_governance`  
**Vault entry:** `/app/dm-governance` (Vault title: **Business Health Command Center**)  
**Shell title / breadcrumb:** Business Health · `Vault / Business Health`  
**Auth:** `RequireAuth` with `APP_IDS.DM_SPV_GOVERNANCE`  
**API base:** `/api/dm-governance`  
**Primary sources:** `client/src/pages/dmGovernance/*`, `client/src/lib/dmGovernanceApi.js`, `client/src/lib/dmGovernanceTabs.js`, `server/routes/dmGovernance*.js`, `server/lib/dmGovernance/*`, `server/lib/businessHealth/*`

---

## 0. Shared shell & navigation

### Route / entry
- Layout route: `/app/dm-governance/*` → `DmGovernanceLayout.jsx`
- Component: `PlatformShell` + topbar + tab nav + `<Outlet />` + `VaultAskAi`

### Interactive controls (exact labels)
| Control | Label / text |
|---|---|
| H1 | `Business Health` |
| Subline | `Golden Abodes · {user.email}` |
| Vault link | `← Vault` |
| Nav tabs (DM_NAV) | `Business Health`, `Executive`, `SPV Master`, `Projects`, `Billing Workspace`, `Billing Models`, `Invoices`, `Approvals`, `Compliance`, `Annual Recon`, `Expenses`, `Risks`, `Scenarios`, `Alerts`, `Reports`, `Integrations` |
| Ask AI | `VaultAskAi` — `appLabel="Business Health"`, `exampleKey="dm_spv_governance"` |

### Tab → path map
| Nav label | Path | Tab id |
|---|---|---|
| Business Health | `/app/dm-governance` (end) | `dm_business_health` |
| Executive | `/app/dm-governance/executive` | `dm_executive` |
| SPV Master | `/app/dm-governance/spvs` | `dm_spvs` |
| Projects | `/app/dm-governance/projects` | `dm_projects` |
| Billing Workspace | `/app/dm-governance/billing-workspace` | `dm_billing` |
| Billing Models | `/app/dm-governance/billing` | `dm_billing_config` |
| Invoices | `/app/dm-governance/invoices` | `dm_invoices` |
| Approvals | `/app/dm-governance/approvals` | `dm_approvals` |
| Compliance | `/app/dm-governance/compliance` | `dm_compliance` |
| Annual Recon | `/app/dm-governance/reconciliation` | `dm_reconciliation` |
| Expenses | `/app/dm-governance/expenses` | `dm_expenses` |
| Risks | `/app/dm-governance/risks` | `dm_risks` |
| Scenarios | `/app/dm-governance/scenarios` | `dm_scenarios` |
| Alerts | `/app/dm-governance/alerts` | `dm_alerts` |
| Reports | `/app/dm-governance/reports` | `dm_reports` |
| Integrations | `/app/dm-governance/integrations` | `dm_settings` |

### Displayed data
- User email from `authApi.session()`
- Tab visibility from `GET /api/dm-governance/meta` → `tabs[]` (fallback: show all if meta empty)

### Secondary surfaces
- `VaultAskAi` floating assistant (context via `buildDmAskContext`)
- Nested detail routes inherit same shell

### Side effects
- `GET /api/dm-governance/meta` on mount (bootstraps DM indexes + pilot seed server-side)
- `authApi.session()` on mount

### Orphan / unused screen (not routed)
- `DmDashboardPage.jsx` — **Proactive Control Tower** UI exists but is **not** registered in `App.jsx` routes. Index route is `DmBusinessHealthPage`. Inventory retained below as reference for legacy/control-tower UX still in codebase.

---

## Canonical status vocabularies (cross-screen)

### Invoice statuses (`INVOICE_STATUSES`)
`DRAFT` · `FINANCE_REVIEW` · `PROJECT_REVIEW` · `LEADERSHIP_APPROVED` · `SENT` · `PART_PAID` · `PAID` · `ACCRUED` · `REJECTED`

### Invoice workflow actions (UI labels → action ids)
| Status gate | Button label | Action id |
|---|---|---|
| `DRAFT` | `Submit for finance review` | `submit` |
| `FINANCE_REVIEW` | `Finance approve` | `approve_finance` |
| `PROJECT_REVIEW` | `Leadership approve` | `approve_leadership` |
| `LEADERSHIP_APPROVED` | `Send to SPV` | `send` |
| `SENT` | `Mark accrued (unpaid)` | `accrue` |
| `FINANCE_REVIEW` / `PROJECT_REVIEW` | `Reject` | `reject` |
| `SENT` / `ACCRUED` / `PART_PAID` | `Record payment` | `pay` |

### Revenue statuses
`pre_revenue` · `launched` · `collection_active` · `mature` · `completion`

### Billing model types
`HYBRID_GA` · `RETAINER_SUCCESS` · `COST_PLUS` · `MILESTONE` · `CUSTOM`

### Eligible base types
`topline_gdv` · `agreement_value` · `collections_ttd`

### SPV billing status
`active` · `inactive` · `archived`

### SPV / DMA agreement status
`not_started` · `draft` · `signed` · `expired`

### Compliance document statuses
`not_started` · `draft` · `under_review` · `signed` · `expired`

### Expense approval statuses
`draft` · `pending_approval` · `approved` · `rejected` · `billed`

### Risk / issue severities
`low` · `medium` · `high` · `critical` (also health colors `green` / `amber` / `red`)

### Project risk badge (`riskStatus`)
Displayed raw (e.g. `green`, `amber`, `red`, `critical`, `high`, …) via `dm-badge-{riskStatus}`

### Pillar human labels + UI state words
| Key | Label | State words |
|---|---|---|
| `commercial` | `Commercial` | `OK` / `Watch` / `At risk` (from green/amber/else) |
| `delivery` | `Delivery` | same |
| `financial` | `Financial` | same |
| `people_cost` | `People & cost` (calendar chip: `People`) | same |
| `governance` | `Governance` | same |
| `customer` | `Customer` | same |

### Control-tower domain labels
`Billing & cap` · `Compliance & legal` · `Data integrations` · `Collections & revenue` · `Governance & workflow` · `Planning & precon` · `Construction execution` · `Sales & collections` · `Resource & cost`

### Money formatting (`formatCr`)
- ≥ 1e7 → `₹X.XX Cr`
- ≥ 1e5 → `₹X.XX L`
- else → `₹` + `en-IN` locale

### Pilot defaults in UI
- Project id default: `P004` (Golden HQ)
- SPV id default (compliance): `SPV_GOLDEN_HQ`

---

## 1. Business Health Overview

### Route / entry
- `/app/dm-governance` (index)
- Page: `DmBusinessHealthPage.jsx`
- Sub-nav: `BusinessHealthSubNav` → `Overview` | `Portfolio calendar`

### Interactive controls
| Control | Exact label |
|---|---|
| Sub-nav | `Overview`, `Portfolio calendar` |
| Primary button | `Refresh` / busy: `Updating…` |
| Priority resolve link | `Open →` (or custom from issue) |
| More issues link | `{n} more open items` → `/risks` |
| Project cards | clickable → `/projects/:id` |
| Details summary | `Source apps ({connected}/{total} connected)` |
| Quick-launch links (if enabled) | `Cashflow V1`, `Resource V2`, `V3 Acquisition`, `Post Sales`, `Finance KPI`, `Marketing KPI`, `PreConstruction`, `Execution` |
| Details summary | `DM billing & fees (finance)` |
| Finance nav links | `Billing workspace` · `Invoices` · `Executive pack` |
| Error recovery link | `Portfolio calendar` |

### Displayed data
**Header**
- `How is the business doing?`
- Sub: `One view across sales, delivery, finance, and customers`

**Verdict headlines (exact strings)**
- `Business is on track`
- `Generally healthy — a few items to clear`
- `Some areas need attention`
- `Several areas need attention this week`
- Fallback: `Review the items below`

**Verdict body parts**
- `No active projects in the portfolio yet.`
- Single project: `{name} is the active project ({phase}). GDV {formatCr}…`
- Multi: `{n} projects · combined GDV {formatCr} · {collPct}% collected across portfolio.`
- `{n} open item(s) flagged across sales, delivery, finance, and governance.` / `No cross-app red flags right now.`

**Score line**
- `Overall score {portfolioScore} / 100` · optional scan date (`en-IN`)

**Section: `Six areas of the business`**
- Per pillar: label + state (`OK` | `Watch` | `At risk`) + status class green/amber/red

**Section: `Fix first`**
- Top 3 issues with severity in `critical|high|medium`
- Rank number, `issue.title`, `{projectName} · {recommendedAction}`
- Empty: `Nothing urgent — keep source apps updated and refresh weekly.`

**Section: `Projects`**
- Card: name, badge `{riskStatus}`, line: `{revenueStatus spaces} · GDV {formatCr} · Collections {formatCr}`

**Source apps chips**
- `{label} · not synced` when unavailable
- Status class from `sig.status`

**Finance grid labels**
- `DM billed` · `DM paid` · `Accrued` · `Billing gaps` (= `exceptionsPending`)

### Secondary surfaces
- Collapsible `<details>` for source apps and DM finance
- Links into billing / invoices / executive / risks / calendar / project detail

### Side effects
- Load: `GET /dashboard/consolidated`
- Refresh: `POST /dashboard/proactive-scan` (requires write; also runs risk scan server-side + monthly snapshot upsert)

---

## 2. Portfolio Calendar

### Route / entry
- `/app/dm-governance/calendar`
- Page: `DmPortfolioCalendarPage.jsx`
- Uses `ActivityCalendarShell` (shared Post Sales calendar chrome)

### Interactive controls
| Control | Exact label |
|---|---|
| Sub-nav | `Overview`, `Portfolio calendar` |
| Status chips | `All`, `Overdue`, `Today`, `Upcoming` |
| App chips | Dynamic from `meta.sources[].label` (+ count) |
| Pillar chips | `Commercial`, `Delivery`, `Financial`, `People`, `Governance`, `Customer` |
| Project select | label `Project`; option `All projects` + project names |
| Refresh | `Refresh now` / `Syncing…` |
| Calendar nav | `◀`, `Today`, `▶` |
| View toggles | `Day`, `Week`, `Month`, `Year` |
| Day list event buttons | event title (opens detail) |
| Event CTA | `Open in {sourceLabel} →` |
| Close detail | `Close` |

### Displayed data
**Header**
- `Portfolio calendar`
- Sub: `Live view across DM billing, Post Sales, Cashflow, PreCon, Finance, Marketing, and Hiring.`
- Sync: `· Synced {time en-IN}`

**Stat pills**
- `{n} events`
- `{n} overdue` (danger)
- `{n} today` (warn)

**Calendar event statuses (exact)**
- `overdue` · `today` · `upcoming` · `done`

**Day side panel**
- Date heading (`weekday long`, day, month `en-IN`)
- Empty: `No events this day with current filters.`
- Item meta: `{sourceLabel} · {projectName} · overdue|today`
- Detail DL: `App`, `Date`, `Status`, optional `Project`; subtitle; title

**Source app labels (calendar registry)**
`DM & Billing` · `Post Sales` · `Cashflow V1` · `Resource V2` · `V3 Acquisition` · `PreConstruction` · `Finance KPI` · `Marketing KPI` · `Hiring` · `Execution` · `Sales Dashboard`

**Loading / error**
- `Loading calendar…`
- Error box from API message

### Secondary surfaces
- Selected-day list (aside)
- Event detail panel
- Legend from sources
- Auto-poll every 30s when document visible

### Side effects
- `GET /business-health/calendar?from&to&status&apps&pillars&projects`
- Read-only aggregation; no mutations from this page

---

## 3. Proactive Control Tower (orphan page — not routed)

### Route / entry
- **Not in `App.jsx`.** File: `DmDashboardPage.jsx`
- Historically the “dashboard” before Business Health overview

### Interactive controls
| Control | Exact label |
|---|---|
| Primary | `Run proactive scan` / `Scanning…` |
| Link buttons | `All alerts`, `Executive view` |
| Issue CTA | `Resolve` |
| Approvals KPI sub | `Open inbox →` |
| Overflow | `+{n} more — view risks` |

### Displayed data
**Title:** `Proactive Control Tower`  
**Lead:** `Real-time governance health · {n} issue(s) detected · scanned {datetime}`

**Health ring:** score + `Portfolio health` + `{n} critical` / `{n} high`

**Domain cards:** domain label + score + `{n} issue(s)`

**Section `AI-style insights`:** bullet list of insight strings

**Section `Cross-app signals — vault integrations`**
- App key with underscores → spaces
- `Connected` / `No Mongo state`
- optional `· {n} deviation(s)` + note

**Section `Priority issues — act now`**
- Severity badge (raw severity string)
- Title + optional `sourceLabel` badge
- `{projectName} · {message}`
- Impact line; `→ {recommendedAction}`
- Empty state: **`All clear`** + `No proactive issues detected. Run a full scan after integration sync or billing changes.`

**Watchlist table columns:** `Project`, `Health`, `Issues`, `Cap util`, `Collections`, `Outstanding`

**Portfolio KPIs labels:**  
`Active SPVs`, `Active projects`, `Project topline` (formula tip `Σ topline GDV`), `Collections`, `Max DM fee (10%)`, `DM billed` (sub `Paid {formatCr}`), `DM accrued` (sub `Balance {formatCr}`), `Exceptions` (sub `Missing billing config`), optional `Pending approvals`

**Charts:** `DM billed vs cap` bar chart; **Project radar** cards (code · revenue status · Topline/Collections · DM cap/Billed/% · `Next: {nextBillingTrigger}`)

**SPV summary columns:** `SPV`, `Projects`, `Billed`, `Paid`, `Outstanding`, `Agreement`

### Side effects
- Same as Business Health: `GET /dashboard/consolidated`, `POST /dashboard/proactive-scan`

---

## 4. Executive Analytics

### Route / entry
- `/app/dm-governance/executive`
- Page: `DmExecutivePage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Primary | `Print / PDF pack` / `Preparing…` |
| Project name links | → `/projects/:id` |

### Displayed data
**Title:** `Executive analytics`

**KPI labels**
- `Portfolio topline`
- `Collections rate` (sub `{formatCr} collected`)
- `DM recovery` (sub `Billed {formatCr} · Paid {formatCr}`)
- `Weighted cap util` (sub `Balance {formatCr}`)

**Section `Revenue phase distribution`**
- Cards: phase name (underscores → spaces, capitalized) + `{count} project(s)`

**Table `Project performance` columns**
`Project` · `Phase` · `Collections %` · `Cap util` · `Recovery` · `Construction` · `Latest milestone`

**Table `Monthly billing trend` columns**
`Month` · `Invoices` · `Billed` · `Paid`

**Loading:** `Loading executive analytics…`

### Secondary surfaces
- Print window opened with HTML from export

### Side effects
- `GET /executive/summary`
- Print: `GET /reports/executive-pack/export?format=json` → HTML → `window.print()`

---

## 5. SPV Master (list)

### Route / entry
- `/app/dm-governance/spvs`
- Page: `DmSpvListPage.jsx`

### Interactive controls
- Row link on `spvCode` → `/spvs/:spvId`
- No create button on this page (API supports `POST /spvs`)

### Displayed data
**Title:** `SPV Master`

**Columns:** `Code`, `Name`, `Legal entity`, `GSTIN`, `Billing`, `DMA status`, `Related party`  
- Related party: `Yes` / `No`  
- Empty GSTIN: `—`  
- Empty list: `No SPVs yet.`

### Side effects
- `GET /spvs`

---

## 6. SPV Detail

### Route / entry
- `/app/dm-governance/spvs/:spvId`
- Page: `DmSpvDetailPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Back | `← SPVs` |
| Fields | `SPV code`, `Legal entity`, `PAN`, `GSTIN`, `Billing status`, `Agreement status`, `Registered address`, `Notes` |
| Billing select options | `active`, `inactive`, `archived` |
| Agreement select options | `not_started`, `draft`, `signed`, `expired` |
| Save | `Save SPV` / `Saving…` |
| Linked project cards | → `/projects/:id` |

### Displayed data
- H2: `spvName`
- Success: `Saved`
- Section `Linked projects`: name + `{projectCode} · {revenueStatus}`

### Side effects
- `GET /spvs/:id`
- `PUT /spvs/:id` (audit write)

---

## 7. Project Master (list)

### Route / entry
- `/app/dm-governance/projects`
- Page: `DmProjectListPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Sync | `Import from ga_rp_projects` / `Syncing…` |
| Code link | → `/projects/:id` |

### Displayed data
**Title:** `Project Master`  
**Sync message:** `Synced: {updated} updated, {imported} imported from registry`

**Columns:** `Code`, `Project`, `Topline GDV`, `Collections`, `Revenue status` (underscores → spaces), `Billing model`, `Risk` (colored by `riskColor`)

### Side effects
- `GET /projects`
- `POST /projects/sync-registry` → imports/updates from `ga_rp_projects`

---

## 8. Project Detail (executive summary + edit)

### Route / entry
- `/app/dm-governance/projects/:projectId`
- Page: `DmProjectDetailPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Nav links | `← Projects` · `Billing workspace` · `Billing config` |
| Details | `6-area health breakdown` |
| Sync buttons | `Sync Cashflow V1`, `Full integration sync`, `Sync milestones`, `Sync Execution Dashboard` (busy shared: `Syncing…`) |
| Fields | `Topline GDV`, `Eligible base type`, `DM cap %`, `Revenue status`, `DM sync to Cashflow`, `Construction progress %` |
| Eligible options | `topline_gdv`, `agreement_value`, `collections_ttd` |
| Revenue options | `pre_revenue`, `launched`, `collection_active`, `mature`, `completion` |
| DM sync options | `Enabled — replace ga schedule` / `Disabled` |
| Save | `Save project` / `Saving…` |
| Billing link | `Edit billing configuration →` |
| SPV links | SPV name → `/spvs/:id` |

### Displayed data
**Lead:** `{projectCode} · {location} · Pilot executive summary`

**KPIs**
- `DM cap (10%)` + formula `eligible base × dmCapPct`
- `Billed / Balance` + sub `Balance {formatCr}`
- `Cap utilisation` `%`
- `Collections TTD`

**Pillar states:** `OK` / `Watch` / `At risk`

**Construction milestones table**
- Meta: `Source: {source} · Progress {pct}% · Latest: {label}`
- Columns: `Milestone`, `Target`, `Achieved`, `Cum. CLP %`, `Status` (`✓` / `—`)

**Linked SPVs:** `{spvName} — {agreementStatus}`

**Active billing model:** `{modelType} · Retainer {formatCr}/mo · Markup {pct}%`  
**Missing config error:** `No billing model configured — set up billing before invoicing.`

**Messages**
- `Saved`
- Cashflow: `Cashflow synced · revenue status: {status}`
- Full sync: `Full sync complete — collections: {formatCr}`
- Milestones: `Milestone: {label} ({pct}% progress)` / `Milestones synced`
- Execution: `Execution linked ({engineKey}) · {completion}% complete`

### Side effects
- `GET /projects/:id` (includes executive rollup, billing config, SPVs, businessHealth pillars)
- `PUT /projects/:id`
- `POST /integrations/sync/cashflow-v1/:projectId`
- `POST /projects/:id/sync-all`
- `POST /projects/:id/sync-milestones`
- `POST /projects/:id/sync-execution`

---

## 9. Billing Models (config)

### Route / entry
- `/app/dm-governance/billing` and `/app/dm-governance/billing/:projectId`
- Page: `DmBillingConfigPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Project select | `Project` / option `Select project` |
| Hybrid fields | `Model type`, `Monthly retainer (₹)`, `Markup %`, `Markup cap %`, `DM cap %`, `Eligible base`, `GST %`, `DM sync to Cashflow V1` |
| Model options | `HYBRID_GA (recommended)`, `RETAINER_SUCCESS`, `COST_PLUS`, `MILESTONE`, `CUSTOM` |
| Eligible options | `topline_gdv (default)`, `agreement_value`, `collections_ttd` |
| Sync options | `Yes — replace ga schedule` / `No` |
| Slab editors | `From %`, `To %`, `Cumulative DM %`, `Label` (inline inputs) |
| Save | `Save billing configuration` / `Saving…` |
| Link | `View project executive summary →` |

### Displayed data
**Title:** `Billing Model Configuration`  
**Lead:** `Hybrid GA model: Phase 1 retainer + cost-plus → collection-linked slabs → 10% lifetime cap (default base: topline GDV).`  
**Panels:** `Hybrid settings`, `Collection-linked slabs`  
**Success:** `Billing configuration saved (new version)`

**Default slab labels**
1. `Pre-revenue / retainer only`
2. `Early collections`
3. `Growth`
4. `Mature`
5. `Completion`

### Side effects
- `GET /projects`, `GET /projects/:id/billing-config`
- `POST /projects/:id/billing-config` — creates **new version** of config + slabs

---

## 10. Monthly Billing Workspace

### Route / entry
- `/app/dm-governance/billing-workspace` (+ unused param route `:projectId` in router; page state uses select, default `P004`)
- Page: `DmBillingWorkspacePage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Fields | `Project`, `Billing month` (`type=month`) |
| Pre-rev fields | `Direct expenses (pass-through ₹)`, `Business rationale` |
| Rationale placeholder | `GA is providing active development management before revenue — planning, approvals, coordination, controls.` |
| Buttons | `Save notes`, `Sync from V2` / `Syncing…`, `Run calculation` / `Calculating…`, `Generate draft invoice` |

### Displayed data
**Title:** `Monthly Billing Workspace`  
**Lead:** `Calculate DM fee, sync V2 costs, generate draft invoice. Golden HQ pilot: **P004**.`

**Panels**
- `Pre-revenue inputs`
- `Cost allocation (Resource Planner V2)` — `Allocated: {formatCr} · Employees: {n}`
- `DM fee calculation`

**Calc KPIs:** `Inside cap`, `GST`, `Total invoice`, `Balance eligible`  
**Cap warning:** `Cap breach — leadership approval required before billing outside cap.`

**Tables**
- `Formula trace`: columns `Step`, `Formula`, `Value`
- `Line items`: columns `Head`, `Description`, `Amount`

**Empty calc:** `Run calculation to preview monthly billing.`  
**Messages:** `Pre-revenue notes saved`, `V2 sync: {formatCr} allocated`, `Calculation updated`, `Draft invoice {invoiceNo} created`

### Secondary surfaces
- Navigates away to invoice detail after generate (`window.location.href`)

### Side effects
- `GET /projects`
- `GET /projects/:id/pre-revenue/:month`
- `GET /projects/:id/cost-allocation/:month`
- `PUT /projects/:id/pre-revenue/:month`
- `POST /projects/:id/cost-allocation/:month/sync-v2` (pulls Resource Planner V2)
- `POST /projects/:id/calculate?month=`
- `POST /projects/:id/invoices/generate` → creates `DRAFT` invoice

---

## 11. Invoice Register

### Route / entry
- `/app/dm-governance/invoices`
- Page: `DmInvoiceRegisterPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| CTA | `+ New billing` → billing workspace |
| Invoice link | → `/invoices/:id` |

### Displayed data
**Title:** `Invoice Register`  
**Columns:** `Invoice`, `Project`, `Period`, `Amount`, `Paid`, `Status`  
**Status CSS map:** `DRAFT`, `FINANCE_REVIEW`, `PROJECT_REVIEW`, `LEADERSHIP_APPROVED`, `SENT`, `ACCRUED`, `PAID`, `REJECTED`  
**Empty:** `No invoices yet.`

### Side effects
- `GET /invoices`

---

## 12. Invoice Detail (workflow)

### Route / entry
- `/app/dm-governance/invoices/:invoiceId`
- Page: `DmInvoiceDetailPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Back | `← Invoices` |
| Comment | `Comment` placeholder `Optional approval note` |
| Workflow buttons | (see Canonical invoice workflow table) |
| Payment | `Amount (₹)`, `Record payment` |

### Displayed data
**Lead:** `{projectId} · {periodMonth} · **{status}**`  
**Cap flag:** `Cap breach flagged — requires leadership approval.`

**KPIs:** `Taxable`, `Inside cap`, `GST`, `Total / Paid`

**Panels**
- `Line items` (`Head`, `Description`, `Amount`) + optional `Rationale: {businessRationale}`
- `Workflow`
- `Record payment` (when status ∈ `SENT`, `ACCRUED`, `PART_PAID`)
- `Source calculation` (formula rows)
- `Approval history`: `{datetime en-IN} — {action} by {by} — {comment}`

**Messages:** `Payment recorded`, `Status updated: {action}`

### Side effects
- `GET /invoices/:id` (+ calculation)
- `POST /invoices/:id/transition` `{ action, comment }`
- `POST /invoices/:id/payments` `{ amount, remarks }`
- Writes audit; may update payment totals / status to `PART_PAID` / `PAID`

---

## 13. Approval Inbox

### Route / entry
- `/app/dm-governance/approvals`
- Page: `DmApprovalInboxPage.jsx`

### Interactive controls
- Cards link to invoice detail

### Displayed data
**Title:** `Approval Inbox`  
**Card:** invoiceNo; `{projectId} · {periodMonth}`; `{formatCr} · {status}`; optional warning `Leadership approval required`  
**Empty:** `No pending approvals.`

### Side effects
- `GET /approvals/inbox` (statuses `FINANCE_REVIEW` / `PROJECT_REVIEW`)

---

## 14. Expense & Reimbursement Tracker

### Route / entry
- `/app/dm-governance/expenses`
- Page: `DmExpensesPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Project select | `Project` |
| Import | `Import from Cashflow V1 actuals` |

### Displayed data
**Title:** `Expense & Reimbursement Tracker`  
**Billable total line:** `Billable total: {formatCr} ({n} items)`  
**Import msg:** `Imported {n} from Cashflow ({skipped} skipped)`

**Columns:** `Date`, `Vendor`, `Category`, `Amount`, `Billable` (`Yes`/`No`), `Status` (`approvalStatus`), `Source`

**Expense categories (API constants):**  
`direct_project`, `consultant_coordination`, `approval_support`, `design_coordination`, `project_travel`, `site_administration`, `sales_readiness`, `marketing_readiness`, `legal_compliance`, `misc_governance`, `third_party_ga_paid`, `shared_service_allocation`

### Side effects
- `GET /expenses?projectId=`
- `POST /projects/:id/expenses/import-cashflow`
- (API also has `POST /expenses`, `PUT /expenses/:id` — **no create/edit UI** on this page)

---

## 15. Annual Reconciliation

### Route / entry
- `/app/dm-governance/reconciliation`
- Page: `DmReconciliationPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Fields | `Project`, `Financial year` (placeholder `2025-26`) |
| Buttons | `Build reconciliation`, `Lock (leadership)` |

### Displayed data
**Title:** `Annual Reconciliation`  
**Lead:** `True-up against 10% DM fee cap — India FY (Apr–Mar).`  
**Panel title:** `FY {financialYear} · Locked` or `· Draft`

**Row labels (exact, left column)**
1. `Project topline`
2. `Collections till date`
3. `Maximum DM fee entitlement (10%)`
4. `Opening unpaid GA invoices`
5. `Monthly retainers billed`
6. `Cost-plus billed`
7. `Reimbursements billed`
8. `Collection-linked DM fee`
9. `Total GA billing`
10. `Amount adjusted against cap`
11. `Amount outside cap`
12. `Amount paid by SPV`
13. `Amount accrued / payable`
14. `Balance DM fee eligible`
15. `Excess billed`
16. `Credit adjustment required`

**Over-billing banner:** `Over-billing detected — credit note or adjustment required: {formatCr}`  
**Empty:** `Build reconciliation to generate statement.`  
**Messages:** `Reconciliation built`, `Reconciliation locked`

### Side effects
- `GET /projects/:id/reconciliation/:fy`
- `POST /projects/:id/reconciliation/:fy/build`
- `POST /projects/:id/reconciliation/:fy/lock` (requires approve permission)
- (List API `GET /reconciliations` unused by this page)

---

## 16. Compliance & Documentation Matrix

### Route / entry
- `/app/dm-governance/compliance`
- Page: `DmCompliancePage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| SPV select | `SPV` |
| Per-row | Status `<select>`, Owner `<input>`, Due `<input type=date>` (auto-save on change) |

### Displayed data
**Title:** `Compliance & Documentation Matrix`

**KPIs**
- `Audit readiness` `{score}%` — sub `{signed}/{required} required docs signed`
- `Missing` count

**Columns:** `Document`, `Required` (`Yes`/`No`), `Status`, `Owner`, `Due`

**Default checklist document names**
1. `Development Management Agreement` (required)
2. `Shared Services Agreement` (required)
3. `HR Administration Support Agreement` (required)
4. `Brand Usage Agreement` (optional)
5. `Authority Matrix` (required)
6. `Delegation of Powers` (required)
7. `Payroll Responsibility Matrix` (required)
8. `Billing and Reconciliation Policy` (required)
9. `Cost Allocation Policy` (required)
10. `Related Party Transaction Approval` (required)
11. `Board / Partner Approval Note` (required)
12. `Annual Reconciliation Approval` (optional)

**Message:** `Updated`

### Side effects
- `GET /compliance/spv/:spvId` (ensures checklist for pilot)
- `PUT /compliance/:docId` `{ status | owner | dueDate }` — recomputes readiness

---

## 17. Risk & Exception Dashboard

### Route / entry
- `/app/dm-governance/risks`
- Page: `DmRiskPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Scan | `Scan all projects` |
| Resolve | `Resolve` (sets status `resolved`) |
| Project links | projectId → `/projects/:id` |

### Displayed data
**Title:** `Risk & Exception Dashboard`

**Section `Billing triggers`**
- Card title: `{triggerType}`
- Body: `{message}` + project link

**Trigger types (constants):**  
`collection_threshold`, `revenue_status_change`, `construction_milestone`, `monthly_billing_due`, `annual_recon_due`, `compliance_gap`, `cap_threshold`

**Section `Open risks ({n})` columns**  
`Severity`, `Project`, `Category`, `Message`, `Suggested action`, (actions)

**Empty:** `No open risks — run scan to detect.`

### Side effects
- `GET /risks`, `GET /billing-triggers`
- `POST /risks/scan` (all projects or scoped)
- `PUT /risks/:id` `{ status: 'resolved' }`
- (API `PUT /billing-triggers/:id` unused by UI)

---

## 18. Billing Scenario Simulator

### Route / entry
- `/app/dm-governance/scenarios`
- Page: `DmScenarioPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Fields | `Project`, `Scenario label`, `Collections TTD override (₹)`, `Retainer / month override (₹)`, `Revenue status override` |
| Placeholders | `Leave blank = current`, `Leave blank = config` |
| Revenue options | `— current —`, `pre_revenue`, `collection_active`, `mature` |
| Default label | `Collections +10%` |
| Run | `Run scenario` / `Running…` |

### Displayed data
**Title:** `Billing scenario simulator`  
**Lead:** `What-if analysis — collections, retainer, revenue phase. Does not change live billing.`

**Result KPIs:** `Baseline invoice`, `Scenario invoice` (Δ sub), `Cap util after`, `Phase` (+ `Cap breach` if flagged)

**Saved scenarios table:** `When`, `Label`, `Scenario total`, `Δ vs baseline`

### Side effects
- `GET /projects/:id/scenarios`
- `POST /projects/:id/scenarios/run` — persists scenario row; **does not** mutate live invoices/config

---

## 19. Alerts & Notifications

### Route / entry
- `/app/dm-governance/alerts`
- Page: `DmAlertsPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Open | `Open` (link) |
| Ack | `Ack` (only if id starts with `ntf_`) |

### Displayed data
**Title:** `Alerts & notifications`

**KPIs:** `Total alerts`, `Critical / high` (sum), `Pending approvals`, `Billing triggers`

**Columns:** `Severity`, `Type`, `Project`, `Alert` (title + detail), `Action`

**Loading:** `Loading alerts…`

### Side effects
- `GET /alerts` (aggregates risks, triggers, pending invoices, notifications, sync freshness)
- `POST /alerts/:id/ack` for notification ids

---

## 20. Reports Center

### Route / entry
- `/app/dm-governance/reports`
- Page: `DmReportsPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Report cards | `SPV-wise DM fee summary`, `GST billing report`, `Executive analytics pack`, `Auditor pack (invoices + recon + compliance)` |
| Export | `Export JSON`, `Print / PDF`, `Download auditor pack (JSON)` |

### Displayed data by report

**`dm-fee-summary` — panel `DM fee summary`**  
Columns: `Project`, `Topline`, `Collections`, `Billed`, `Paid`, `Accrued`

**`gst-billing` — panel `GST billing`**  
Columns: `Invoice`, `Period`, `Taxable`, `GST`, `Total`

**`auditor-pack` — panel `Auditor pack`**  
Lead: `{n} invoices · {n} reconciliations · {n} compliance docs`

**`executive-pack` — panel `Executive pack`**  
Lead: `Portfolio KPIs, project performance, billing trend.` (no on-screen table; print only)

**Loading:** `Loading…`

### Side effects
- `GET /reports/:reportId`
- `GET /reports/:reportId/export?format=json` → HTML print / JSON download client-side

---

## 21. Integrations

### Route / entry
- `/app/dm-governance/integrations`
- Page: `DmIntegrationsPage.jsx`

### Interactive controls
| Control | Exact label |
|---|---|
| Buttons | `Run full sync (P004)` / `Syncing…`, `Sync milestones`, `Sync Execution Dashboard` |

### Displayed data
**Title:** `Integrations`  
**Lead:** `Cashflow V1 · Resource Planner V2 · Expense import · Sales/collections · Construction milestones · Risk scan · Billing triggers`

**Panel `Golden HQ — full sync`**  
Sub: `Pulls collections, expenses, V2 costs, compliance checklist, detects billing triggers and risks.`

**Pending billing triggers:** `{message} ({projectId})` in warning text

**Sync log columns:** `When`, `Source`, `Project`, `Status`, `User`

**Messages**
- `Full sync OK — cashflow: yes|no, expenses: {n}, risks: {n}`
- `Milestones synced — {n} steps`
- `Execution linked: {engineKey}`

### Side effects
- `GET /integrations/status`
- `GET /billing-triggers?projectId=P004`
- `POST /projects/P004/sync-all`
- `POST /projects/P004/sync-milestones`
- `POST /projects/P004/sync-execution`
- Full sync orchestrates cashflow pull, expense import, V2 cost sync, compliance ensure, trigger detection, risk scan (+ sync logs)

---

## API inventory (`/api/dm-governance`)

### Meta / dashboard / calendar
| Method | Path | Used by UI |
|---|---|---|
| GET | `/meta` | Layout |
| GET | `/dashboard/consolidated` | Business Health (+ orphan Dashboard) |
| POST | `/dashboard/proactive-scan` | Business Health Refresh |
| GET | `/business-health/calendar` | Portfolio calendar |

### SPVs / projects / billing config
| Method | Path | Used by UI |
|---|---|---|
| GET | `/spvs` | SPV list, Compliance, etc. |
| GET | `/spvs/:id` | SPV detail |
| POST | `/spvs` | **API only** (no list-page create UI) |
| PUT | `/spvs/:id` | SPV detail save |
| GET | `/projects` | Many selects/lists |
| GET | `/projects/:id` | Project detail |
| PUT | `/projects/:id` | Project detail save |
| POST | `/projects/sync-registry` | Project list import |
| GET | `/projects/:id/billing-config` | Billing Models |
| POST | `/projects/:id/billing-config` | Billing Models save |

### Integrations
| Method | Path | Used by UI |
|---|---|---|
| POST | `/integrations/sync/cashflow-v1/:projectId` | Project detail |
| POST | `/integrations/push/cashflow-v1/:projectId` | **API only** |
| GET | `/integrations/status` | Integrations |
| GET | `/audit` | **API only** |

### Billing / invoices (phase billing router)
| Method | Path | Used by UI |
|---|---|---|
| POST | `/projects/:id/calculate` | Billing workspace |
| GET | `/projects/:id/calculations` | **API only** |
| GET/PUT | `/projects/:id/pre-revenue/:month` | Billing workspace |
| GET | `/projects/:id/cost-allocation/:month` | Billing workspace |
| POST | `/projects/:id/cost-allocation/:month/sync-v2` | Billing workspace |
| GET | `/invoices` | Invoice register |
| GET | `/invoices/:id` | Invoice detail |
| POST | `/projects/:id/invoices/generate` | Billing workspace |
| POST | `/invoices/:id/transition` | Invoice detail |
| POST | `/invoices/:id/payments` | Invoice detail |
| GET | `/approvals/inbox` | Approvals |

### Phase 3 — expenses / recon / compliance / risks / reports
| Method | Path | Used by UI |
|---|---|---|
| POST | `/projects/:id/sync-all` | Project detail, Integrations |
| GET/POST | `/expenses` | List used; create **API only** |
| PUT | `/expenses/:id` | **API only** |
| POST | `/projects/:id/expenses/import-cashflow` | Expenses |
| GET | `/projects/:id/reconciliation/:fy` | Annual Recon |
| POST | `.../build`, `.../lock` | Annual Recon |
| GET | `/reconciliations` | **API only** |
| GET | `/compliance/spv/:spvId` | Compliance |
| PUT | `/compliance/:docId` | Compliance |
| GET | `/risks` | Risks |
| POST | `/risks/scan` | Risks |
| PUT | `/risks/:id` | Risks Resolve |
| GET | `/billing-triggers` | Risks, Integrations |
| PUT | `/billing-triggers/:id` | **API only** |
| GET | `/reports/:reportId` | Reports |

### Phase 4 — scenarios / alerts / executive / milestones
| Method | Path | Used by UI |
|---|---|---|
| POST | `/projects/:id/scenarios/run` | Scenarios |
| GET | `/projects/:id/scenarios` | Scenarios |
| GET | `/alerts` | Alerts |
| POST | `/alerts/:id/ack` | Alerts |
| GET | `/executive/summary` | Executive |
| GET | `/reports/:reportId/export` | Executive, Reports print |
| GET | `/projects/:id/milestones` | **API only** (detail uses snapshot on project) |
| POST | `/projects/:id/sync-milestones` | Project detail, Integrations |
| POST | `/projects/:id/sync-execution` | Project detail, Integrations |

---

## Mongo collections (`DM_COLLECTIONS`)

| Key | Collection |
|---|---|
| spvs | `dm_spvs` |
| projects | `dm_projects` |
| billingConfigs | `dm_billing_configs` |
| billingSlabs | `dm_billing_slabs` |
| feeCalculations | `dm_fee_calculations` |
| invoices | `dm_invoices` |
| payments | `dm_payments` |
| costAllocations | `dm_cost_allocations` |
| preRevenueBilling | `dm_pre_revenue_billing` |
| expenses | `dm_expenses` |
| annualReconciliations | `dm_annual_reconciliations` |
| complianceDocuments | `dm_compliance_documents` |
| billingTriggers | `dm_billing_triggers` |
| riskExceptions | `dm_risk_exceptions` |
| collectionSnapshots | `dm_collection_snapshots` |
| auditLogs | `dm_audit_logs` |
| systemSettings | `dm_system_settings` |
| integrationSyncLogs | `dm_integration_sync_logs` |
| scenarios | `dm_scenarios` |
| notifications | `dm_notifications` |

(+ business-health monthly KPI trend snapshots via `server/lib/businessHealth/snapshots.js`)

---

## Permissions & RBAC notes

**Permissions:** `dm_admin`, `dm_finance`, `dm_approve`, `dm_hr`, `dm_spv_review`, `dm_view` (+ platform `manage_security`)

**Write gate (`requireDmWrite`):** admin / finance / manage_security — needed for scan, syncs, saves, calculate, generate invoice, etc.

**Approve gate (`requireDmApprove`):** approve / admin / manage_security — leadership transitions, recon lock.

**Route ACL:** pathname prefix `/app/dm-governance` → appId `dm_spv_governance`; API prefix `/api/dm-governance`.

**Tab filtering:** layout filters `DM_NAV` using meta tabs with aliases (e.g. Business Health ← `dm_business_health` OR `dm_dashboard`; Approvals ← invoices OR `dm_approvals`; etc.).

---

## Invoice line heads (calculation engine)

| Code | Display description |
|---|---|
| `RETAINER` | `Development Management Retainer` |
| `SHARED_COST` | `Allocated Shared Service Cost` |
| `MARKUP` | `Cost-plus Markup` |
| `REIMBURSEMENT` | `Project-Specific Expense Reimbursement` |
| `COLLECTION_FEE` | `Collection-Linked DM Fee` |
| `ADJUSTMENT` | `Adjustment against DM fee cap` |
| `GST` | `GST` |

---

## File map (client pages)

| File | Route |
|---|---|
| `DmGovernanceLayout.jsx` | shell |
| `DmBusinessHealthPage.jsx` | `/` |
| `DmPortfolioCalendarPage.jsx` | `/calendar` |
| `DmDashboardPage.jsx` | *(unrouted)* |
| `DmExecutivePage.jsx` | `/executive` |
| `DmSpvListPage.jsx` | `/spvs` |
| `DmSpvDetailPage.jsx` | `/spvs/:spvId` |
| `DmProjectListPage.jsx` | `/projects` |
| `DmProjectDetailPage.jsx` | `/projects/:projectId` |
| `DmBillingConfigPage.jsx` | `/billing`, `/billing/:projectId` |
| `DmBillingWorkspacePage.jsx` | `/billing-workspace`, `/billing-workspace/:projectId` |
| `DmInvoiceRegisterPage.jsx` | `/invoices` |
| `DmInvoiceDetailPage.jsx` | `/invoices/:invoiceId` |
| `DmApprovalInboxPage.jsx` | `/approvals` |
| `DmExpensesPage.jsx` | `/expenses` |
| `DmReconciliationPage.jsx` | `/reconciliation` |
| `DmCompliancePage.jsx` | `/compliance` |
| `DmRiskPage.jsx` | `/risks` |
| `DmScenarioPage.jsx` | `/scenarios` |
| `DmAlertsPage.jsx` | `/alerts` |
| `DmReportsPage.jsx` | `/reports` |
| `DmIntegrationsPage.jsx` | `/integrations` |

**Supporting UI:** `BusinessHealthSubNav.jsx`, `ActivityCalendarShell.jsx`, `dm-governance.css`, `businessHealthQuickLaunch.js`

---

## Reskin notes (Phase 0 observations)

1. Product surface name in UI is **Business Health**, vault catalog **Business Health Command Center**; legacy code/docs still say DM SPV Governance / Board Room.
2. Highest-interaction financial surfaces: Billing Workspace, Invoice Detail workflow, Billing Models, Annual Recon — called out in `DEFERRED.md` as high-risk for CSS-only rewrites.
3. `DmDashboardPage` (Control Tower) is still a rich reference UI but replaced at index by the simplified Business Health overview; decide whether to re-route, fold, or drop in reskin.
4. Several APIs lack UI (create SPV, create/edit expense, push cashflow schedule, ack billing triggers, audit log viewer, calculations history).
5. Pilot hard-coding (`P004`, `SPV_GOLDEN_HQ`) appears on Billing Workspace, Expenses, Recon, Scenarios, Integrations, Compliance defaults.
