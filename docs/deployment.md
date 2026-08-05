# Deployment

NEUD is transitioning from a hosted Vercel portal to a **desktop-first Windows application**.

## Primary product (target)

The installable Electron application includes:

- Embedded Next.js UI (same visual design)
- Local SQLite database (`%APPDATA%\NEUD\data\neud.sqlite`)
- Local HTTP server on `127.0.0.1:8070` for graphics, controllers, and API
- Local Data Engine workers with bundled Puppeteer/Chromium (Phase G)
- Minimal Supabase account service for online login and entitlement only

See [desktop-overhaul-audit.md](./desktop-overhaul-audit.md) and [architecture.md](./architecture.md).

## Transitional hosted deployment

During migration Phases A–F, the existing Vercel + Supabase portal may still run for comparison and data export. Do **not** run destructive Supabase cleanup until local migration is verified.

| Service | Current role | Target role |
|---------|--------------|-------------|
| Vercel | Hosted Next.js portal | Deprecated after Phase F |
| Supabase Auth | Login, invites, recovery | **Keep** (minimal account service) |
| Supabase Postgres | All project/runtime data | **Migrate locally**, then remove runtime tables manually |
| External worker VPS | Remote command queue worker | **Remove** (local-only engines) |

## Desktop packaging

```bash
npm run build:desktop
npm run package:win
```

Requires approved install scripts for `electron` and `app-builder-bin` when npm prompts.

Packaged resources include:

- Next.js standalone server
- Data Engine worker runtime
- SQL.js WASM (`sql-wasm.wasm` — bundle in Phase G)
- Puppeteer Chromium (Phase G production blocker)

## Environment variables

| Variable | Scope |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth (embedded in desktop during transition) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth and desktop authenticated cloud sync |
| `SUPABASE_SERVICE_ROLE_KEY` | **Vercel/server only** — identity admin, access requests, trusted scripts. **Not packaged in Electron.** |
| `NEUD_TRUSTED_PORTAL_ORIGIN` | Trusted HTTPS origin for desktop privileged admin API calls (Vercel / NEUD.io) |
| `NEUD_SUPABASE_DB_URL` | Non-production Postgres URI for live migration apply scripts only (never package) |
| `NEUD_ALLOW_PLAINTEXT_CREDENTIALS` | Dev-only scraper credential fallback |

Do not package `.env.local`, `server.env`, or any file containing `SUPABASE_SERVICE_ROLE_KEY` in installers.

The desktop main process loads public Supabase config only (`loadSupabasePublicConfig`). Missing cloud config does not block startup.

## Packaging security (Slice 2.2)

Production desktop packages must exclude:

- Service-role environment files (`.env.local`, `server.env`)
- Trusted admin scripts and migration credentials
- Stale privileged modules (`supabase-main.js` removed at build via `copy-runtime-assets.mjs`)

Automated scan: `desktop/scripts/test-neud-desktop-no-service-role.mjs` and `desktop/scripts/test-neud-release-security.mjs`.

Local packaged worker: see [data-engine-worker-deployment.md](./data-engine-worker-deployment.md).

## Supabase cleanup (manual only)

1. `supabase/cleanup/desktop_only_preflight.sql`
2. `supabase/cleanup/desktop_only_export.sql`
3. Import via `scripts/migrate-from-supabase.mjs` (Phase B wizard)
4. `supabase/cleanup/desktop_only_destructive_cleanup.sql` — **manual, destructive**
5. `supabase/cleanup/desktop_only_verify.sql`

Apply additive auth migration `007_auth_entitlements.sql` before removing runtime tables.

## Rollback

Restore `%APPDATA%\NEUD\data\backups\*.sqlite` and revert to a previous application version. Supabase data remains until destructive cleanup is executed manually.
