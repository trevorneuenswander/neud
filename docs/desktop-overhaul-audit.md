# Desktop-First Overhaul — Architecture Audit

This document records the pre-overhaul inventory, target architecture, and phased migration plan for converting NEUD from a hosted web portal into a self-contained Windows desktop application.

## 1. Current architecture summary

NEUD is a Next.js 16 portal deployed to Vercel (optional) with Supabase Auth + Postgres as the primary data store. An external Node worker (`workers/data-engine/`) polls Supabase for commands and writes snapshots/logs. Phase 1 Electron wraps the same Next.js UI and can spawn the worker locally while still using Supabase for all project and runtime state.

## 2. Current Electron architecture summary

Electron main owns lifecycle, IPC, credential storage (`safeStorage`), machine identity, optional packaged Next.js server (loopback `45123+`), and `EngineManager` for local worker children. The renderer loads the existing portal UI. Service-role Supabase credentials live in main only. Dual execution mode (`remote-worker` | `local-desktop`) still writes to Supabase command/status tables.

## 3. Current Next.js usage summary

- Route groups: `(public)` marketing/auth, `(portal)` operational shell
- Session refresh via `src/proxy.ts`
- Server Components + Server Actions for all data access
- Supabase Realtime in `EngineDetailClient`
- `output: "standalone"` for Electron packaging
- Displays, Controllers, Activity, Settings are mostly placeholders
- No public OBS display routes yet (`display_token` exists in schema only)

## 4. Current Supabase table inventory

| Table | Purpose |
|-------|---------|
| `access_requests` | Public access request workflow |
| `profiles` | Platform roles |
| `projects` | Project metadata |
| `project_members` | Per-project access |
| `data_engines` | Data Engine definitions |
| `data_engine_status` | Runtime status |
| `data_engine_commands` | Remote/local command queue |
| `data_engine_snapshots` | Scrape output |
| `data_engine_logs` | Operational logs |
| `webpage_scraper_settings` | Scraper config |
| `webpage_scraper_sources` | Scraper URLs |
| `desktop_hosts` | Desktop host registration |

## 5. Functions, triggers, policies, storage

- **19 functions/RPCs** including RLS helpers, `create_project_with_manager`, `claim_data_engine_command`, prune RPCs
- **8 triggers** (`set_updated_at`, last-manager protection)
- **35 RLS policies** across project and engine tables
- **4 Realtime tables**: status, snapshots, logs, commands
- **No Storage buckets**, Edge Functions, or auth SQL hooks

## 6. Current authentication flow

Access request → admin invite → `/auth/confirm` → password set → cookie session via Supabase SSR. Platform roles in `profiles`; project access via `project_members`. Service-role client used for invites and access requests only on server.

## 7. Current local vs cloud responsibilities

| Local today | Cloud today |
|-------------|-------------|
| Electron UI host | Auth, profiles, access requests |
| Optional local worker process | All project/engine data |
| OS credential encryption | Command queue, snapshots, logs |
| App data paths (cookies, logs) | Realtime subscriptions |
| Packaged Next.js (optional) | RLS authorization |

## 8. Features that must remain

- Visual design, navigation, Data Engine UI, JSON viewer, logs, BAG scraper behavior
- Project management UX (adapted to local ownership)
- Data Engine start/stop/restart/run once
- Local display/controller URLs (to be implemented)
- Secure NEUD account login
- 7-day offline access (to be implemented)

## 9. Features that will be removed

- Vercel as primary application host
- Remote worker command queue and polling
- Cloud snapshot/log synchronization as primary store
- Dual remote/local execution mode
- Multi-user hosted project sharing (desktop is single-install focused)
- Request Access / public signup as primary onboarding (may move to separate admin service)
- Realtime dependency for core operation

## 10. Features moved to local storage

Projects, Data Sources (engines), settings, sources, status, snapshots, logs, displays, controllers, assets, app settings, publishing config, auth cache metadata.

## 11. Features still requiring cloud

- Online login verification
- Account disabled checks
- Role and product entitlement lookup
- Optional device authorization
- Signed offline license issuance/verification
- Optional public graphics publishing relay

## 12. Proposed final architecture

See [architecture.md](./architecture.md) (updated). Electron main owns SQLite, local HTTP server (`127.0.0.1:8070`), engines, Puppeteer, credentials, auth cache, publishing manager. Embedded Next.js UI preserved; data access migrates to local API + IPC. Minimal Supabase Auth/entitlement schema only.

## 13. Proposed local database schema

SQLite at `%APPDATA%\NEUD\data\neud.sqlite`. Implemented in `desktop/src/database/migrations/001_initial_schema.sql`.

**Implementation note:** Phase A uses **sql.js (WASM)** instead of `better-sqlite3` to avoid native rebuild/Python requirements during development and packaging. Data integrity is preserved via WAL-style persistence (export-on-write). Evaluate `better-sqlite3` again in Phase G if WASM performance becomes a bottleneck.

## 14. Proposed authentication and offline-license design

1. Online login via Supabase Auth (publishable key + user session)
2. Main process requests signed authorization payload (Edge Function or HMAC service — Phase D)
3. Cache encrypted record in `auth_cache` with 7-day `offline_expires_at`
4. Monotonic `last_verified_at` + signed expiry; lock UI when expired
5. Never store password locally

## 15. Proposed public graphics publishing design

Provider abstraction in `desktop/src/services/publishing/`. Phase E implements:
- Dev provider: local tunnel stub / mock public URL
- Production target: minimal NEUD publishing relay (static assets + live data WebSocket relay)
- Desktop remains source of truth; relay holds session token, expiration, revocation

## 16. Migration plan

| Phase | Scope |
|-------|-------|
| A | Audit, SQLite, paths, repos, local API skeleton, cleanup scripts |
| B | Move project/data source reads/writes local; Supabase export utility |
| C | Local-only engines, local graphics server endpoints, remove command queue |
| D | Offline auth cache, expiration lock, entitlement checks |
| E | Public publishing UI + provider |
| F | Remove hosted portal deps, manual Supabase cleanup |
| G | Bundle Chromium, installer, fresh-PC test |

## 17. Rollback and backup plan

- Automatic SQLite backup before each schema migration (`data/backups/`)
- Manual **Back Up Projects** action (Phase B)
- Supabase export scripts before destructive cleanup
- Rollback: restore SQLite backup, revert to previous app version, keep Supabase data until cleanup manually executed

## 18. File-change list (high level)

- **Add:** `desktop/src/database/*`, `desktop/src/repositories/*`, `desktop/src/services/local-api-server.ts`, `desktop/src/services/auth-*`, `desktop/src/services/publishing/*`, `scripts/migrate-from-supabase.mjs`, `supabase/cleanup/*`, `supabase/migrations/007_auth_entitlements.sql`
- **Modify:** `desktop/src/main.ts`, `app-paths.ts`, preload/IPCs, portal data layer (phased), worker to support local DB mode
- **Remove (Phase F):** Vercel config, remote worker queue code, dual-mode desktop client checks, cloud-only Server Actions

## 19. Risks and unresolved questions

1. **Signed offline token issuer** — needs Supabase Edge Function or small NEUD auth service (Phase D)
2. **better-sqlite3 native rebuild** for Electron packaging — mitigated with `@electron/rebuild`
3. **Next.js Server Components offline** — migrate data fetching to local API/IPC incrementally
4. **Public publishing relay** hosting/cost — deferred to Phase E
5. **Multi-user project members** — desktop assumes single operator per install; cloud members not migrated by default
6. **Password reset/invite** — may require minimal hosted auth companion pages
