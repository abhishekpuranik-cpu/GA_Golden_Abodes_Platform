# Functional Inventory — Pre-Construction (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID (vault module):** `preconstruction`
**Vault tile:** "Pre-Construction" — *"Approvals, Gantt and PCMC regulatory tracker."* (icon 📋, glyph `PC`, group `construction`, status `LIVE`, `external: true`)
**Vault path:** `/preconstruction/` (opens in **new tab** — `VAULT_LINK_PROPS = target:_blank, rel:noopener noreferrer`)
**Nature:** standalone sibling repo — **separately built & deployed React SPA**, not part of the platform's own router. No react-router; a single `App.jsx` with `useReducer` state drives all views by string `curView`/`subTab`/`modal` state.
**Repo:** `GA_PreConstruction_React/` (Vite + React, package name not platform-scoped)
**Primary sources:** `GA_PreConstruction_React/src/App.jsx` (~2850 lines, contains `Dashboard`, `GanttView`, `RegView`, `TasksView`, modals, reducer), `ProjectPageShell.jsx`, `MyWorkView.jsx`, `BulkAllocateView.jsx`, `DashboardCalendarView.jsx`, `DashboardReportsView.jsx`, `AnalyticsAskView.jsx`, `PortfolioRagMatrix.jsx`, `mongoSync.jsx`, plus ~30 `precon*.js` domain helper modules (compliance, import/export, notify, permissions, analytics, activity log, etc.)
**Vault wiring reference:** `GA_Golden_Abodes_Platform/client/src/pages/VaultHome.jsx` (`normalizePreconstructionUrl`, `bundledPreconstructionUrl`, `PRE_URL_LS_KEY = 'ga_preconstruction_url'`, `VAULT_PRE_VERSION`, admin override control **"Set PreConstruction URL"**)

---

## 0. Vault wiring (parity-critical — owned by the platform, not this repo)

- `VaultHome.jsx` resolves the PreConstruction URL in priority order: env `VITE_PRECONSTRUCTION_URL` → `localStorage['ga_preconstruction_url']` → bundled path `{origin}/preconstruction/` → `DEFAULT_PRECONSTRUCTION_URL` (empty).
- `normalizePreconstructionUrl`: if the resolved URL is same-origin but not already under `/preconstruction`, it is rewritten to `{origin}/preconstruction/` (keeps admins from accidentally pointing at a non-bundled same-host path).
- A version query param is appended (`VAULT_PRE_VERSION`, currently `20260720-force11e`) to bust cache on deploy.
- Admin control on Vault home: button **"Set PreConstruction URL"** (prompts / stores override in `localStorage['ga_preconstruction_url']`); reflected in the admin URL-override table (`v.preconstructionUrl`).
- This app renders itself entirely client-side after the browser navigates to `/preconstruction/` — no server-rendered auth handoff is documented here; treat SSO/session parity as an open question for Phase 2 investigation, not assumed.

---

## 1. App shell (all views)

### Top nav (`<nav className="tnav">`)
- Brand: **"GA"** logo mark + **"Command Centre"** / **"Pre-Construction"** (uppercase sub-label)
- Mobile menu toggle button: **Menu** / **Close**
- **◎ My Work** button (nav tab, switches `curView` to `"mywork"`)
- `ProjectNavPicker` — project selector dropdown/picker (values: `dashboard`, `mywork`, each project id, `__add` sentinel to open Add-project modal)
- Action group 1: **Departments** (opens Department Heads modal, title *"Edit department heads (Design, Acquisition, Execution)"*), **+ Add project**, **Import JSON** (file input, `.json`), **Import Excel** (file input `.xlsx,.xls`, disabled while Mongo sync is `loading`; title text differs when a project is open: *"Merge tasks into "{name}" (Project column must match). Wait until Mongo shows ✓ before importing."* vs all-projects variant)
- Action group 2: **Export dump** (title: "Excel — current stored fields"), **Export report** (title: "Excel — computed dates, status, comments"), **Export JSON** (full workspace JSON download, filename `GA_PreConstruction_{isoDate}.json`)
- Nav status hint (`navHint`) — transient toast-style status text
- Mongo sync status badge (`CLOUD_LABELS[cloudStatus]`) — states include `loading`/`saving`/etc.
- **↻ Reload** button (reload workspace from MongoDB; disabled while loading)
- **Save** button (flush to server; disabled while loading/saving) → on success toast *"Saved to server — teammates can ↻ Reload to see comments & tasks"*

### Global side effects
- `MongoSyncAdapter` component manages cloud sync (load/save/status) for the whole reducer state
- Delete-project flow sets a pending flag then triggers `mongoFlushRef.current()` once state settles
- JSON import: `FileReader` → `parseJsonState` → `dispatch({type:'loadState'})` → toast *"Workspace imported from JSON"* (or error message)
- Excel import: blocked while cloud sync is loading (toast *"Wait for Mongo sync to finish, then import again"*); otherwise scoped to current project if one is open; toast `Excel imported{ into scope}: {tasksUpdated} updated, {tasksAdded} new{, N rows skipped}`

### Top-level views (`curView`)
| `curView` value | Renders |
|---|---|
| `dashboard` (default) | `Dashboard` component |
| `mywork` | `MyWorkView` |
| `{projectId}` | `ProjectPageShell` + active project sub-tab |
| (unmatched) | Fallback text **"View not found"** |

---

## 2. Dashboard (`curView === "dashboard"`)

**Component:** `Dashboard()` (inline in `App.jsx`). Sub-tabs (`dashTab` state, buttons `role="tab"`): **Ask AI**, **Overview** (default), **Work Calendar**, **Reports**.

### 2a. Ask AI tab
- Renders `AnalyticsAskView` — natural-language analytics Q&A over portfolio data (chart-capable answers via `askCharts.js` / `AskAnswerVisuals.jsx`). Treat as its own AI sub-feature; not enumerated field-by-field here.

### 2b. Overview tab (default)
- `PortfolioRagMatrix` — RAG (red/amber/green) status matrix across projects/departments, click-through to project
- KPI card row: **Total Tasks**, **Completed** (+ `{pct}% overall` sub), **In Progress**, **Overdue** (+ "Needs attention"/"All on track" sub), **Projects** (count)
- Project card grid: per project — progress ring (%), name, `{loc} · {floors}F{ · Kickoff {date}}`, mini stats (`✓{completed}`, `{n} active`, `{n} late`), next up-task preview (`↳ {task name}`), **Edit** / **Delete** buttons (delete gated by `canDeleteProjects`); empty state: *"No projects match "{search}"."* / *"No projects yet — add one to get started."*
- `ActionFilters` toolbar: **Horizon days** control, status filter chips, **Assignee** filter, **Department** filter, **Role** filter
- Charts row: **Status Breakdown** (pie chart, legend `{status}: {count}`), **Phase Progress — Golden HQ** (bar chart, % complete per phase)
- **Upcoming Actions (next {horizonDays} days)** list — dot colored by status, task name, `{project} · {who} · {due phrasing} · End {date}`, status badge; empty: *"No actions match filters in the next {horizonDays} days"*
- **⚠ Issues & Bottlenecks** list (overdue/blocked items, capped at 5)

### 2c. Work Calendar tab
- `DashboardCalendarView` — portfolio-wide activity calendar (reuses `ActivityCalendarShell`, same shell as Post Sales/Hiring calendars)

### 2d. Reports tab
- `DashboardReportsView` — activity-log-driven reporting surface (consumes `state.activityLog`)

---

## 3. My Work (`curView === "mywork"`)

**Component:** `MyWorkView.jsx` — personal cross-project workboard, calendar-based.

### Controls
- Hero: eyebrow **"Personal workboard"**, H1 **"My Work"**, sub *"Calendar view by next-action date and activity due date. Click a task to edit comments."*
- Stat chips: **Overdue**, **Due today**, **This week**, **Open**
- Toolbar:
  - **Person** select (roster of assignees; current user tagged `(you)`)
  - **Status** — `StatusFilterChips`
  - **Show work** fieldset (checkboxes): **Assigned to me**, **My comments**, **My department**
  - **Projects** — collapsible chip multi-select (`All` / `None` shortcuts) when >1 project
  - **Hide completed** checkbox
  - `MyWorkLevelFilters` — view-level (e.g. overall/department) + department filter with per-department summaries
- Empty states: *"Sign in via the platform vault to load your name, or pick a person above."* / *'Select at least one filter under "Show work".'*
- `ActivityCalendarShell` (month/day view) — task title `{task} · {project}{ · {deptShort}}`, color = due-heat (`dueHeatColor`)
- Day panel: `{date} · {n} task(s)`; list or *"No tasks on this date. Pick another day or adjust filters."*
- Clicking a task opens comment/detail interaction (`setActiveItem`)

---

## 4. Project page (`curView === {projectId}`)

**Shell:** `ProjectPageShell.jsx` — hero + 4 tabs (`activeTab`/`subTab` state per project).

### Hero
- Tags: status (default **"Pre-Construction"**), type, location (if set)
- Title: project name
- Sub: `{floors} floors · {totalTasks} tasks across {n} phases`
- **Kickoff date** field (date input) — hint: *"Updates planned dates for all scheduled tasks"*
- Progress ring (%) + stat grid: **Done**, **Active**, **Overdue**, **Upcoming**
- Footer hint: *"Pre-construction command centre for this project"*
- Actions: **+ Phase**, **Edit project**, **Delete** (danger, gated by `canDeleteProjects`)

### Tabs (`TABS`, `ProjectPageShell.jsx`)
| Tab id | Label |
|---|---|
| `tasks` | Tasks & schedule |
| `allocate` | Bulk allocate |
| `gantt` | Gantt |
| `regs` | Regulatory |

### 4a. Tasks & schedule (`TasksView`)
- Filters: **Assignee**, **Department**, **Role** selects; toolbar toggle **Show comments** / **Comments on** (title: "Show comment list for filtered tasks")
- Phase groups — collapsible; per-phase delete (**✕**, confirm `Delete phase "{name}"?`)
- Task tree rows (supports nested subtasks, indent-rendered with `└`); per-row: name, status, assignee, dates
- Row actions: **Add subtask** (title: "Add subtask under this activity"), **Delete** (title: "Delete (includes subtasks)")
- Task status vocabulary (`SCOL` keys): `completed` (green) · `inprogress` (blue) · `overdue` (red) · `upcoming` (grey) · `notstarted` (grey) · `paused` (amber) · `blocked` (amber)
- Comment system: `TaskCommentModal` / `TaskCommentPanel` / `TaskCommentsListSection` / `TaskCommentsSummary`; attachments via `AttachmentPicker` / `TaskActivityFiles`; auto-notify recipients via `NotifyRecipientPicker` (`preconAutoNotify.js`, `preconNotify.js`)

### 4b. Bulk allocate (`BulkAllocateView`)
- Mode tabs (`role="tablist"`): **By role**, **By department**, **By dept head**
- Bulk apply button: *"Assign all departments to their heads"* (head mode) or `Apply all {roles|departments} with assignees set`
- **Edit department heads** button (head mode) → opens Department Heads modal

### 4c. Gantt (`GanttView`)
- Legend strip: colored dot per status key + **Today** marker legend
- Split view: sticky task/phase name column (`Task / Phase` header) + scrollable month-banded chart with synced scroll
- Bars colored by computed status (`SCOL`), width = duration; hover tooltip shows **Start**, **End**, **Duration**, **Status**
- Today vertical line marker across all rows

### 4d. Regulatory (`RegView`)
- Heading: `Regulatory Reference — {project}, {location}`
- Intro copy: GHQ-specific *"Statutory approvals for a 33-floor Grade-A commercial tower in PCMC, Maharashtra. Based on applicable legislation as of 2025."* or generic `Regulatory requirements for {type} in {location}.`; hint *"Click ▾ to expand. Status dropdowns are saved."*
- Per-regulation card (`REGS` catalog): category badge, title, authority; **Status** select (`Pending` / `Applied` / `Obtained` / `N/A`, color-coded, persisted per project+reg id); expand chevron (▾/▲)
- Expanded detail: **Governing Act**, **Timeline** (⏱), **Applicability**, **Key Documents Required** (list), optional **⚑ Note**

---

## 5. Modals

| Modal id | Title | Contents |
|---|---|---|
| `deptHeads` | Department Heads | Edit department head assignments (Design, Acquisition, Execution) |
| `addProj` | Add New Project | New-project form (name, type, location, floors, kickoff, color, etc. per `emptyProjForm`) |
| `editProj` | Edit Project | Same fields, pre-filled from `projFormFromProject` |
| `addPhase_{projectId}` | (inline, "Add Phase") | Phase name input (default "New Phase") + color select (`PCOL` palette) → **Add** button, toast "Phase added" |

---

## 6. Data / domain contracts (parity-critical)

- Task status colors/keys (`SCOL`): `completed`, `inprogress`, `overdue`, `upcoming`, `notstarted`, `paused`, `blocked`.
- Regulatory statuses: `Pending` · `Applied` · `Obtained` · `N/A`.
- Regulatory reference catalog (`REGS`) is PCMC/Maharashtra-specific statutory data — must be preserved verbatim (categories, authority, governing act, timeline, applicability, required documents) since it is compliance content, not styling.
- Sync model: full-workspace `useReducer` state persisted to MongoDB via `MongoSyncAdapter` (manual **Save**/**Reload**, not auto-save per action) — differs from platform apps' per-request REST persistence; reskin must not silently change this to auto-save without explicit product sign-off.
- Export formats: Excel "dump" (raw stored fields) vs Excel "report" (computed dates/status/comments) vs full JSON — three distinct downloads, not interchangeable.
- Assignee/department/role rosters are fetched per-project (`fetchPreconTeamRoster`) and filtered by `loginUser` permissions (`preconPermissions.js`, `filterProjectsForUser`) — visibility rules should be treated as a security-relevant behavior, not just UI.

## 7. Open questions for Phase 2 (flag, do not assume)

- Authentication/session handoff between the platform shell and this externally-hosted SPA is not visible in this repo (uses `useLoginUser()` — likely reads a shared cookie/session or postMessage from the parent vault; confirm before reskinning login state).
- Whether `/preconstruction/` is reverse-proxied by the platform server or served from a fully separate origin in production affects CORS/cookie behavior — confirm deployment topology before Phase 2 work.
