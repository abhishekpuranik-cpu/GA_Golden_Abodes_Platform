# Parity Checklist — Admin Security

Source: `docs/reskin/FUNCTIONAL_INVENTORY_admin_security.md` · Reskinned in `client/src/pages/AdminSecurityPage.jsx`.
Route/permission gate unchanged: `/admin/security` — `<RequireAuth permission="manage_security" appId="admin_security">`.

## Visual reskin applied

- [x] `PageHeader` replaced with `<HeroBand>` (navy gradient, eyebrow "GOLDEN ABODES · SECURITY", title "Admin Security", subtitle copy preserved verbatim, "← Back to Vault" action styled as `ga-btn ga-btn-glass`)
- [x] No sidebar added (per spec — single-screen app, "no sidebar needed")
- [x] `.admin-security` content wrapper, cards, and inputs untouched (still styled by existing `admin-*` CSS)
- [x] `PlatformShell` top chrome unchanged

## Controls preserved (identical labels/paths/handlers)

- [x] `err` banner (`.admin-err`) on load/save failure
- [x] `session` banner (`.admin-session`) — "Signed in as {email}"
- [x] Section: Bandwidth report — subtitle text, **Refresh report** button (`authApi.bandwidthReport()`, "Refreshing…" label while loading), `<BandwidthReport>` sub-component
- [x] Section: Roles — role ID (read-only), **Role name**, **permissions (csv)**, **allowed apps (csv)** per row; **Save roles** → `authApi.saveRoles(roles)` + reload
- [x] Section: Create user — Email / Name / WhatsApp phone / Password (min 8) / Role IDs (csv, default `viewer`) / Allowed apps (csv) / Allowed tabs fields; `<ProjectAssignPicker>`; **Create user** → `authApi.createUser(...)`
- [x] Section: Users — per-user card fields (Name, WhatsApp phone, Status select, Role IDs, Allowed tabs, Allowed apps), `<ProjectAssignPicker>`, **Save user** → `authApi.updateUser(...)`, **Reset password** / **Cancel reset** toggle
- [x] Inline password-reset panel — heading, hint copy, New/Confirm password fields, Show/Hide toggle, **Generate secure password**, **Set new password** (disabled while busy, "Updating…" label), min-8-chars + match validation, `window.confirm(...)` destructive-action guard, success/error copy verbatim
- [x] All API calls unchanged: `authApi.session/listRoles/listUsers/listPreconstructionProjects/saveRoles/createUser/updateUser/resetUserPassword/bandwidthReport`
- [x] Known app-ID list (`ALL_APPS`) and DM tab-ID list (`ALL_DM_TABS`) placeholders unchanged

## Deferred / not touched

- [ ] Deep restyle of `ProjectAssignPicker` / `BandwidthReport` internals (black-box sub-components, out of scope per Phase 0 inventory §5)
- [ ] CSV free-text inputs kept as plain text inputs (not converted to chip/multi-select UI — would change the data contract)

## Build verification

- [x] `npm run build` (client) green after this change
