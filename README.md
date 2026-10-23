# Campaign Command Centre — Kenya

A campaign operations platform for every Kenyan elective seat — President, Governor, Senator,
Woman Representative, MP and MCA — with Kenya's 47 counties, 290 constituencies and 1,450 wards
built in, plus a marketing website.

## What's inside
- `artifacts/api-server` — API (Express, PostgreSQL/Supabase, row-level campaign isolation)
- `artifacts/commandcentre` — the app (React, glass UI, phone/tablet/desktop, installable)
- `artifacts/website` — marketing site (static; served at `/` when `SITE_AT_ROOT=true`)
- `lib/db` — database schema; `docs/templates` — IEBC import templates

## Modules
Voter & supporter database, segmentation, SMS/WhatsApp/email, field operations, volunteers,
events and itinerary, surveys and polls, intelligence dashboards, path to victory and SWOT,
social listening, rapid response, AI assistant, speeches and manifesto, credentials,
nominations, fundraising (M-Pesa), budgets and expenses, election-day command and tallies,
multi-campaign organisations, two-factor sign-in, audit and data-rights tools.

## Setup
See `DEPLOY_RENDER.md`. Every campaign starts by choosing its seat and area; the platform
loads the right wards and every module uses them.

Electoral boundaries: open compilation of IEBC 2022 boundaries (MIT), cross-checked ward-for-ward
against the IEBC polling-station register, with 24,593 polling centres built in. Each aspirant sees only
their own area; set `DEMO_ASPIRANTS_PASSWORD` for three demo sign-ins (MCA, MP, Governor). The AI assistant
also draws on Kenya Vision 2030 and MTP IV (BETA). See `docs/geography-polling-centres.md`.
Confirm against the current IEBC gazette for legal filings.

## Combined repository layout

The uploaded React/Express/PostgreSQL project is now the primary application at the repository root. It supersedes the original Python runtime for Render deployment. The previous implementation, including its original interface and tests, is preserved under `starter/` as a standalone reference. It is not a second production service and does not share the PostgreSQL database. No pre-existing records were migrated; the repository previously contained source only.

Use the root `render.yaml`, not `starter/Dockerfile`. Do not deploy the starter for the Supabase-backed application. Secrets belong in Render environment settings, never in GitHub. See `.env.example` for variable names and `DEPLOY_RENDER.md` for setup. Database/provider-dependent workflows must still be verified after deployment; the existence of a module does not establish a live integration.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm test
PORT=10000 BASE_PATH=/ NODE_ENV=production pnpm run build:production
```

The acceptance checks include source-level regression assertions; they do not substitute for live PostgreSQL tenant-isolation and provider tests. The imported code retains internal `kaiti_*` table names for compatibility; these are not a restriction to Kaiti. Operational areas come from each campaign profile.

## Run locally

Needs Node 24, pnpm 11 and PostgreSQL 16. On Windows, use **Git Bash**.

1. Create an empty database, e.g. `CREATE DATABASE campaign_manager;`.
2. Copy `.env.example` to `.env.local` (git-ignored). Set:
   - `DATABASE_URL`;
   - `SESSION_SECRET`;
   - the `BOOTSTRAP_ADMIN_*` values (password of 16+ characters);
   - optionally the `PRIMARY_*` campaign values;
   - for free/offline AI, `MAKUENI_AI_MODE=free`.

   Quote values that contain spaces. Remove `NODE_ENV=production`, because production mode needs HTTPS for sign-in cookies.

   On Git Bash, also add `MSYS2_ENV_CONV_EXCL=BASE_PATH`. Otherwise Git Bash rewrites `BASE_PATH=/` into a Windows path.
3. Install dependencies and create the schema. Review the SQL that push shows; don't use `push-force` on a database you care about.
   ```sh
   set -a; source .env.local; set +a
   pnpm install
   pnpm --filter @workspace/db run push
   for f in lib/db/migrations/2026*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$f"; done
   ```
   `push` creates the base tables. The migrations add the remaining ones and are safe to re-run. The API completes setup on first start: sessions, roles, the bootstrap admin, the first campaign, and per-campaign row-level security.
4. Start the API, then the app, in two terminals:
   ```sh
   PORT=8080 pnpm --filter @workspace/api-server run dev
   PORT=5173 BASE_PATH=/ pnpm --filter @workspace/commandcentre run dev
   ```
   Open http://localhost:5173/login. The app's dev server forwards `/api` and `/s/` to the API. If the API runs elsewhere, set `API_PROXY_TARGET` (e.g. `API_PROXY_TARGET=http://localhost:8180`).

### Client sign-in

Each client deployment starts with one root account, so there is no sign-up step and two-factor sign-in is off by default.

1. Set `BOOTSTRAP_ADMIN_EMAIL` to the client's email and `BOOTSTRAP_ADMIN_PASSWORD` to a temporary password. Share both with the client.
2. The client signs in with that email and the temporary password. Before anything else opens, they must choose their own password (at least 12 characters). The server enforces this, not just the app.
3. Later, under **Account security**, they can change their sign-in email or password, and turn on two-factor sign-in if they want it.

Passwords that an administrator generates for a new user, or by resetting a password, are temporary in the same way. Password and email changes are recorded in the audit log, and a password change signs the account out on its other devices. To require two-factor sign-in for some roles, list them in `MFA_REQUIRED_ROLES` (e.g. `super-admin`); leave it empty to keep it optional.
