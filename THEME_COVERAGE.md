# THEME COVERAGE

Branch: `theme/ga-platform`

| Screen / surface | Status | Notes |
|---|---|---|
| Design tokens (`ga-tokens.css`) | ✅ themed | Single source; aliases for legacy vars |
| Fonts (Playfair + Jost) | ✅ themed | `client/index.html` |
| Access `/access` | ✅ themed | Split-screen; auth logic unchanged |
| Vault home `/` | ✅ themed | Greeting, module grid, LOCKED chips, footer, Cmd-K |
| Command palette | ✅ themed | Module-name fuzzy search only |
| Platform shell top bar | ✅ themed | Shared chrome for React modules + planners |
| PageHeader / ga-kit | ✅ themed | Available for adoption |
| Admin Security | ✅ themed | Shell + PageHeader + light overrides |
| Legacy planners (V2/V3) | ✅ shell | Iframe content exempt |
| Hiring layout | ✅ shell | Internal nav preserved |
| Post Sales layout | ✅ shell | Internal nav preserved; write screens deferred deep restyle |
| DM Governance layout | ✅ shell | Billing/invoices deferred deep restyle |
| Cashflow / Sales / Finance / Marketing HTML | exempted | Legacy iframe apps |
| PreConstruction / Execution | exempted | External / bundled SPA; vault cards only |
| Pinned “Your desk” | deferred | See `DEFERRED.md` |
| Federated search | deferred | See `DEFERRED.md` |
