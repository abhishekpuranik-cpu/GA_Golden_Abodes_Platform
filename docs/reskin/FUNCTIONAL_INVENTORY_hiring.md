# Functional Inventory — Hiring & Sourcing (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `hiring` (`APP_IDS.HIRING`)
**Vault entry:** `/app/hiring` (redirect shim: `/hiring/*` → `/app/hiring*`)
**Shell:** `HiringLayout.jsx` — `PlatformShell` title **Hiring & Sourcing**, breadcrumb `Vault / Hiring`
**Auth:** `RequireAuth appId={APP_IDS.HIRING}`
**Primary sources:** `client/src/pages/hiring/*`, `client/src/lib/hiringApi.js`, `client/src/lib/hiringTabs.js`, `client/src/lib/hiring/*`, `client/src/components/hiring/*`, `client/src/App.jsx` (routes)

---

## 0. Shared shell & navigation

### Route / entry
- Layout route: `/app/hiring/*` → `HiringLayout.jsx`
- Legacy redirect: `/hiring/*` → `HiringRedirect` → `/app/hiring{tail}`

### Interactive controls (exact labels)
| Control | Label / text |
|---|---|
| H1 | `GA Hiring & Sourcing` |
| Subline | `{user.email} · Sourcing: {Metaview\|Manual import}` (from `hiringApi.health()`, `sourcingMode`) |
| Nav tabs (`HIRING_NAV`) | `Requisitions`, `Interviews`, `CTC Generator`, `Dashboard` |
| Vault link | `← Vault` |
| Ask AI | `VaultAskAi` — `appId="hiring"`, `appLabel="Hiring & Sourcing"`, `exampleKey="hiring"` |

### Tab → path map (`HIRING_NAV`, `client/src/lib/hiringTabs.js`)
| Nav label | Path | `end` |
|---|---|---|
| Requisitions | `/app/hiring` | true |
| Interviews | `/app/hiring/interviews` | |
| CTC Generator | `/app/hiring/ctc` | |
| Dashboard | `/app/hiring/dashboard` | |

Nested routes with no top-level nav entry: `req/:id` (Requisition detail), `req/:id/candidate/:cid` (Candidate profile), `dashboard/requirements`, `dashboard/activity` (sub-tabs under Dashboard, see §6).

### `canWrite` gate (client-side, per `HiringLayout`)
`true` if user has role `admin`/`hiring_manager`, OR permission `manage_security`, OR `allowedApps` includes `hiring`. Gates all mutation buttons across pages (visible read-only otherwise).

### Side effects
- `authApi.session()` and `hiringApi.health()` on mount (health failure falls back to `{sourcingMode:'manual'}`)

---

## 1. Requisitions / Board (`/app/hiring`, index)

**Component:** `RequisitionBoard.jsx`.

### Controls
- Status filter select: **Open positions** (default) / **All statuses** / individual: `Draft`, `Sourcing`, `Shortlisting`, `Interviewing`, `Offer`, `Hiring Fulfilled`, `Closed`, `Cancelled`
- Button **+ New requisition** (canWrite only)
- Loading text: **"Loading positions…"**
- Empty state: title `No open positions` (filter=open) or `No requisitions yet`; hint *"Create a requisition to start sourcing candidates."*; action **+ New requisition**
- Board meta line: `{n} position(s)`
- Table columns: **Position** (code link, role, `{entityTag}{ · band}`), **Where** (project/`—`, location), **Fill** (`{hired}/{headcount}` + `{n} candidates`), **Stage** (status pill + `{daysInCurrentStage}d in stage · {daysOpen}d open`), **Requested by**, **Approved by** — row click navigates to detail
- New-requisition modal: Entity tag (`EntityTagSelect`), Role* input, Department, Project, Location select (`Pune (PCMC)` / `Mumbai` / `Goa`), Band min/max (₹/year, `MoneyInput`), Experience min–max (years), Headcount (number, min 1), Requested by, Approved by, Job description file (`.pdf,.doc,.docx,.txt`), Hiring request email file (`.eml,.msg,.txt,.html,.htm`), Job brief* (textarea, sent to Metaview); buttons **Create** / **Cancel**

### Side effects
- `hiringApi.requirementsReport(params)` on filter change (client-side filters to `OPEN_STATUSES` when filter=`open`)
- `hiringApi.createRequisition(form, {jd, email})` → navigates to `/app/hiring/req/{id}`

---

## 2. Requisition detail (`/app/hiring/req/:id`)

**Component:** `RequisitionDetail.jsx`.

### Header card
- Breadcrumb: **← Requisitions**
- Badges: `{reqCode}`, `{status}` (gold), conditional `Headcount filled — mark as fulfilled` (amber, when `promptClosure` true and not yet fulfilled), conditional `Hiring Fulfilled` (gold)
- `{role}` heading; `{location} · {entityTag} · {formatLpaBand}`
- `{department} · {projectName}` line (if either present)
- `Requested by {requestedBy} · Approved by {approvedBy}` line (if either present)
- Brief text (`white-space: pre-wrap`)
- `Hired {filledHeadcount}/{headcount}`
- Attachments line: links per attachment `{JD|Email} — {filename}` → `hiringApi.attachmentUrl(id, kind)`
- Metaview banner (conditional, `metaviewSearchId` set): *"Metaview search active · Sync pulls candidates matched to this job description{ (agent may take 5–15 min for new searches)}"*

### Toolbar (canWrite)
- **Edit requirements** → `RequisitionEditForm`
- **+ Add candidate** → modal
- **Import CSV/XLSX** → `ImportDrawer`
- **Agencies shared** / **Hide agencies** (toggle)
- **Launch Metaview** (gold, only if `sourcingAuto` and no `metaviewSearchId` yet; busy: **Launching…**)
- **Sync Metaview** (only if `sourcingAuto` or `metaviewSearchId` set; disabled until search exists; busy: **Syncing…**)
- **Mark Hiring Fulfilled** (gold, only if `canMarkFulfilled` and status ≠ Cancelled; busy: **Updating…**) — confirm: *"Mark this position as Hiring Fulfilled?"*
- **Scrap position** (red outline, hidden once Cancelled/Closed/Hiring Fulfilled; busy: **Scrapping…**) — confirm: *"Scrap this position? It will be marked Cancelled and stay in history (not deleted)."*; if blocked by open Sent offers, second confirm to **force scrap**
- **Delete** (grey outline; busy inherits) — confirm: *"Delete this position from the board? It will be soft-deleted (recoverable in DB)."* → navigates back to board
- **Open in Metaview ↗** (gold, if search/URL known) else **Metaview home ↗** (outline, title "No search linked yet — opens Metaview Sourcing home")
- Status message line (`msg`, tone success/error/info)

### Agencies panel (toggle)
- Heading **"Agencies this posting was shared with"**; copy *"Track external agencies that received this JD. Candidates they submit join the same pipeline."*
- List: `{name} · {contact} · shared {date}`; empty: *"No agencies recorded yet."*
- Add-agency form (canWrite): Agency name* input, Contact input, button **Add agency** (busy: **Saving…**)

### Pipeline (Kanban)
- Heading **Pipeline**
- Empty state: *"No candidates"*, hint *"Add agency / referral candidates, import CSV, or Launch Metaview + Sync."*
- Columns per stage 1–9 (`STAGE_LABELS`: `Sourced`, `Screened`, `Shortlisted`, `Interview R1`, `Interview R2`, `Offer`, `Hired`, `Rejected`, `Dropped`) — column header `{label} ({count})`
- Candidate chip: name, email (`mailto:` link or "No email"), phone (`tel:` link or "No phone"), source line (`Agency · {agencyName}` or plain `source`); click → candidate profile

### Add-candidate modal
- Copy: *"Agency submissions enter the same sourcing → hire pipeline as Metaview / portal imports."*
- Fields: Name* , Entity tag select (`PAD`/`NBD`/`NP`/`GV`/`GAPL`/`Suryakiran`), Source select (`agency`→"External agency"/`referral`/`naukri`/`linkedin`/`walk-in`/`other`), conditional agency fields (Agency name* with datalist of prior agencies, Agency contact, Agency email, Agency notes) when source=agency, Current company, Email, Phone; button **Save to pipeline**

### Side effects
- `hiringApi.getRequisition(id)` + `listCandidates({requisitionId})` on load
- `syncRequisition(id)` → msg `Synced — {upserted} new ({total} in Metaview){ · Agent: {phase}}`
- `sourceRequisition(id)` → msg from server or default `Metaview search started. Sync periodically to import candidates.` / `Metaview search already active — use Sync to pull candidates.`
- `updateRequisition(id, body)` → msg `Requirements saved and sent to Metaview for refine.` or `Requirements saved.`
- `deleteRequisition(id, {mode:'scrap'|'delete', force, reason})`, `fulfillRequisition(id)`
- `createCandidate(...)` → msg `Candidate added to pipeline`

---

## 3. Candidate profile (`/app/hiring/req/:id/candidate/:cid`)

**Component:** `CandidateProfile.jsx`.

### Controls
- Breadcrumb: **← {reqCode|Requisition}**
- Toolbar (canWrite, if `metaviewCandidateId`): **Refresh Metaview profile** (busy: **Refreshing…**), **LinkedIn ↗** link (if `linkedinUrl`)
- `CandidateProfileView` (candidate/profile/requisition data display — separate component, not re-inventoried line-by-line here; treat as a data-driven read view)
- **Actions** card (canWrite): Note input (`Screening note…`); `VerdictButtons` (verdict selection); buttons **Advance stage**, **Reject** (outline), **Dropped** (outline)
- **Feedback history** card: reverse-chronological list `{verdict} · {note}{ (pending Metaview sync)}`; empty: *"No feedback yet."*
- **Interviews** card: rows `Round {round} · {outcome} · {scheduledAt|'TBD'}{ — {panel joined}}`; schedule form (canWrite): Round (number), Panel (comma-separated), Scheduled at (datetime-local); button **Schedule**
- **Offer** card:
  - If offer exists: `{formatINR(fixedCtcPaise)} · {designationOffered} · {status}`; action buttons by status: Draft→**Mark Sent**; Sent→**Accepted** (gold) / **Declined** (outline)
  - Else if canWrite: create-offer form — `MoneyInput` **Fixed CTC (₹/year)**, Designation input; button **Create draft offer**
  - Else: *"No offer yet."*

### Side effects
- `hiringApi.getCandidate(cid)` on load
- `refreshCandidateProfile(cid)`, `updateStage(cid, {toStage})` (advance = +1, reject = stage 8, dropped = stage 9), `addFeedback(cid, {verdict, note})`, `createOffer(...)`, `updateOffer(offerId, {status})`, `scheduleInterview(...)`

---

## 4. Interviews (`/app/hiring/interviews`)

**Component:** `InterviewCalendar.jsx` — reuses `ActivityCalendarShell` from Post Sales.

### Controls
- Heading **Interview calendar**
- Empty state: *"No scheduled interviews"*, hint *"Schedule interviews from a candidate profile."*
- Calendar shell: month/day view, Today, day nav; legend: **Interview** (purple dot)
- Task title format: `R{round} · {candidateName}`; color by outcome: `Advance`=green, `Reject`=red, `Hold`=amber, else purple
- Selected-interview card: candidate name, `Round {round} · {mode}`, scheduled datetime or `TBD`, panel list; action buttons (canWrite, only if outcome=Pending): **Advance** (gold), **Reject** (outline), **Hold** (outline)
- Day list (when no single interview selected): cards per interview for the day
- Footer link: **← Back to requisitions**

### Side effects
- `hiringApi.listInterviews()` on load
- `updateInterview(id, {outcome})` → msg `Interview marked {outcome}`

---

## 5. CTC Generator (`/app/hiring/ctc`)

**Component:** `CtcGenerator.jsx` — client-local calculator (`localStorage`-persisted structure via `ctcStructure.js`; **no server writes**).

### Controls
- Heading **CTC Generator**; sub *"Calculate offer CTC from an editable structure ({structure.name}). Rules are subjective — change % / amounts to match HR policy."*
- Input mode select: **Annual CTC (₹)** / **Monthly CTC (₹)** (auto-converts value on switch)
- Target CTC number input
- Buttons: **Edit structure** / **Hide structure editor** (toggle), **Reset structure** (confirm: *"Reset CTC structure to GA default?"*), **Copy summary** (clipboard), **Download CSV**
- Status message line
- Stat row: **Target annual CTC**, **Total monthly**, **Fixed cash / year**, **Variance vs target** (green if 0, else amber)
- Structure editor (toggle): Structure name input, Notes textarea, **+ Add component** button, table (Label, Group, Rule select [`MODE_OPTIONS`], %/Amount input, In CTC checkbox, remove **×**); tip text about keeping one Balancing line
- Breakdown table: grouped by `group`, rows (Component, Rule description, Monthly, Annual), footer **Total CTC** row

### Side effects (all local)
- `loadCtcStructure()` / `saveCtcStructure()` / `resetCtcStructure()` (localStorage)
- CSV export via client-side Blob download (`GA_CTC_{annualCtc}_{date}.csv`)
- `navigator.clipboard.writeText(...)` for Copy summary

---

## 6. Dashboard (`/app/hiring/dashboard`)

**Component:** `HiringDashboardLayout.jsx` — heading **"Hiring dashboard"** + sub-nav (`DASH_TABS`): **KPIs** (index), **Requirements**, **Activity log**. `<Outlet/>` renders the active sub-tab.

### 6a. KPIs (`/app/hiring/dashboard`, index) — `HiringKpisTab.jsx`
- Filter bar: Entity / Location / Project / Department selects (dynamic options from `filterOptions`), Status select (8 statuses); button **Clear filters**; note *"KPIs refresh every 60s · last load just now"* (auto-reload every 60s via `setInterval`)
- Stat row: **Open requisitions**, **Hiring fulfilled**, **Hired / headcount** (`{totalHired}/{totalHeadcount}`), **Fill rate** (%), **Active candidates**, **Upcoming interviews**, **Shortlisted → Hired** (%), **Hired of shortlisted (screening)** (`{hiredFromShortlist}/{shortlistedEver}`), **Offers accepted**, **Offer conversion** (%)
- **Time in stage (avg days)** card: per-stage `{avgDays} {label} ({count})`
- **Source mix** card: list `{source}: {count}`; empty: *"No candidates in filter scope."*
- **Funnel by requisition** card: per-requisition block — `{reqCode} — {role}` (link), `{location} · {projectName} · {entityTag}`, `Hired {hired}/{headcount} · Status {status}` + `Fulfilled` badge if applicable; empty: *"No requisitions match filters."*

### 6b. Requirements (`/app/hiring/dashboard/requirements`) — `HiringRequirementsTab.jsx`
- Button **Download Excel** (busy: **Exporting…**) → `hiringApi.downloadRequirementsExport(params)`
- Filter bar: Entity, Location, Project, Department (text inputs), Status select; button **Clear**
- Table columns: Position # (link), Role, Project, Location, Entity, Band, HC, Hired, Opened, Status (badge), Requested by, Approved by, Fulfilled, Days open, Days in stage, Stage movements
- Empty row: *"No requirements match filters."*

### 6c. Activity log (`/app/hiring/dashboard/activity`) — `HiringActivityLogTab.jsx`
- Button **Download Excel** (busy: **Exporting…**) → `hiringApi.downloadActivityExport(params)`; count label `{total} activities`
- Filter bar: Entity type select (`requisition`/`candidate`/`offer`/`interview`), Action text input, From/To date inputs
- Table columns: When, Type, Context, Action, Detail, By; empty row: *"No activities."*
- Pagination (50/page): **Previous** / `Page {n} of {pages}` / **Next**

### Side effects
- `hiringApi.dashboard(params)` (60s polling), `requirementsReport(params)`, `activityLog(params)`

---

## 7. Cross-app data contracts (parity-critical)

- Candidate pipeline stages 1–9 (`STAGE_LABELS`, `client/src/lib/hiring/formatINR.js`): `Sourced` · `Screened` · `Shortlisted` · `Interview R1` · `Interview R2` · `Offer` · `Hired` · `Rejected` · `Dropped`.
- Entity tags (`ENTITY_TAGS`): `PAD` · `NBD` · `NP` · `GV` · `GAPL` · `Suryakiran`.
- Requisition statuses: `Draft` · `Sourcing` · `Shortlisting` · `Interviewing` · `Offer` · `Hiring Fulfilled` · `Closed` · `Cancelled` (open = first 5).
- Offer statuses: `Draft` → `Sent` → `Accepted`/`Declined`.
- Interview outcomes: `Pending` · `Advance` · `Reject` · `Hold`.
- Sourcing mode is server-driven (`hiringApi.health().sourcingMode`: `auto` = Metaview integration active, `manual` = manual import only) — gates Launch/Sync Metaview buttons.
- CTC Generator structure is **local-only** (no backend persistence) — reskin must preserve localStorage key compatibility (`ctcStructure.js`) or explicitly call out migration.
