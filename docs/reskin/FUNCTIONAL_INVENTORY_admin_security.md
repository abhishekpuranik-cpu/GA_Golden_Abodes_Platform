# Functional Inventory — Admin Security (Phase 0)

**Phase 0 · GA Platform reskin**
**App ID:** `admin_security`
**Route:** `/admin/security` — `<RequireAuth permission="manage_security" appId="admin_security"><AdminSecurityPage /></RequireAuth>` (gated on the `manage_security` permission, not just an app right)
**Source:** `GA_Golden_Abodes_Platform/client/src/pages/AdminSecurityPage.jsx` (React, single page, no sub-routes)
**Page shell:** `PlatformShell` title "Admin Security", breadcrumb "Vault / Admin Security"; `PageHeader` eyebrow "GOLDEN ABODES · SECURITY", title "Admin Security", action link **"← Back to Vault"**
**Subtitle copy:** "Users, project access, and team bandwidth across PreConstruction projects"

---

## 1. Screen: Admin Security (single screen, 3 stacked sections + banners)

### Route-level guards / banners
- `err` banner (`.admin-err`) — shown on any load/save failure (e.g. "Not logged in", "Admin access required", or raw API error message)
- `session` banner (`.admin-session`) — "Signed in as {email}"

### Section 1 — Bandwidth report (`<h2>Bandwidth report</h2>`)
- Subtitle: "Each person's 100% bandwidth split across Admin-assigned projects (weighted by open in-scope activities and role)"
- Button **Refresh report** (disabled + label "Refreshing…" while loading) → `authApi.bandwidthReport()`
- Renders `<BandwidthReport report loading error />` component (separate component, not detailed here — treat as black box sub-component; shows `bwError` on failure)

### Section 2 — Roles (`<h2>Roles</h2>`)
- One row per role: read-only role ID input, editable **Role name** text input, editable **permissions (csv)** text input, editable **allowed apps (csv)** text input
- Button **Save roles** → `authApi.saveRoles(roles)` then reloads all data

### Section 3 — Create user (`<h2>Create user</h2>`)
- Fields: **Email**, **Name**, **WhatsApp phone** (placeholder "e.g. 9876543210 or +91…"), **Password (min 8)** (type=password), **Role IDs (csv)** (default value `viewer`), **Allowed apps (csv, optional)**, **Allowed tabs** input (placeholder/title lists DM tab csv — see §3 vocab)
- **Assigned projects** — `<ProjectAssignPicker>` component bound to `newUser.allowedProjects` (multi-select of PreConstruction project catalog, loaded via `authApi.listPreconstructionProjects()`)
- Button **Create user** (primary) → `authApi.createUser({email,name,phone,password,roleIds,allowedProjects,allowedTabs,allowedApps})`, then clears form and reloads

### Section 4 — Users (`<h2>Users</h2>`, one card per user, `.admin-user-card`)
Per-user card:
- Header: user email (read-only)
- Editable fields: **Name**, **WhatsApp phone**, **Status** select (`active` / `disabled`), **Role IDs** (csv text), **Allowed tabs** (csv text, placeholder shows DM tab list), **Allowed apps** (csv text, placeholder lists all app IDs — see §2)
- **Assigned projects** — `<ProjectAssignPicker>` bound to that user's `allowedProjects`
- Buttons: **Save user** → `authApi.updateUser(id, {name, phone, status, roleIds, allowedApps, allowedProjects, allowedTabs})`, reloads; **Reset password** / **Cancel reset** (toggle) → opens/closes inline reset panel

#### Inline password-reset panel (per user, toggled)
- Heading "Reset password for {email}"
- Hint: "Set a new login password for this user. Minimum 8 characters. All their active sessions will end immediately."
- Two password inputs: **New password (min 8)**, **Confirm new password** (both togglable text/password via Show/Hide)
- Buttons: **Generate secure password** (fills both fields with a random 12-char password from charset `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$`, auto-reveals); **Show password** / **Hide password** toggle; **Set new password** (primary, disabled while busy, label "Updating…")
- Validation: password length must be ≥8 chars ("Password must be at least 8 characters."); must match confirm ("Passwords do not match.")
- Confirmation dialog (`window.confirm`): `"Reset password for {email}?\n\nThey will be signed out on all devices and must use the new password to log in."`
- On success: `authApi.resetUserPassword(id, password)` → success message "Password updated for {email}. Share the new password securely — their active sessions were cleared." and clears the form
- On failure: shows `resetErr` (API error message)

---

## 2. Known app IDs (`ALL_APPS` — displayed in the Allowed-apps placeholder)
`v1_cashflow`, `v2_resource_planner`, `v3_project_acquisition`, `sales_dashboard`, `marketing_kpi`, `preconstruction`, `execution`, `finance_kpi`, `finance_kpi_admin`, `dm_spv_governance`, `post_sales`, `hiring`, `admin_security`

## 3. Known DM (governance) tab IDs (`ALL_DM_TABS` — displayed in the Allowed-tabs placeholder)
`dm_dashboard`, `dm_spvs`, `dm_projects`, `dm_billing`, `dm_invoices`, `dm_compliance`, `dm_reports`, `dm_scenarios`, `dm_executive`, `dm_alerts`, `dm_consolidated`, `dm_settings`

## 4. Side effects / API surface
- `authApi.session()` — gates the whole page: throws if not authenticated, or if user lacks `manage_security` permission ("Admin access required")
- `authApi.listRoles()`, `authApi.listUsers()`, `authApi.listPreconstructionProjects()` — loaded in parallel on mount
- `authApi.saveRoles(roles)`, `authApi.createUser(...)`, `authApi.updateUser(id, ...)`, `authApi.resetUserPassword(id, password)`, `authApi.bandwidthReport()`
- All mutating actions (`saveRoles`, `addUser`, `saveUser`) call `load()` afterward to refresh from server (no optimistic local-only updates)
- No confirmation dialog on Save roles / Save user / Create user — only password reset is confirmed via `window.confirm`

## 5. Secondary surfaces
- `ProjectAssignPicker` and `BandwidthReport` are shared components used elsewhere in the platform (project multi-select, bandwidth visualization) — treated as black-box sub-components for this inventory; their internal controls are out of scope here unless the reskin also touches those files directly.

## 6. Parity notes
- This is the only inventoried screen gated by a **permission** (`manage_security`) rather than (or in addition to) an app right — `RequireAuth` behavior here differs subtly from the `appId`-only gates used elsewhere (e.g. Resource Planner, Org Planner).
- CSV-text-input pattern (`roleIds`, `allowedTabs`, `allowedApps`) is comma-separated free text, not a structured multi-select — any reskin replacing these with chips/multi-selects must keep the underlying array shape and `splitCsv`/`join(', ')` semantics.
- Password reset flow is destructive (signs out all sessions) and is the only place with a browser `confirm()` — preserve that guard.
