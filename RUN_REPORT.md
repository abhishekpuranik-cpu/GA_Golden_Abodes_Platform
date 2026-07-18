# RUN REPORT — GA App Vault brand UI rebuild

Branch: `theme/ga-platform`  
Command: `GA_Platform_Full_Cursor_Command_V4_Autonomous.md`  
Mode: additive CSS/components only; routes, APIs, ACL, and launch URLs unchanged.

## Part A — shell

1. `GAP_REPORT_VAULT_UI.md` — committed as audit artifact
2. Tokens + fonts — `client/src/theme/ga-tokens.css`, Jost + Playfair in `client/index.html`
3. Access page — brand split-screen; same `authApi` login/bootstrap/session
4. Vault home — greeting strip, registry-driven module cards with LIVE/LOCKED, chrome footer + env tag, preserved URL overrides / link agent / Ask AI
5. App shell + PageHeader — `PlatformShell` on Admin (pilot), Hiring, Post Sales, DM Governance, Legacy planners
6. Command palette — Cmd/Ctrl-K module-name search (no federated endpoints)
7. Motion — reveal / stagger / access crossfade behind `prefers-reduced-motion`

## Part B — modules

- `ga-kit` library shipped under `client/src/components/ga-kit/`
- Per-module deep table/form restyles for financial write-paths deferred (see `DEFERRED.md`)
- Shell chrome + token availability applied platform-wide for React modules

## Verification

- `npm run build` (Vite) expected green on this branch
- Behaviour contract: same routes in `App.jsx`, same ACL app IDs, same launch hrefs for allowed apps
- Unauthorized modules surface as LOCKED cards (non-navigable) without changing open behaviour for assigned apps

## Artifacts

- `GAP_REPORT_VAULT_UI.md`
- `THEME_COVERAGE.md`
- `DEFERRED.md`
- `RUN_REPORT.md` (this file)

## Human review focus

1. `/access` visual + login still works
2. Vault cards open the same targets as before for assigned apps
3. Cmd-K opens only accessible modules
4. Planners still save/restore cloud state
5. Hiring / Post Sales / DM internal tabs unchanged
