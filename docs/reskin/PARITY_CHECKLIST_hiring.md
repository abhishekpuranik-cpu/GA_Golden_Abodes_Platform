# Parity Checklist — Hiring & Sourcing

Source: `docs/reskin/FUNCTIONAL_INVENTORY_hiring.md` · Reskinned in `client/src/pages/hiring/HiringLayout.jsx`.
Route/auth gate unchanged: `/app/hiring/*` — `RequireAuth appId={APP_IDS.HIRING}`.

## Visual reskin applied

- [x] `PlatformShell` + horizontal `.hr-nav`/`.hr-topbar` replaced by `<ModuleFrame>` — navy `HeroBand` ("Hiring & Sourcing") + left `SidebarChrome` nav
- [x] `HIRING_NAV` reused verbatim as `ModuleFrame`'s `navItems` — same 4 entries, same paths, same `end` flags (see table below)
- [x] `.hr-app` wrapper (and its CSS custom properties) preserved around page content so nested `.hr-*` styles keep working
- [x] Legacy `.hr-topbar`/`.hr-nav` defensively hidden if ever nested under `.ga-mod` (`hiring.css`)

## Nav parity (label / path / end — unchanged)

| Label | Path | end |
|---|---|---|
| Requisitions | `/app/hiring` | true |
| Interviews | `/app/hiring/interviews` | — |
| CTC Generator | `/app/hiring/ctc` | — |
| Dashboard | `/app/hiring/dashboard` | — |

## Controls preserved (identical labels/paths/handlers)

- [x] Subline text — `{user.email} · Sourcing: {Metaview|Manual import}` (now rendered inside `HeroBand`'s `sub`, sourced from the same `hiringApi.health()` call)
- [x] "← Vault" link — now `SidebarChrome`'s footer vault link (`vaultLinkLabel` default), same target `/`
- [x] `VaultAskAi` (`appId="hiring"`, `appLabel="Hiring & Sourcing"`, `exampleKey="hiring"`) — unchanged, rendered as sibling after `<ModuleFrame>`
- [x] `canWrite` gate logic (role admin/hiring_manager, `manage_security` permission, or `allowedApps` includes `hiring`) — untouched, still passed via `Outlet` context
- [x] Nested routes (Requisition Board, Interviews, CTC Generator, Dashboard + sub-tabs, Requisition detail, Candidate profile) — untouched, still rendered via the same `<Outlet>`
- [x] `authApi.session()` / `hiringApi.health()` mount side effects — unchanged

## Deferred / not touched

- [ ] Per-page business logic and forms inside `RequisitionBoard`, `InterviewCalendar`, `CtcGenerator`, `HiringDashboardLayout`, etc. — layout-only pass, no page-level restyle in this task

## Build verification

- [x] `npm run build` (client) green after this change
