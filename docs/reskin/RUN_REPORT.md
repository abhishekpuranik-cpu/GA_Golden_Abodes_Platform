# RUN REPORT — GA Platform visual reskin, Phase 3 close-out

**Branch:** `reskin/ga-apps` (platform) / `reskin/ga-apps` (`GA_PreConstruction_React`, sibling repo)
**Scope:** Phase 1 (shared design system) + Phase 2 (apply to React module layouts + legacy scoped CSS + PreConstruction) of the GA reskin.
**Ground rule:** zero functional change — same routes, handlers, labels, APIs throughout. `VaultHome.jsx` / `AccessPage.jsx` (vault shell) were **not** touched.

---

## Phase 1 — shared design system

| Artifact | What changed |
|---|---|
| `client/src/theme/ga-tokens.css` | Added `--ga-navy-2`, `--ga-panel` (aliases `--ga-chrome-hi`), `--ga-shadow`, `--ga-shadow-hi`. All existing `--ga-*` vars and back-compat aliases kept. |
| `client/src/components/ga-kit/HeroBand.jsx` | New — navy gradient hero band (`eyebrow`, `title`, `sub`, `actions`). |
| `client/src/components/ga-kit/SidebarChrome.jsx` | New — left chrome nav; `NavLink`-based, orange left border on active, same `{to,label,end}` contract every module's nav array already uses. |
| `client/src/components/ga-kit/ProgressRing.jsx` | New — conic-gradient ring (`value`/`max`/`label`). |
| `client/src/components/ga-kit/KpiCard.jsx` | Restyled to use `.ga-kpi` (accent spine, Playfair numeral via `ga-module.css`); added optional `tone` prop (`orange`\|`navy`\|`green`\|`salmon`). No existing consumers in this repo, so no call-site changes needed. |
| `client/src/theme/ga-module.css` | New — `.ga-mod` shell grid (216px sidebar + main), sidebar chrome, hero band, content, `.ga-kpi`, `.ga-mod-table`, `.ga-age-1/2/3`, `.ga-ring`, `.ga-btn`/`-primary`/`-ghost`/`-glass`. Imported from `main.jsx`. |
| `client/src/components/ModuleFrame.jsx` | New — composes `PlatformShell` + `SidebarChrome` + `HeroBand` around `children`; `navItems` keeps each module's existing `{path,label,end}` shape. Callers keep rendering their own `<VaultAskAi>` as a sibling after `<ModuleFrame>`. |
| `client/src/theme/ga-motion.css` | Added `.ga-page-enter` (0.55s) and `.ga-drawer-slide` (0.35s); wired into `ModuleFrame` and `ga-kit/Drawer.jsx`; respects `prefers-reduced-motion`. |

## Phase 2 — React module layouts

Applied `ModuleFrame` (sidebar nav + hero) in place of each module's horizontal topbar/nav, reusing the **exact same nav arrays** (paths/labels/`end` flags unchanged):

- `pages/hiring/HiringLayout.jsx` — `HIRING_NAV`, hero "Hiring & Sourcing"
- `pages/postsales/PostSalesLayout.jsx` — `PS_NAV`; sync banners kept inside content, above `<Outlet>`
- `pages/dmGovernance/DmGovernanceLayout.jsx` — same filtered `DM_NAV` logic, now filtering into `ModuleFrame`'s `navItems`
- `pages/AdminSecurityPage.jsx` — `PlatformShell` + `HeroBand` only (no sidebar, per spec — single screen); all forms/controls byte-for-byte unchanged

Each module's own CSS wrapper (`.hr-app`/`.ps-app`/`.dm-app`) and body wrapper (`.ps-body`/`.dm-body`) were **kept** around content (not deleted) because they carry CSS custom properties (`--ps-accent`, `--dm-border`, ...) that dozens of descendant rules still depend on — only their now-redundant full-viewport `min-height` is neutralized inside `.ga-mod-content`. Legacy `.hr-topbar`/`.ps-topbar`/`.dm-topbar`/`.hr-nav`/`.ps-nav`/`.dm-nav` are defensively `display:none`'d if ever nested under `.ga-mod`, in addition to no longer being rendered in JSX.

See `PARITY_CHECKLIST_admin_security.md`, `PARITY_CHECKLIST_hiring.md`, `PARITY_CHECKLIST_post_sales.md`, `PARITY_CHECKLIST_dm_governance.md` for the full per-module control/label/path inventory sign-off.

## Phase 2 — legacy scoped CSS (no DOM/JS rewrite)

- `client/public/legacy/ga-reskin-theme.css` — shared theme that **re-declares each legacy app's own CSS custom properties** (`--gold`, `--blue`, `--accent`, `--bg`, `--card`, `--border`, `--text`, `--muted`, ...) to GA navy/orange values. Every button/tab/header selector in those apps already reads these vars via `var(...)`, so recoloring is purely additive — no selectors, markup, or JS touched. Also retints `.logo`/`.brand` text to Playfair Display.
- `client/public/legacy/cashflow-theme.css` — Cashflow-specific: `#topbar` gradient → GA navy, `.tab-btn.on` underline → GA orange, `.cf-table thead th` micro-head styling; restores Cashflow's original amber `--gold` (it uses that token for warning/notice callouts, not buttons, unlike the other legacy apps).
- `client/src/lib/injectLegacyMobileCss.js` — now also injects `ga-reskin-theme.css` into `LegacyAppShell` iframes (Resource Planner V2, Org Planner V3), alongside the existing mobile stylesheet.
- Cashflow / Sales Dashboard / Marketing KPI / Finance KPI open **outside** the iframe shell (direct vault links), so each got a `<link rel="stylesheet" href="/legacy/ga-reskin-theme.css">` added right before `</head>`; Cashflow additionally links `cashflow-theme.css`.
- `Golden_Abodes_App_Vault.html` (vault shell) and `GA_Portfolio_Enablement.html` (out of Phase 0 scope) were **not** touched.

## PreConstruction (`GA_PreConstruction_React`, sibling repo, branch `reskin/ga-apps`)

- Added `src/theme/ga-precon-reskin.css` — retints the fixed top nav (`.tnav` accent border), brand mark (`.nlogo`, navy/orange + Playfair), and active-tab underline (`.dash-stab.act`, orange) to GA tokens. No JS changes.
- Because the app injects its real stylesheet (`STYLES` template string in `App.jsx`) into `<head>` via a mount-time `useEffect` — *after* this statically-imported file — every rule uses `!important` so it reliably wins regardless of mount timing.
- Rebuilt via `npm run build:precon` from the platform root; output copied to `client/public/preconstruction/` and confirmed the new rules are present in the built CSS bundle.

## Commits

1. `Phase 1: GA reskin design system (tokens, ga-kit HeroBand/SidebarChrome/ProgressRing, ga-module.css, ModuleFrame, motion)`
2. `Phase 2: apply ModuleFrame (SidebarChrome + HeroBand) to Hiring, Post Sales, DM Governance layouts; HeroBand on Admin Security`
3. `Phase 2: legacy scoped reskin CSS (ga-reskin-theme.css, cashflow-theme.css) + PreConstruction rebuild`
4. (`GA_PreConstruction_React`, own repo) `GA reskin: scoped top-nav/brand-mark theme remap (ga-precon-reskin.css)`

None of the above were pushed to `main`.

## Verification

- `npm run build` (client) — green (see file list + sizes below; last full run confirmed after all Phase 1/2 edits).
- `npm run build:precon` — green; new CSS confirmed present in `client/public/preconstruction/assets/*.css`.
- Behavior contract: same routes in `App.jsx`, same `RequireAuth` gates/`appId`s, same nav arrays (`HIRING_NAV`/`PS_NAV`/`DM_NAV`) reused verbatim, same API calls, same `VaultAskAi` props.

## Human review focus

1. Hiring / Post Sales / DM Governance — left sidebar nav replaces the old horizontal tab bar; confirm all tabs still resolve to the same pages.
2. Admin Security — hero band replaces the old page header; confirm every form control still works (create user, save roles, reset password, project picker).
3. Resource Planner V2 / Org Planner V3 (iframe) — confirm the injected reskin CSS doesn't visually clash inside the iframe.
4. Cashflow / Sales Dashboard / Marketing KPI / Finance KPI — confirm brand-orange/navy retint reads correctly and no button/warning semantics look confused (Cashflow's amber "warning" callouts were deliberately kept amber, not turned into CTA-orange).
5. PreConstruction — confirm top-nav accent + "GA" brand mark render navy/orange after the latest deploy of `client/public/preconstruction`.

## Deferred

See `docs/reskin/DEFERRED.md` (Phase 0 deferrals) — unchanged by this pass — plus:
- Deep structural restyle of legacy HTML apps beyond token/selector-level retinting (per existing root `DEFERRED.md` entry).
- Per-page business-logic restyles inside Hiring/Post Sales/DM Governance sub-pages — this pass is layout-shell only.
