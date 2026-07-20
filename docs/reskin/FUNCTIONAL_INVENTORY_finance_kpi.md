# Functional Inventory — GA Finance KPI & Governance (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `finance_kpi`
**Vault path:** `/legacy/GA_Finance_KPI.html` (single self-contained file — markup + inline JS)
**Doc title:** "GA Finance KPI & Governance"; header: "Golden Abodes **Finance KPI & Governance**" / "Finance & Accounts · FY 2026-27 · KPI tracking, registers & appraisals"
**Source of truth:** `GA_Golden_Abodes_Platform/client/public/legacy/GA_Finance_KPI.html`
**Storage:** `localStorage[LS_KEY]`; optional Mongo sync via `GET/PUT /api/apps/finance_kpi/state` when `localStorage['ga_mongo_state_enable']==='1'` (auto-enabled after authenticated session)
**Admin gating:** `ADMIN` is true if platform session has `manage_security` permission or the app right `finance_kpi_admin` (`ADMIN_APP`), OR via an offline password fallback (`ADMIN_PW`) when the platform API is unreachable. Non-admins get read-only KPI Manager/Team screens and cannot unlock reviews/appraisals or edit compliance/registers structurally.

---

## 1. Shell

### Header
- Logo/title + FY subtitle
- `#adm-badge` — "ADMIN · {name} · via Admin Security" or "· offline" (hidden when not admin)
- Button **Admin access** / **Admin info** / **Exit admin** (`adm-btn`, behavior depends on admin state — see §9)
- `#save-status` text (e.g. "Cloud saved · v{n}", "Loaded from cloud · v{n}", "Cloud save offline")
- Label **Import Excel** → hidden file input (`.xlsx,.xls`) → `importExcel()`
- Button **Export Excel** → `exportExcel()`
- Button **Save** (primary) → `saveState(true)`

### Tabs (`showTab(id)`, `TAB_IDS`)
| id | Label |
|---|---|
| `dash` (default) | Dashboard |
| `comp` | Compliance Calendar |
| `actcal` | Activity Calendar |
| `reg` | Registers |
| `review` | Monthly Review |
| `appr` | Appraisal |
| `kpi` | KPI Manager |
| `work` | Work Split |
| `team` | Team & Data |

---

## 2. Dashboard (`renderDash`, `#page-dash`)

- Top banner: `⚠ {n} statutory filing(s) OVERDUE this FY — open the Compliance Calendar and act today.` (warn) or `✓ No overdue statutory filings in FY {label}.` (ok-strip)
- KPI-stat strip (7 cards): **Compliance on-time FYTD** (%), **Overdue now**, **Due next 14 days**, **Reviews — {month label}** (locked/total), **Open RA bills**, **Corrections — {month}**, **Training FY{label}** (%)
- **Team scoreboard — latest reviewed month** table: Employee, Lane, Role, Month, Weighted score (x.xx/4.00), Band, KPIs rated, Status (🔒 Locked / Open / —)
- **Work split — two pods** — pod cards (`pod-comp`/`pod-ops`) per lane (`COMP`/`OPS`): lane label, SR member ("· Accountable"), JR member ("· Executes"), cross-review backup note, button **Open full work split →** (jumps to Work Split tab)
- **Statutory dues — next 14 days** table: Due, Obligation, Authority, Period, Status badge — or hint "Nothing due in the next 14 days."
- **Register health** card: table (Register, Entries, Last entry — "never" in red if empty) for Compliance Calendar, RA Bill Register, Correction Log, Payment Tracker, Training Tracker + note: "A register going quiet means KPI evidence is not being captured — chase it in the weekly review."
- **MBR one-liner** card: auto-generated Monthly Business Review sentence (`mbrLine`) combining compliance %, overdue/late counts, open RA bills, and each active employee's latest prior-month score; button **Copy to clipboard** → `navigator.clipboard.writeText` (falls back to `window.prompt`)

## 3. Compliance Calendar (`renderComp`, `#page-comp`)

- Info banner: "FY {label} calendar. Enter the **actual filing date** the moment each filing is completed — status updates instantly. Feeds Sr. KPIs (GST / TDS / RERA / notices)." + (non-admin) "Structural changes (add / delete / upload) need admin rights — tied to your App Vault login, granted in **Admin Security**."
- Table: Month, Obligation, Authority, Period, Due date, Actual date, Early/(Late), Status, Remarks, (admin-only delete column)
- Status vocab (`compStatus`): **On time**, **Late {n}d**, **OVERDUE {n}d**, **Due in {n}d**
- Admin actions: add obligation via `window.prompt` chain (Obligation name → Authority [default "Other"] → Due date [default today]); Import Excel (button in header) parses obligations via SheetJS

## 4. Activity Calendar (`renderActCal`, `#page-actcal`)

- Mounted via shared `GAActivityCalendar` component (`#mkt-cal-root`-equivalent root) inside `.cal-page-wrap`
- Uses compliance due dates / register dates as calendar events (same shared calendar core as Sales/Marketing dashboards)

## 5. Registers (`renderReg`, `#page-reg`)

Sub-tab lockbar with 4 register pickers (`sc-btn`): **RA Bill Register**, **Correction Log**, **Payment Tracker**, **Training Tracker**

### 5a. RA Bill Register (`renderRa`)
- Info: "Clock starts when the **approved** RA bill reaches accounts (QS/site sign-off) — target payment within **10 working days**." + this month's average working-days summary
- Table: Bill ref, Contractor, Project, QS approval, Received in accounts, Gross ₹, TDS %, Retention %, Net ₹, Payment date, Working days, Status, (delete)

### 5b. Correction Log (`renderCorr`)
- Info: "Log **every work item returned for correction** — daily, right after each review. Feeds error-escalation and rework KPIs; monthly counts appear as hints in the review grid."
- Button **+ Log correction**
- Table: Date, Employee, Task type, Error / issue, Corrective action, Resubmitted, Days to fix, (delete)

### 5c. Payment Tracker (`renderPay`)
- Info: "Operations pod (**{Jr name}**) flags every payment to **{Sr name}** ≥ 3 working days before due date. RED alert = flagged late or not flagged."
- Table: Category, Description, Amount ₹, Due date, Flagged to Sr., Days in advance, Alert, Payment date, Status, (delete)

### 5d. Training Tracker (`renderTrain`)
- Info: "Modules are assigned at the start of each quarter; completion date is entered when finished. Feeds the training-completion KPIs."
- Button **+ Assign module**
- Table of assigned modules per employee/quarter with completion date and remarks

## 6. Monthly Review (`renderReview`, `#page-review`)

- Lockbar: employee `<select>`, month `<input type=month>`
- **Score hero**: employee · month label (+"· quarter-end" if applicable); big score number `x.xx / 4.00` colored by band; band badge (**★ Outstanding** / **Exceeds Expectations** / **Meets Expectations** / **Needs Improvement**); delta vs prior month (▲/▼); "{rated}/{due} KPIs rated"; button **✓ Complete & lock review** or (if locked) badge "🔒 Completed by {name} · {date}" + button **Unlock** (admin-only, via `needAdmin()`)
- Freeze warning: "⏰ Freeze date ({date}) has passed — finish this review and lock it." (month M freezes on 5th of M+1)
- **Step 1 — Enter actuals**: button "→ Accept {n} suggestion(s) from registers" (auto-fill from `suggest()` — see §8); note "Quarterly KPIs are due this month" / "Quarterly KPIs not due — scored in Jun / Sep / Dec / Mar"; KPI table (#, KPI [+ hint, Q badge if quarterly], Wt%, Target, Actual [number input + suggestion chip], Rating [`r1`–`r4` + `RATE_LABEL`]) grouped by category row; band guide footnote: "3.50–4.00 ★ Outstanding · 3.00–3.49 Exceeds · 2.50–2.99 Meets · below 2.50 Needs Improvement. Score renormalizes over the KPIs rated."
- **Step 2 — 1:1 conversation (15 minutes)**: meeting date input; three text boxes **✓ WHAT WENT WELL**, **⚠ WHAT NEEDS ATTENTION**, **→ ACTIONS FOR NEXT MONTH**; "LAST MONTH'S ACTIONS:" status select (`''`/`Done`/`Partial`/`Not done`/`n/a`) + readout of prior month's recorded actions
- **Step 3 — Complete**: explanatory note that locking makes the month read-only, feeds the appraisal, and shows ✓ on Dashboard; unlocking needs admin rights and is audit-logged
- `completeReview()` confirmation prompt (`window.prompt`) warns if KPIs unrated or 1:1 notes empty, requires reviewer name to confirm
- `unlockReview()` requires admin + reason prompt, logged to audit trail

## 7. Appraisal (`renderAppr`, `#page-appr`)

- Lockbar: employee select, period select (**H1 — Apr to Sep {FY}** / **H2 — Oct {FY} to Mar {FY+1}**)
- Info: "The appraisal **writes itself** from the monthly reviews: score = average of completed months; the 1:1 notes below are the evidence for the conversation. Hold it twice a year, sign three ways, lock — done. Payout band follows the score."
- If locked: ok-strip "🔒 Signed off and locked on {date}. Unlocking requires the admin password."
- Stat cards: **Months reviewed** ({scored}/{total}, {locked} locked), **Period average** (x.xx/4.00), **Band**
- Per-month score table (🔒 icon for locked months) + warning if any reviewed month isn't locked yet
- **1:1 evidence trail** table: Month, Went well, Needed attention, Actions, Prior status (only if notes exist)
- Two textareas: **REVIEWER COMMENTS & OBSERVATIONS**, **DEVELOPMENT / VARIABLE-PAY NOTE**
- Three sign-off boxes: **EMPLOYEE**, **REVIEWER**, **PRINCIPAL / MP — {PRINCIPAL_NAME}** (free-text "Name & date")
- Button **🔒 Sign off & lock appraisal** (`lockAppr` — requires all 3 signatures + `window.confirm`) or **Unlock (admin)** (`unlockAppr` — needs admin + reason prompt)

## 8. KPI Manager (`renderKpiMgr`, `#page-kpi`)

- Lockbar: employee select (shows name — title · lane); admin-only buttons **+ Add KPI**, **Reset to role template**
- Info (admin): "Admin mode ({name}): {lane badge} {emp} — edit any cell directly. A KPI scores only when it has a direction, thresholds and a weight above 0. Aim for weights totalling 100." / (non-admin): "{lane badge} KPI set for {emp} — read-only. Admin rights (Admin Security → app right \"finance_kpi_admin\") needed to add, modify or delete KPIs."
- Warning if active weights don't total 100 (score still computes via renormalization)
- KPI table columns: #, Category, KPI (name + "AUTO-SUGGESTED FROM REGISTER" tag if `auto` set), Freq (M/Q), Wt%, Dir (≤/≥/—), T4/T3/T2 threshold cells, Target/benchmark, Input hint, Evidence source, Status (Active/Draft badge), (admin: delete button)
- Footer row: "ACTIVE WEIGHT TOTAL" (green if =100, red otherwise) + "{active}/{total} KPIs"
- `addKpi` → prompt for name → new Custom KPI (wt 0, no dir/thresholds until admin configures)
- `delKpi` → confirm dialog noting past scores remain stored but stop counting
- `resetKpis` → confirm dialog, restores role's `TEMPLATES[role]`

### KPI templates (`TEMPLATES`) — role-scoped catalogs (parity-critical data)
- **SR (Senior Accountant)** — 13 KPIs across categories: Financial Reporting & Accuracy (Monthly book closure TAT, P&L variance, Audit findings count), Statutory & Compliance (GST filing timeliness, TDS compliance rate, RERA compliance, Statutory notices/penalties), RA Bills & Contractor Payments (RA bill processing cycle time), MIS & Management Reporting (MIS delivery timeliness, Investor reporting accuracy), Team Oversight & Quality Control (Junior error escalation rate, Training completion, SOP adherence rate)
- **JR (Junior Accountant)** — 14 KPIs across: Data Entry & Transactional Accuracy (Voucher entry accuracy, Bank reconciliation timeliness), Payables & Vendor Management (Invoice processing TAT, RA bill data prep accuracy, Vendor ledger reconciliation, Payment due-date alert timeliness), Statutory Filing Support (GST data compilation, TDS working sheet prep, 26AS/ITC reconciliation), MIS & Reporting Support (Ledger data submission, Document filing readiness), Quality, Conduct & Growth (Rework/error correction rate, Deadlines met without follow-up, Training module completion)
- **FN (Finance Head / Treasury, draft — all weight 0)** — 8 KPIs: Treasury & Liquidity (13-week cashflow forecast accuracy, Liquidity runway), Funding & Lenders (Cost of borrowed funds, Lender covenant compliance), Capital Deployment (Fund utilization vs plan), Investor Relations (reporting cadence), Receivables (Collections efficiency), Planning & Control (Budget re-forecast discipline)
- Each KPI record: `{id, cat, name, freq(M/Q), wt, target, hint, dir(lte/gte/null), th:[t4,t3,t2], formula, src, auto?}` — `auto` values (`gst`, `ra`, `pay`, `trainSr`/`trainJr`, `corrSr`/`corrJr`) drive register-based auto-suggestions in Monthly Review (§ suggest())
- Rating bands (`band()`): ≥3.5 **★ Outstanding**, ≥3.0 **Exceeds Expectations**, ≥2.5 **Meets Expectations**, else **Needs Improvement**

## 9. Work Split (`renderWorkSplit`, `#page-work`)

- Info: "McKinsey-style **2-pod model** for Golden Abodes Finance & Accounts. Split by **process domain** (compliance vs operations), not by project. Everything below is **editable** — adjust as the team or project load changes. Changes auto-save."
- Legend: "R = does the work · A = accountable/sign-off · C = consulted/reviews · I = informed"
- Button **Reset to GA default** (`resetWorkSplit`, confirm dialog, preserves employee names/lanes)
- **Operating model** — free-text textarea
- **Pods & scope (edit per person)** — pod cards per lane with per-employee scope-of-work textarea, tags "Accountable · signs off" (SR) / "Responsible · prepares" (JR), cross-links (Jr/Lead/Backup reviewer)
- **RACI — who does what** table: Process (editable text) + R/A/C/I employee-picker `<select>` columns (color-coded `raci-r/a/c/i`), delete row, button **+ Add process**
- **Monthly rhythm (post month-end)** table: When + one column per active employee (free text), delete row, button **+ Add rhythm row**
- **Scaling triggers** table: Trigger, Action, delete row, button **+ Add trigger**
- **Stand-up cadence** — free-text textarea

## 10. Team & Data (`renderTeam`, `#page-team`)

- Info: "Vikas & Ketan lead the two pods. Sairaj & Shubham execute. Lane and reporting links feed the **Work Split** tab. KPI templates are set per role on first load / reset."
- Table: Name, Title, Role template, Lane, Pod link, Active, (delete) — editable inline fields
- Button **+ Add employee** (prompt for name → new employee with default role `JR`, title "Jr. Accountant")
- Reset-all-data control: `window.prompt('Type RESET to confirm:')` → wipes state via `defaultState()`

---

## 11. Auto-suggested KPI actuals (`suggest()`) — parity-critical logic
| `auto` key | Source register | Suggestion logic |
|---|---|---|
| `gst` | Compliance Calendar, authority `GSTN` | % of that month's GST filings actually filed on/before due date (only if all rows for month have an actual date) |
| `ra` | RA Bill Register | Average working days from `received` to `paymentDate` for bills paid in month |
| `pay` | Payment Tracker | Count of dues NOT flagged ≥3 working days ahead (missed-alert count) |
| `trainSr` / `trainJr` | Training Tracker | % of quarter's assigned modules completed (only at quarter-end; `trainJr`=employee's own modules, `trainSr`=all *other* employees' modules) |
| `corrSr` / `corrJr` | Correction Log | Count of corrections in month (no numeric suggestion — just a note; `corrSr`=all corrections, `corrJr`=that employee's own) |

## 12. Secondary surfaces / side effects

- `GAVaultAskAI.mount({appId:'finance_kpi', appLabel:'Finance KPI', title:'Ask Finance KPI', ...})` (inline mount, see file tail ~line 1675)
- Dependent scripts: SheetJS xlsx (CDN, preconnect only — loaded lazily on import/export), `/legacy/ga_activity_calendar_core.js`/`.css`, `/legacy/ga_vault_ask_ai.js`
- Mongo cloud sync: debounced (800ms) `PUT /api/apps/finance_kpi/state` with optimistic-concurrency `expectedVersion`, initial `GET` pull on load; auto-enabled after `/api/auth/session` reports authenticated
- Audit trail: `logAudit(action, detail)` prepends to `S.audit` (capped 500 entries) for review lock/unlock, appraisal lock/unlock, KPI add/delete/reset, work-split reset, admin on/off — timestamped
- `window.prompt`/`window.confirm`/`alert` used extensively for admin-gated destructive or lock/unlock actions (no custom modal component)
- Import/export: Excel import parses compliance rows via SheetJS; Export Excel produces a workbook (exact sheet layout owned by `exportExcel()`, not reproduced line-by-line here — must preserve column order/naming since it's likely re-imported)

## 13. Parity notes
- This is the **most data-model-heavy** legacy tool in the vault: KPI templates, scoring math (weighted average, renormalization, banding), auto-suggestion rules, and the RACI/work-split editor are all bespoke business logic embedded directly in this file — any reskin must preserve `TEMPLATES`, `band()`, `monthScore()`, `suggest()`, and the lock/freeze semantics (review freezes on the 5th of the following month; appraisal requires all reviewed months locked before sign-off) exactly.
- Distinct from other legacy apps: uses `ADMIN_VIA` (`'platform'` vs `'password'`) as a two-tier admin model, and ties destructive actions to `needAdmin()` gates + `logAudit()` — reskin must not silently drop the audit trail or gating.
