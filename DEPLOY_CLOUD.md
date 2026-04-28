# Deploy To Cloud (Single Shared URL)

This makes one public URL for the Vault UI + API so your team can use the same live data (MongoDB), without depending on your laptop LAN.

## What you already have

- Server serves API at `/api/*` and frontend from `client/dist`
- Health check at `/api/health`
- MongoDB-backed shared app state routes

## 1) Push this folder to GitHub

Push `GA_Golden_Abodes_Platform` to a GitHub repo (private is fine).

## 2) Create MongoDB Atlas database

1. Create a free/shared Atlas cluster.
2. Create database user (username/password).
3. In **Network Access**, allow your cloud host (for quick start: allow `0.0.0.0/0`, then tighten later).
4. Copy connection string:
   - `mongodb+srv://<user>:<pass>@<cluster>/...`

## 3) Deploy web service on Render

1. Open Render -> **New** -> **Blueprint**.
2. Connect the repo containing `GA_Golden_Abodes_Platform`.
3. Render will read `render.yaml`.
4. Set secret env var:
   - `MONGODB_URI = <your Atlas connection string>`
5. Deploy.

After deploy, you get one URL like:

- `https://ga-golden-abodes-platform.onrender.com`

Use this as the single team URL.

## 4) Set Vault links for external apps

If Execution/PreConstruction are separate deployments, set:

- `VITE_EXECUTION_DASHBOARD_URL`
- `VITE_PRECONSTRUCTION_URL`

in Render env and redeploy.

If not set, the cards stay visible but show a setup message (they no longer default to localhost in cloud).

## 5) Verify

Open:

- `<your-url>/api/health` -> should show `"ok": true` and `"mongo": true`
- `<your-url>/` -> Vault loads
- Save data in one browser, open another browser/user and load -> same data appears

## 6) Legacy HTML note

`/legacy/*` is served from `client/public/legacy` (or `API_TOOL_PATH` if provided).  
Render build now runs `npm run build:all`, which copies legacy files (including V2/V3 HTML) into `client/public/legacy` before Vite build.

