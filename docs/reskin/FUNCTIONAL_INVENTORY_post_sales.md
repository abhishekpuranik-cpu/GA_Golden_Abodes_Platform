# Functional Inventory — Post Sales Operations (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `post_sales` (`APP_IDS.POST_SALES`)
**Vault entry:** `/app/post-sales` (redirect shim: `/post-sales/*` → `/app/post-sales*`)
**Shell:** `PostSalesLayout.jsx` — `PlatformShell` title **Post Sales Operations**, breadcrumb `Vault / Post Sales`
**Auth:** `RequireAuth appId={APP_IDS.POST_SALES}`
**Primary sources:** `client/src/pages/postsales/*`, `client/src/hooks/postsales/*`, `client/src/components/postsales/*`, `client/src/lib/postSalesApi.js`, `client/src/lib/postSalesTabs.js`, `client/src/data/postsales/*`, `client/src/App.jsx` (routes)

---

## 0. Shared shell & navigation

### Route / entry
- Layout route: `/app/post-sales/*` → `PostSalesLayout.jsx` (`RequireAuth appId={APP_IDS.POST_SALES}`)
- Legacy redirect: `/post-sales/*` → `PostSalesRedirect` → `/app/post-sales{tail}` (preserves search/hash)

### Interactive controls (exact labels)
| Control | Label / text |
|---|---|
| H1 | `GA Post Sales Operations` |
| Subline | `Your working app for sold units, collections, pipeline & allocation · {user.email}` |
| Nav tabs (`PS_NAV`) | `Dashboard`, `Allocation`, `My Tasks`, `Inventory`, `Units`, `Documents`, `Demands`, `Loans`, `Tickets`, `Milestones`, `Reports` |
| Vault link | `← Vault` |
| Ask AI | `VaultAskAi` — `appId="post_sales"`, `appLabel="Post Sales Operations"`, `exampleKey="post_sales"`, `buildContext={buildPostSalesAskContext}` |

### Tab → path map (`PS_NAV`, `client/src/lib/postSalesTabs.js`)
| Nav label | Path | Tab id | `end` |
|---|---|---|---|
| Dashboard | `/app/post-sales` | `ps_dashboard` | true |
| Allocation | `/app/post-sales/allocation` | `ps_allocation` | |
| My Tasks | `/app/post-sales/my-tasks` | `ps_my_tasks` | |
| Inventory | `/app/post-sales/inventory` | `ps_inventory` | |
| Units | `/app/post-sales/units` | `ps_units` | |
| Documents | `/app/post-sales/documents` | `ps_documents` | |
| Demands | `/app/post-sales/demands` | `ps_demands` | |
| Loans | `/app/post-sales/loans` | `ps_loans` | |
| Tickets | `/app/post-sales/tickets` | `ps_tickets` | |
| Milestones | `/app/post-sales/milestones` | `ps_milestones` | |
| Reports | `/app/post-sales/reports` | `ps_reports` | |

Note: nested route `units/:id` (Unit Pipeline detail) exists but has **no nav tab** — reached via links from Units, Dashboard, Allocation, Documents, Demands.

### Auto-sync banner (on layout mount)
- On mount, calls `authApi.session()` → sets `user`.
- Checks `sessionStorage.ps_sync_note` cache; if absent, calls `postSalesApi.getSyncPreferences()`.
  - If both `autoSyncUnitsOnLoad === false` and `autoSyncDemandsOnLoad === false`: banner note = *"Auto-sync paused — use Upload CRM data on Units for daily intake."*
  - Else calls `postSalesApi.bootstrap({ syncUnits, syncDemands })`.
    - If `r.skipped?.length`: note = *"Auto-sync paused ({skipped}). Import units manually or use Sync from Cashflow V1 on Units."*
    - Else: note built from `{units.updated} units linked from Cashflow V1` and `{demands.created+updated} collection rows refreshed`, joined by ` · `; default `Ready`.
  - On error: note = error message or `Sync skipped`.
- While syncing: banner `role="status"` text **"Syncing sold units & collections in the background…"**
- After sync (non-empty note): info card with note + links: *"Achieved dates: **Milestones** → Save & sync → Reports & Step 12. Collections: **Demands** — Cashflow V1 reads from here."*

### Secondary surfaces
- `VaultAskAi` floating assistant (bottom, all post-sales pages)

### Side effects
- `authApi.session()` on mount
- `postSalesApi.getSyncPreferences()` + conditional `postSalesApi.bootstrap()` on mount (writes `sessionStorage.ps_sync_note`)
- `invalidatePostSalesCache('units')`, `invalidatePostSalesCache('inv-filters')` after successful bootstrap sync

---

## 1. Dashboard (`/app/post-sales`, index)

**Component:** `Dashboard.jsx`. Uses `useInventoryFilters` (project/phase/building) + `useDashboard(query)`.

### Controls
| Control | Label |
|---|---|
| Filter bar | `PostSalesFilterBar` — Project / Phase / Building selects + Clear (shared across all tabs, see §11) |
| Loading / error / empty states | `Loading dashboard…`, error text, `No data` |

### Displayed data
- H2 **Operations & Cashflow Dashboard**, sub **"Practical view of collection health, forecast risk, and pipeline operations."**
- KPI grid (`ps-kpi-grid ps-dash-kpi`):
  - **Active units** — value `data.activeUnits`; sub `{totalUnits} total in scope`
  - **Agreement collected** — `fmt(cf.agreementReceived)`; sub `{collectPct}% of {fmt(cf.agreementDue)} due`
  - **Outstanding (today)** (danger tint) — `fmt(cf.totalOutstanding)`; sub `Agmt {fmt(cf.agreementPending)} + GST {fmt(cf.gstPending)}`
  - **Forecast pipeline** — `fmt(forecastTotal)`; sub `Clear {fmt(fb.clear)} · Risky {fmt(fb.risky)} · Delayed {fmt(fb.delayed)}`
  - **SLA breaches** — `data.slaBreaches` (danger tint if >0)
  - **Disbursement tasks** — `data.openDisbursementTasks` (warning tint if >0); sub `{delayedDisbursementTasks} delayed`
  - **Open tickets** — `data.openTickets` (warning tint if >0); sub `{ackBreachCount} ack · {resBreachCount} resolution SLA`
  - **Pending demands** — `data.pendingDemandCount`
- **Cashflow — agreement vs GST** card: Agreement due big number + progress bar (`collectPct`%) + "Received … · Pending …"; GST due big number + "Received … · Pending …"
- **Forecast risk mix** card: 3-segment risk bar (Clear/Risky/Delayed, colored, with tooltip amounts) + legend dots; empty state: *"No installment forecasts yet — set expected payments in Reports."*
- **Collection by project (pending)** card: horizontal bar per project — label `{project} ({units} units)`, bar width scaled to max pending, value `fmt(pending+gstPending)`; empty: *"No units in filter"*
- **Pipeline phase (in progress)** card: horizontal bar per phase (colored dot + label + count); empty: *"No active phases"*
- **Watch list — high priority collections** card (conditional, `highPriorityUnits.length>0`): rows `{project} · {unitNumber} — {clientName}`, priority badge (`red`=high/`amber`=other), `{fmt(pending)} pending`; row click → navigate to Reports
- **SLA breach units** card (conditional): rows `{project} · {unitNumber} — {customerName}` + breached step list `Step {n}`; row click → Unit Pipeline
- **Open tickets** card (conditional): rows `{project} · {unitNumber} #{ticketNumber}`, description (60 chars), `SLA` badge if ack/resolution breach

### Side effects
- `useDashboard(query)` fetch on filter change

---

## 2. Allocation (`/app/post-sales/allocation`)

**Component:** `WorkAllocation.jsx`. Password-gated (`postSalesApi.hasAllocationAdmin()` / `verifyAllocationAdmin`).

### Lock screen (when `!unlocked`)
- Heading **"Work allocation — admin access"**
- Copy: *"This tab is restricted. Enter the allocation admin password to manage work assignment and the activity catalog."*
- Field: **Admin password** (type password, required)
- Button: **Unlock** (busy label **"Checking…"**)
- Error text from `authError`

### Unlocked — header
- H2 **Work allocation**; sub **"Assign frontend (CX) and backend executives. Configure pipeline activities and Frontend/Backend tags."**
- Buttons: **Open Demands data →** (link to Demands), **Lock tab**
- Sub-tabs: **Work assignment**, **Activity catalog**

### Sub-tab: Work assignment
- KPI strip: **Units in view**, **Open CX tasks** (colored), **Open backend tasks** (colored), **CLP pending** (danger colored)
- `PostSalesFilterBar` + extra select **Work type**: `All work types` / `Frontend / CX (customer)` / `Backend (coordination)`
- **Bulk assign** card:
  - Copy: *"Applies to filtered units{ (N selected)}. Leave selection empty to use project / phase / building filters only."*
  - Select **Frontend / CX executive** (options from `cxTeam`, placeholder `— Select —`)
  - Select **Backend executive** (options from `backendTeam`)
  - Buttons: **Set CX executive**, **Set backend executive**, **Auto-assign open steps from executives**
  - Divider, then select **Assign open steps — work type** (`Frontend / CX` / `Backend`), select **Assignee** (`— Select person —` + team)
  - Button: **Assign open {cx|backend} steps**
  - Result message: `Assigned {assignedTo} to {stepsUpdated} open {backend|CX} step(s). Check My Tasks if you assigned yourself.` or `Updated {modified} unit(s).`
- Allocation board table columns: checkbox (select-all), **Unit** (+customer), **Project / location**, **CX exec**, **Backend exec**, **Open CX**, **Open backend**, **CLP due**, **Received**, **Pending**, row action **Pipeline** (link to unit)
- Empty state: *"No units match these filters."*

### Sub-tab: Activity catalog
- Table columns: **#**, **Activity**, **Phase**, **Role**, **Work type** (badge `Backend`/`Frontend / CX`), **SLA** (`{n} {unit}` or `Ack {ack}d / {res}d`), row action **Edit**
- Edit form (`Edit step {n}`): Name, Phase (select), Assigned role, Work type (select), SLA days, SLA unit, Trigger event, Checklist (textarea, one per line); buttons **Save activity** / **Cancel**
- **Add new activity** form: Step number (optional, "Auto" placeholder), Activity name*, Phase, Assigned role, Work type, SLA days, Trigger event, Checklist textarea; button **Add activity**
- Generic message banner (`message` state) shown above sub-tab content

### Side effects
- `postSalesApi.verifyAllocationAdmin(password)` / `clearAllocationAdmin()`
- `useAllocation(filters)` → `assignExecutives`, `assignSteps`, `autoAssign`
- `postSalesApi.getActivityCatalog()` / `updateActivityCatalogItem` / `addActivityCatalogItem`
- 401/permission errors containing "admin access" re-lock the tab (`setUnlocked(false)`)

---

## 3. My Tasks (`/app/post-sales/my-tasks`)

**Component:** `MyTasks.jsx`. Calendar-based personal task queue (`ActivityCalendarShell`).

### Controls
- Header: **My Tasks**; sub `Calendar view — click a task to edit or complete pipeline steps.{ · assignee}`
- Stat badges: `{total} open`, `{overdue} overdue` (if >0), `{dueToday} due today` (if >0), `{unscheduled} unscheduled` (if >0)
- Kind tabs: **All tasks** `(n)`, **CX** `(n)`, **Backend** `(n)`
- `PostSalesFilterBar` (project/phase/building)
- Calendar shell: month/day view toggle, Today button, day navigation, legend (**Overdue** red, **CX**, **Backend** colored dots)
- Day panel: heading = formatted date + count badge; task cards or *"No tasks on this date."*
- **Unscheduled** section (compact horizontal cards) when present
- `TaskEditDrawer` (edit task side panel) triggered by task click
- Toast messages (3.5s) for actions

### Displayed data / statuses
- Task title: `Step {n} · {unitNumber} · {stepName}` or `CLP · {unitNumber} · {milestoneName|stepName}`
- Task color: red if overdue, else task-kind color (CX/Backend)
- Empty state: *"No open tasks assigned to you in this filter. Assign executives on units or pick yourself on a pipeline step."*

### Side effects
- `useMyTasks(filters)`, `useAssignees()`
- Complete action: `postSalesApi.completeClpLetterTask(...)` (CLP) or `postSalesApi.updateStep(unitId, stepNumber, {status:'completed', by})`
- Drawer save: `postSalesApi.updateStep(...)`
- Toasts: `CLP letter activity complete.` / `Step {n} marked complete.` / `Task updated.` / error message (with `refresh()` fallback)

---

## 4. Inventory (Project · Phase · Building setup) (`/app/post-sales/inventory`)

**Component:** `InventorySetup.jsx` — hierarchical catalog editor mirrored with Cashflow V1.

### Controls
- Header: **Project · Phase · Building**; sub *"Same hierarchy as Cashflow V1 — add, rename, or remove entries. Filters across Post Sales use this catalog."*
- Buttons: **+ Add project**, **Import from V1**, **Push to V1**
- Add-project form (inline card): Project name* input, Entity select (`ENTITIES`), Location, First phase (optional), First building (optional); buttons **Add project** / **Cancel**
- Per-project row: expand chevron, name + `· {entity}{ · location} · {unitCount} unit(s)`; row actions **Edit**, **+ Phase**
- Project edit inline: name input, entity select; **Save** / **Cancel** / **Delete** (confirm dialog: `Delete project "{name}"?{ N unit(s) linked.}`)
- Per-phase row (nested): name + `· {unitCount} unit(s)`; actions **Edit**, **+ Building**; edit inline Save/Cancel/Delete (`Delete phase "{name}"?`)
- Per-building row: name + `({unitCount})`; **Edit** button; edit inline Save/Cancel/Delete (`Delete building "{name}"?`)
- Empty state: *"No projects in catalog yet. Add a project manually or import from Cashflow V1."*
- Footer note: *"Renaming updates linked sold units automatically. Delete is blocked while units are assigned — use force via API if needed. Import reads Cashflow V1 sold inventory + manual projects; Push writes hierarchy back to V1."*

### Side effects
- `postSalesApi.getInventoryCatalog()` on mount
- `addCatalogProject/Phase/Building`, `updateCatalogProject/Phase/Building`, `deleteCatalogProject/Phase/Building`
- `importCatalogFromV1()` → *"Imported hierarchy from Cashflow V1"*; `pushCatalogToV1()` → *"Pushed hierarchy to Cashflow V1"*

---

## 5. Units (`/app/post-sales/units`)

**Component:** `Units.jsx` — sold-unit roster + CRM sync.

### Controls
- Header **Sold Units**; V1 status line (conditional): `Cashflow V1: {v1SoldCount} sold · Post Sales: {postSalesCount} tracked · {linkedCount} linked`
- Button: **+ New unit** → `NewUnitModal`
- `CrmUnitUpload` widget (scope-aware) — "Upload CRM data" entry point
- `PostSalesFilterBar` + extra controls:
  - Status select: `All statuses` / `Active` / `Possession given` / `On hold` / `Cancelled`
  - **Show all units** button (only when `lastBatchId` set)
  - **Preview V1 sync** button
  - **Sync from Cashflow V1** button (busy: **Syncing…**)
  - **Clear all units** button (danger, busy: **Clearing…**) — confirm dialog: *"Delete ALL sold units and related data (customers, pipeline steps, demands, documents, loans, tickets)?\n\nCashflow V1 auto-sync will be turned OFF so units are not re-imported on refresh.\n\nThis cannot be undone."*
  - Live count: `{n} units · {n} with breaches`
- Post-import note (conditional): *"Showing units from last CRM import batch only. **Assign new units in Allocation →**"*
- Sync/purge message banner (`syncMsg`)
- Unit cards grid (`ps-unit-grid`): per card — `{project} · {unitNumber}` + badges (`{n} breach` red, `New import` green); customer name; `{phase} · {building} · {entity} · Step {n}/20`; pipeline dot strip (status per step, titled `Step {n}: {status}`); footer `Booked {date} · {fmt(totalCost)}`; per-card **Delete** button (top-right) → `DeleteUnitModal`
- Empty state: *"No units match these filters. Use **Upload CRM data** above (daily) or sync from Cashflow V1."*

### Side effects
- `postSalesApi.getV1InventoryStatus()` on mount
- `syncFromCashflowV1({project, dryRun})` — preview message: `Preview: {created} new, {updated} updates{ (project)}`; real message: `Synced from Cashflow V1: {created} created, {updated} updated{, N errors}`
- `purgeAllUnits()` — message: `Cleared: {units} units, {demands} demands, {pipelineSteps} pipeline steps. Auto-sync is off — upload CRM or sync when ready.`
- CRM import complete → message: `CRM import applied: {create} new · {update} updated · {unchanged} unchanged{ · N demands}{ · N errors}.`
- Delete unit → message: `Deleted {project} · {unitNumber} (pipeline, demands, documents removed).`

---

## 6. Unit Pipeline detail (`/app/post-sales/units/:id`)

**Component:** `UnitPipeline.jsx` — 20-step SOP tracker per sold unit (no nav tab; reached from Units/Dashboard/Allocation/Documents/Demands, optional `?step=` / `?milestone=` query).

### Header bar
- **← Back** (to Units)
- `{project} · {unitNumber}` chip; customer name chip; entity chip
- CX executive chip (bordered in CX color) — title "CX executive"
- Backend executive chip (bordered in backend color) — title "Backend executive"
- CRM executive chip (fallback, only if no CX/backend exec set)
- Funding badge: `Self-funded` / `Home loan`
- Payment plan badge (grey)
- Total cost chip
- SLA breach badge: `{n} SLA breach` (red, if >0)

### Step list (left column)
- Grouped by phase (`PHASES` colored headers)
- Per step row: numbered/✓ circle (status-colored), step name, work-type badge (short label), `OVERDUE` badge if breached/overdue

### Step detail panel (right)
- Title: `Step {n}: {stepName}`
- Work-type badge (`{shortLabel} · {label}`)
- SLA badge (if not completed): tone-colored (danger/warning/info) with `slaInfo.label`
- SLA bar: **SLA target**, **Due**, **Assignee** (if set), **Completed** (date + by, if set)
- Tab strip: **Checklist**, **Documents**, **SOP details**, **Escalation**, **Activity log**

#### Checklist tab
- Step 12 special-case: renders `ClpLetterQueue` (CLP letter task queue) instead of generic checklist
- Other steps: funding-type banner (if `fundingTypeSplit`) — `Self-funded flow` / `Home loan flow`
- Progress: `{done}/{total} complete` + progress bar
- Checklist items (checkboxes, strikethrough when done, disabled if step completed)
- Right panel: **Comments*** (textarea, required) + comment history (`{date} · {by}` + text) or *"No comments yet."*; **Next action** (textarea); **Next action date*** (date input); button **Save Comment and Date** (busy **Saving…**)
- **Assignee ({workType})**: select (suggested team + current value) + **Default** button + **Save** button

#### Documents tab
- Step 12: `ClpLetterQueue` in `docsMode`
- Others: helper copy *"Uploads here are stored in the same document vault as the Documents tab (linked by unit + step)."*
- **Upload all missing** button (multi-file) — error if none missing: *"All document types for this step already have files"*
- Per doc-type row: label, status badge (`{status}` green) or `missing` (grey), file count, file chip links, **Upload** / **Add more** button (busy `…`)
- Link: **View full document vault →**

#### SOP details tab
- Copy: *"Standard operating procedure for this pipeline step — reference only."*
- Definition list: Phase, Work type, Trigger, Default role, SLA target, Prerequisites (`Complete step(s) {n} before starting`, if any), Escalation (if any)
- SOP checklist (numbered list of reference items)

#### Escalation tab
- Current step escalation note (if any): `This step: {label}`
- **Escalation matrix** — list of `L{level} {label}` rows

#### Activity log tab
- `ActivityLogPanel` — title **Step activity log**, fetches `postSalesApi.getStepActivityLog(id, selected)`

### Footer actions (step not completed)
- Completion notes input (optional)
- Button **Mark complete** (auto-advances to next step unless step 12 or step 20)
- Button **Escalate** (danger)

### Footer actions (step completed)
- Button **Reopen step (In progress)**

### Side effects
- `useUnit`, `useSteps`, `useDocuments`, `useAssignees`
- `updateStep`, `toggleChecklist`, `addStepComment`, `uploadDocument`
- Errors surfaced via `actionError` banner

---

## 7. Documents (`/app/post-sales/documents`)

**Component:** `Documents.jsx` — cross-unit document vault browser.

### Controls
- Header **Document vault**; sub *"Same records as pipeline step uploads — grouped by SOP step. Upload from a unit pipeline step or here."*
- Button **+ Upload document** (disabled without selected unit)
- Left pane: unit search input (`Search unit, project, customer…`), unit list (click to select)
- Right pane: Smart search input (`Smart search — file name, doc type, step, milestone, checklist line, status…`)
  - Match count line: `{n} matches` / `No matches for "{query}"`
  - Search results card: rows with title/subtitle/type label, status badge, `Step {n}` badge, **Open** link
- Non-search view:
  - Status count badges (per status)
  - Link **Open unit pipeline →**
  - **Step 12 — CLP checklist attachments** card (conditional) — link **Step 12 →**, per-doc rows (milestone name, `Line {n}: {checklistItem}`, status badge, **Open** link)
  - Per doc-group card (`DOC_GROUPS`): group label + **Step {n} →** link; per doc-type row: label, status badge or `missing`, received date, file chips, **Upload**/**Add more** button
- Upload modal: Document type select, Label input, Files (multi, required), Status select (`Uploaded`/`Received`/`Verified`); **Save** / **Cancel**

### Side effects
- `postSalesApi.listUnitsLite()` on mount
- `useDocuments(unitId)`, `uploadDocument(file, meta)`

---

## 8. Demands (`/app/post-sales/demands`)

**Component:** `Demands.jsx` — collections / CLP milestone tracker.

### Controls
- Header **Demands & collections**; sub: *"Cumulative **as of today** — agreement due/received only for CLP stages (or instalments) with target date on or before today. GST due/received from the CRM GST column."*
- Buttons: **Upload Excel** / **Close upload** (toggle), **Import from Cashflow V1** (busy **Importing…**)
- Upload panel (conditional): copy listing expected columns `Project, Unit, Milestone, Due, Received (optional: Pending, CLP %, Due Date)`; file input
- `PostSalesFilterBar` + search input `Search unit, customer, milestone…`
- KPI grid: **Milestone rows** (+ `{n} units in view`), **Total due**, **Received** (+ progress bar + `{pct}% collected`), **Pending** (danger if >0)
- Status chip filters: **All** `(n)`, **Pending** `(n)`, **Partial** `(n)`, **Paid** `(n)`, **Overdue** `(n)`
- View tabs: **By unit**, **All milestones**
- Action message banner

### By-unit table
- Columns: expand chevron, **Unit** (+customer), **Location**, **Agreement due (today)**, **Agreement recd (today)**, **Agreement pending**, **GST due**, **GST recd**, **GST pending**, **Status** badge
- Expand row → sub-table per milestone: **Milestone**, **CLP %**, **Target date** (editable date input), **Agmt due/rcvd/pend**, **GST due/rcvd/pend**, **Status** badge, action **Rcvd** button (inline pay form: amount input + Save/Cancel) — plus separate GST row at bottom of sub-table
- Future-dated rows get `ps-clp-future-row` styling

### All-milestones table
- Columns: **Unit**, **Milestone** (+ `CLP {pct}%`), **Agmt due/rcvd/pend**, **GST due/rcvd/pend**, **Target** (editable date), **Status**, action **Update** (inline pay form)

### Empty state
*"No collection data matches your filters. Upload Excel, import from Cashflow V1, or clear filters."*

### Footer tip
*"Tip: use **By unit** for a customer overview; milestones run Token → Possession. Set **Actual date** when construction completes — a CLP letter task (step 12) is created automatically. Sold units · Allocation"*

### Side effects
- `useDemands(query)` → `updateDemand`, `refresh`
- `postSalesApi.uploadDemandsExcel(file)` → message `Upload done: {created} new, {updated} updated.`
- `postSalesApi.syncDemandsFromV1({project})` → message `Imported from Cashflow V1: {created} new, {updated} updated.`
- Inline milestone date edits call `updateDemand(id, {targetDate|dueDate, source:'milestone'})`

---

## 9. Loans (`/app/post-sales/loans`)

**Component:** `Loans.jsx` — per-unit home-loan / self-funded contribution tracker.

### Controls
- Header **Loan & funding tracker**
- Left pane: unit list with funding badge (`Self-funded` amber / `Home loan` blue)
- Home-loan view: **Home loan tracker** card, **Edit** button; 4-stage progress indicator (`applied` → `processing` → `valuation` → `sanctioned`, ✓ for past stages)
  - Edit form: Bank, RM name, RM phone, Loan amount, Stage select; **Save** / **Cancel**
  - Read view: `{bank} · RM: {rmName} ({rmPhone})`; `Sanction: {fmt} · Loan: {fmt}`; **Sanction letter** link (if present); **Disbursements** list (`Tranche {n}: {amount} — {date}`) or *"No disbursements recorded"*
  - Empty: *"No loan record — click Edit to add"*
- Self-funded view: **Own contribution schedule** table — Milestone, Amount, Due, Status badge, **Mark paid** button (per unpaid row); empty: *"No schedule — use Edit on a home loan unit or add via API"*

### Side effects
- `useUnitsLite`, `useLoans(unitId)` → `upsertLoan`

---

## 10. Tickets (`/app/post-sales/tickets`)

**Component:** `Tickets.jsx` — customer query/grievance/defect tracker.

### Controls
- Header **Customer tickets**; badges: `Ack breaches: {n}` (red), `Resolution breaches: {n}` (amber)
- Left filter buttons (vertical list): **All**, **Open**, **SLA breach**, **Query**, **Grievance**, **Defect**
- Ticket list rows: `{ticketNumber}` badge + `{type}` badge; `{project} · {unitNumber}`; description (truncated); `Ack breach` / `Res breach` badges
- Button **+ New ticket**
- Detail panel: ticket number heading; `{project} · {unitNumber} — {customerName}`; type + status badges
  - SLA breach warning card (conditional): copy from `ESCALATION_MATRIX.customer_grievance.label`
  - Description text
  - Meta card: Raised (date + by), Acknowledged, Resolved, Assigned (+ department), Defect type + DLP expiry (if defect)
  - SLA cards: **Ack SLA (24h)** (`Breached`/`OK`), **Resolution SLA (7d)** (`Breached`/`OK`)
  - Action buttons: **Mark acknowledged**, **In progress**, **Mark resolved**, **Escalate** (danger); **Assign to…** select (`Priya Sharma` / `Ankit Desai` / `Neha Patil`)
- New-ticket modal: Unit select (required), Type select (`Query`/`Grievance`/`Defect`), Category select (`payment`/`documentation`/`construction`/`legal`/`other`), Defect type select (conditional, `structural`/`finishing`/`services`), Description* (textarea), Raised by, Channel select (`call`/`email`/`whatsapp`/`helpdesk`); button **Create ticket**
- Empty detail state: *"Select a ticket"*

### Side effects
- `useTickets(params)` → `createTicket`, `updateTicket`, `refresh`
- `postSalesApi.getTicket(id)` on select

---

## 11. Milestones (`/app/post-sales/milestones`)

**Component:** `Milestones.jsx` — per-project CLP milestone schedule editor.

### Controls
- Header **CLP Milestone Schedule**; sub: *"Enter **Achieved Date**, then **Save & sync** — only changed dates are pushed to units in **Reports**. Use phase/building filters to sync a subset faster."*
- Buttons: **Template** (download), **Upload Excel** (hidden file input), **Sync to units** (busy label = `syncLabel`, e.g. `Syncing to units…`), **Save & sync** (primary, busy label e.g. `Saving schedule…`)
- `PostSalesFilterBar` (project required to load)
- Scope line: `Sync scope: {project · phase · building}{ (filtered — faster sync) | (all units — use filters on large projects)}`
- Sync warnings card (conditional): `Sync warnings ({n})` + list (first 8) + `…and {n} more. Try syncing one building at a time.`
- Schedule table columns: **Milestone** (text input), **Percent % Due** (number), **Construction-linked?** (Y/N select), **Target Date** (date), **Achieved Date** (date, title: "Save & sync pushes only changed achieved dates to Reports and Step 12"), row delete (**✕**)
- Button **+ Add milestone**
- Empty state: *"Select a project to manage its CLP schedule."*
- Toast messages built from sync summary: `{n} milestone(s)`, `{n} unit(s) in Reports`, `{n} Step 12 update(s)`, `{n} unit(s) in scope`, `{n} warning(s)`; fallback `No achieved dates to sync.`

### Side effects
- `postSalesApi.getClpSchedule(project)`, `saveClpSchedule(...)`, `syncClpAchievedDates(...)`, `uploadClpScheduleExcel(...)`, `downloadClpScheduleTemplate()`
- Friendly error mapping: timeout → *"Sync timed out — try filtering to one phase or building, then sync again."*; duplicate key → *"Duplicate milestone record — contact support or retry after opening Step 12 on the unit once."*; network → *"Network error — check connection and retry."*

---

## 12. Reports (`/app/post-sales/reports`)

**Component:** `Reports.jsx` — collection register + weekly disbursement forecast.

### Controls
- Header **Reports**; sub: *"Collection register with milestone payment forecasts · expected dates linked to **Milestones → Achieved Date** · rolls up to weekly disbursement view (Clear / Risky / Delayed).{ · As of {asOf}}"*
- View tabs: **Collection register**, **Disbursement forecast**
- Buttons: **Template**, **Download Excel**, **Upload Excel** (hidden file input)
- `PostSalesFilterBar` + view-specific extras:
  - Register: search input `Search unit, client…`; priority select (`All priorities`/`High priority`/`Watch list`/`Normal`)
  - Disbursement: **From** / **To** date inputs; category select (`All categories`/`Clear`/`Risky`/`Delayed`)

### Collection register view
- KPI grid: **Units**, **Total due**, **Received** (success color), **Pending (today)** (danger), **GST pending**
- Table columns: Unit, Client (+ priority badge if not normal), Project, Booking date, Agreement date, Area sq.ft, Agmt value, Total due, Received, Pending (as of today), GST due, GST recd, GST pend, Expected payments (`{amount} · {date}` or "Set forecast" + `{n} inst.`), Remarks (click-to-view modal)
- Row click toggles inline expand → `ReportsForecastEditor` with meta chips: `Plan: {paymentPlan}`, `CX: {cxExecutive}`, `Last pay: {date}`, `{pct}% collected`
- Footer totals row: **Page totals ({n} units)** + due/received/pending/GST sums

### Disbursement forecast view
- Nested tree table: Week (expand) → Date (expand) → client rows
  - Columns: Week/Date, **Clear**, **Risky**, **Delayed**, **Total Pending**, **Total Received**
  - Client rows: unit link, client name, milestone name; pending rows show category + amount; received rows show green **Received** badge
  - Grand Total row
  - Empty: *"No forecast or receipts in the selected date range. Add expected payments in the Collection register."*
  - Filter note: `Showing category: {category}` when category filter active

### Side effects
- `useCollectionRegister(registerFilters)`, `useDisbursementForecast(disbFilters, {enabled: view==='disbursement'})`
- `saveForecast(unitId, body)` → toast **"Forecast saved — disbursement view updated."**
- `postSalesApi.downloadCollectionRegisterExcel(...)`, `downloadReportsTemplate()`, `uploadReportsExcel(file)` → toast `Imported {n} unit(s).` or server message

---

## 13. Shared component: `PostSalesFilterBar`

Used on Dashboard, Allocation, My Tasks, Units, Demands, Milestones, Reports (not Documents/Loans/Tickets/Inventory, which use their own unit-search UI).
- Project select, Phase multi/select, Building select, **Clear** action, plus each page's `extra` slot controls (documented per-page above).

## 14. Cross-app data contracts (parity-critical)

- Sync source of truth: **Cashflow V1** sold units + collections (`postSalesApi.syncFromCashflowV1`, `syncDemandsFromV1`, `getV1InventoryStatus`, catalog import/push `importCatalogFromV1`/`pushCatalogToV1`).
- 20-step pipeline definition: `client/src/data/postsales/steps.js` (`STEPS`, `PHASES`, `ESCALATION_MATRIX`, `ENTITIES`).
- Task kind split: `client/src/data/postsales/taskKinds.js` (`TASK_KINDS.cx` / `.backend`, colors, short labels, `getStepTaskKind`, `defaultAssigneeForKind`).
- Document taxonomy: `client/src/data/postsales/stepDocs.js` (`DOC_GROUPS`, `TYPE_LABELS`, `docTypesForStep`, `primaryStepForDocType`).
- Step 12 (CLP letters) has bespoke UI (`ClpLetterQueue`) reused across Checklist tab, Documents tab, and referenced from Demands/Milestones — treat as its own parity-critical sub-flow in Phase 2.
- Allocation admin password gate is a **separate** password from Cashflow V1 finance-tab gate — do not conflate during reskin.
