# Parity Checklist — Post Sales Operations

Source: `docs/reskin/FUNCTIONAL_INVENTORY_post_sales.md` · Reskinned in `client/src/pages/postsales/PostSalesLayout.jsx`.
Route/auth gate unchanged: `/app/post-sales/*` — `RequireAuth appId={APP_IDS.POST_SALES}`.

## Visual reskin applied

- [x] `PlatformShell` + horizontal `.ps-nav`/`.ps-topbar` replaced by `<ModuleFrame>` — navy `HeroBand` ("Post Sales Operations") + left `SidebarChrome` nav
- [x] `PS_NAV` reused verbatim as `ModuleFrame`'s `navItems` — same 11 entries, same paths, same `end` flags (see table below)
- [x] `.ps-app` wrapper (and its CSS custom properties: `--ps-bg`, `--ps-accent`, `--ps-border`, ...) preserved around content so nested `.ps-*` styles keep working
- [x] `.ps-body` wrapper (max-width/padding + its `:has(.ps-reports-page)` / `:has(.ps-tasks-page)` width rules) preserved
- [x] Legacy `.ps-topbar`/`.ps-nav` defensively hidden if ever nested under `.ga-mod` (`post-sales.css`)

## Nav parity (label / path / end — unchanged)

| Label | Path | end |
|---|---|---|
| Dashboard | `/app/post-sales` | true |
| Allocation | `/app/post-sales/allocation` | — |
| My Tasks | `/app/post-sales/my-tasks` | — |
| Inventory | `/app/post-sales/inventory` | — |
| Units | `/app/post-sales/units` | — |
| Documents | `/app/post-sales/documents` | — |
| Demands | `/app/post-sales/demands` | — |
| Loans | `/app/post-sales/loans` | — |
| Tickets | `/app/post-sales/tickets` | — |
| Milestones | `/app/post-sales/milestones` | — |
| Reports | `/app/post-sales/reports` | — |

## Controls preserved (identical labels/paths/handlers)

- [x] Subline text — "Your working app for sold units, collections, pipeline & allocation · {user.email}" (now rendered inside `HeroBand`'s `sub`)
- [x] "← Vault" link — now `SidebarChrome`'s footer vault link, same target `/`
- [x] `VaultAskAi` (`appId="post_sales"`, `appLabel="Post Sales Operations"`, `exampleKey="post_sales"`, `buildContext={buildPostSalesAskContext}`) — unchanged, rendered as sibling after `<ModuleFrame>`
- [x] **Auto-sync banner** — "Syncing sold units & collections in the background…" (`role="status"`) — same trigger (`postSalesApi.getSyncPreferences()` + `bootstrap()` on mount), same session-storage caching (`ps_sync_note`), rendered inside content (kept per spec: "keep sync banners inside content")
- [x] **Sync note card** — same copy pattern ("{note}. Achieved dates: Milestones → Save & sync → Reports & Step 12. Collections: Demands — Cashflow V1 reads from here."), same `Milestones`/`Demands` links
- [x] Nested route `units/:id` (Unit Pipeline detail, no nav tab) — untouched
- [x] `authApi.session()` mount side effect — unchanged

## Deferred / not touched

- [ ] Per-page business logic and forms inside `Units`, `Demands`, `Loans`, `Reports`, etc. — layout-only pass, no page-level restyle in this task
- [ ] Deep restyle of Post Sales write screens (Demands/Loans) — already flagged RISK / shell-only in `DEFERRED.md`

## Build verification

- [x] `npm run build` (client) green after this change
