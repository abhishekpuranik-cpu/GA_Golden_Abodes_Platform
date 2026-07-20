# Parity Checklist — DM / SPV Governance (Business Health)

Source: `docs/reskin/FUNCTIONAL_INVENTORY_dm_governance.md` · Reskinned in `client/src/pages/dmGovernance/DmGovernanceLayout.jsx`.
Route/auth gate unchanged: `/app/dm-governance/*` — `RequireAuth` with `APP_IDS.DM_SPV_GOVERNANCE`.

## Visual reskin applied

- [x] `PlatformShell` + horizontal `.dm-nav`/`.dm-topbar` replaced by `<ModuleFrame>` — navy `HeroBand` ("Business Health") + left `SidebarChrome` nav
- [x] Filtered `DM_NAV` (same tab-visibility filter logic from `meta.tabs`, moved unchanged into `DmGovernanceLayout`) passed as `ModuleFrame`'s `navItems` — same entries/paths/`end` flags survive the filter, only rendering target moved from horizontal to sidebar
- [x] `.dm-app` wrapper (and its CSS custom properties: `--dm-bg`, `--dm-accent`, `--dm-border`, ...) preserved around content so nested `.dm-*` styles keep working
- [x] `.dm-body` wrapper (padding/max-width) preserved
- [x] Legacy `.dm-topbar`/`.dm-nav` defensively hidden if ever nested under `.ga-mod` (`dm-governance.css`)

## Nav parity (label / path / tab id — unchanged; visibility filter unchanged)

| Label | Path | Tab id |
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

## Controls preserved (identical labels/paths/handlers)

- [x] Subline text — "Golden Abodes · {user.email}" (now rendered inside `HeroBand`'s `sub`)
- [x] "← Vault" link — now `SidebarChrome`'s footer vault link, same target `/`
- [x] `VaultAskAi` (`appId="dm_spv_governance"`, `appLabel="Business Health"`, `exampleKey="dm_spv_governance"`, `buildContext={buildDmAskContext}`) — unchanged, rendered as sibling after `<ModuleFrame>`
- [x] Tab-visibility filter (`allowedTabs` from `GET /api/dm-governance/meta`, with the same `dm_approvals`/`dm_billing_config`/`dm_reconciliation`/`dm_expenses`/`dm_risks`/`dm_scenarios`/`dm_executive`/`dm_alerts` fallback-mapping rules) — moved as-is into `navItems`, byte-for-byte same conditionals
- [x] `authApi.session()` / `dmGovernanceApi.meta()` mount side effects — unchanged
- [x] `Outlet` context (`user`, `meta`, `pathname`) passed to nested pages — unchanged
- [x] All nested detail routes inherit the same shell as before

## Deferred / not touched

- [ ] Per-page business logic and forms inside SPV/Project/Billing/Invoice/Compliance/Reconciliation pages, etc. — layout-only pass, no page-level restyle in this task
- [ ] Deep restyle of DM billing/invoices/approvals — already flagged as highest-risk financial paths / shell-only in `DEFERRED.md`

## Build verification

- [x] `npm run build` (client) green after this change
