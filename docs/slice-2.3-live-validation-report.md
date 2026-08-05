# Slice 2.3 — Live validation report

**Application version:** 0.1.0  
**Validation pass:** Slice 2.3 live validation and release-security sign-off (resumed)  
**Slice 3 decision:** **NO-GO**

Do **not** apply migrations 016–021 to production until this report is reviewed and live validation completes.

---

## Environment

| Item | Value |
|------|-------|
| Non-production Supabase project ref | `abtvefbwnismoqweokqu` |
| Public Supabase host | `abtvefbwnismoqweokqu.supabase.co` (from `.env.local`) |
| Secret handling method | Dedicated gitignored `.env.live-validation.local` (see `.env.live-validation.local.example`) |
| `NEUD_SUPABASE_DB_URL` | **Not configured** — `.env.live-validation.local` absent; migration apply blocked |
| `NEUD_TRUSTED_PORTAL_ORIGIN` | **Not configured** — Vercel preview invite tests blocked |
| Vercel preview URL | Not deployed in this pass |
| Application version | **0.1.0** (confirmed) |

### Validation preflight (secret-safe)

| Check | Result |
|-------|--------|
| Target project ref guard | Implemented in `scripts/live-validation/lib/env.mjs` (`NEUD_LIVE_VALIDATION_PROJECT_REF=abtvefbwnismoqweokqu`) |
| Public URL and DB URI ref cross-check | Implemented — abort if mismatch |
| `.env.live-validation.local` gitignored | **Pass** (via `.env*` rule) |
| Excluded from Electron staging | **Pass** (`stage-standalone.mjs` skip list) |
| Excluded from release security scan pattern | **Pass** (`release-security-scan.mjs`) |
| Desktop reads `NEUD_SUPABASE_DB_URL` | **Pass** — no desktop references |

---

## Pre-migration schema state (observed, prior pass)

| Check | Result |
|-------|--------|
| `public.displays` | Present |
| `public.profiles` | Present |
| `public.project_publishing_settings` | **Absent** — migration 016 not applied |
| `register_hosted_project_for_desktop` RPC | **Absent** |
| Migrations 016–021 applied | **No** |

Recovery plan: disposable non-production project; dashboard backup before apply.

---

## Migration application (016–021)

| Migration | Status | Notes |
|-----------|--------|-------|
| 016 | ☐ Not applied | Blocked — missing `.env.live-validation.local` |
| 017 | ☐ Not applied | Same |
| 018 | ☐ Not applied | Same |
| 019 | ☐ Not applied | Same |
| 020 | ☐ Not applied | Same |
| 021 | ☐ Not applied | Same |

**Apply command (non-production only):**

```bash
cp .env.live-validation.local.example .env.live-validation.local
# Add NEUD_SUPABASE_DB_URL (Postgres URI) — never commit
npm run apply:live-migrations
npm run audit:live-security
npm run test:live-validation
```

Migration tooling hardened in this pass:

- Loads DB URI only from `.env.live-validation.local`
- Compares `NEUD_LIVE_VALIDATION_PROJECT_REF` against public URL **and** DB host
- Transaction-wrapped apply with checksum tracking in `_neud_validation_migrations`
- Sanitized error output (no credentials logged)
- Stops on first failure

---

## Final SQL security audit

| Status | Notes |
|--------|-------|
| ☐ Not run | Requires migrations 016–021 applied |

Command: `npm run audit:live-security`  
Output: `docs/slice-2.3-security-audit-results.json` (sanitized)

---

## Live Supabase validation

| Area | Status |
|------|--------|
| Migration 021 abuse controls (live) | Not run |
| Publishing settings matrix | Not run |
| Publisher lease matrix | Not run |
| Snapshot publish matrix | Not run |
| Display sync RLS matrix | Not run |
| Activity sync RPC matrix | Not run |
| Directory RPC matrix | Not run |
| Expanded live matrix script | **Ready** (`scripts/live-validation/run-live-matrix.mjs`) |

---

## Trusted invitation endpoint

| Check | Status | Type |
|-------|--------|------|
| Desktop uses `NEUD_TRUSTED_PORTAL_ORIGIN` | **Pass** | Structural |
| Packaged desktop without origin fails safely | **Pass** | Structural |
| Dev fallback only with `NEUD_DESKTOP_DEV=1` | **Pass** | Structural |
| Invite route rate limit (10/min) + sanitized errors | **Pass** | Structural |
| Live Vercel preview invite test | **Not run** | Live Vercel |

---

## Packaged Windows release

| Check | Status | Type |
|-------|--------|------|
| `npm run build:desktop` | **Pass** | Build |
| `NEUD_BUILD_RELEASE=1` full win-unpacked + app.asar scan | **Pass** (14/14 release-security tests) | Packaged |
| `desktop/release/win-unpacked/NEUD.exe` | **Present** | Artifact |
| `NEUD Setup 0.1.0.exe` | **Present** | Artifact |
| Local worker: no `supabase.js`, no `@supabase` in staged worker | **Pass** | Packaged |
| App-owned code: no service-role usage | **Pass** | Packaged |
| Embedded Next.js: route identifier strings only, no credential values | **Pass** (scoped scan) | Packaged |
| Packaged runtime smoke (manual) | **Partial** — `NEUD.exe` launched 8s without crash; full session matrix not run | Manual |
| Desktop E2E session | **Not run** | Manual |

---

## Completed displays

No display code modified in this pass. Stream Bid Display, Stream Ticker, Legacy Pylon, and Legacy Ticker remain unchanged.

Stream displays regression: **40/40 pass**.

---

## Structural / regression results

| Suite | Result |
|-------|--------|
| `test:neud-publishing` | 31/31 pass |
| `test:neud-published-project` | 12/12 pass |
| `test:neud-canonical-project-data` | 4/4 pass |
| `test:neud-release-version` | 13/13 pass |
| `test:stream-displays` | 40/40 pass |
| `test:neud-display-runtime-handshake` | 5/5 pass |
| `test:neud-release-security` (+ portal + 021) | 14/14 pass |
| Migration 021 structural tests | 2/2 pass |
| Trusted portal origin structural tests | 3/3 pass |
| `npm run build -w @neud/desktop` | Pass |
| `npm run build` (root Next.js) | Pass |

---

## Tests added or corrected (this pass)

| Item | Change |
|------|--------|
| `scripts/live-validation/lib/env.mjs` | Project ref guard, dedicated env file loader |
| `scripts/live-validation/lib/migrations.mjs` | Transaction apply, checksum tracking, preflight probe |
| `scripts/live-validation/lib/sanitize.mjs` | Credential-safe error/audit sanitization |
| `scripts/live-validation/run-security-audit.mjs` | Post-021 SQL audit runner |
| `scripts/live-validation/run-live-matrix.mjs` | Expanded publishing/display/activity/directory matrix |
| `desktop/scripts/lib/release-security-scan.mjs` | Scoped scan: app-owned vs library vs embedded Next.js |
| `.env.live-validation.local.example` | Dedicated validation secret template |

---

## Production migration runbook

`docs/production-migration-runbook-v0.1.1.md` — **Draft complete**, pending non-production timing estimates from live apply.

---

## Remaining limitations

| Issue | Severity |
|-------|----------|
| Migrations 016–021 not applied (missing DB URI file) | **Critical** |
| Live authorization matrix not executed | **Critical** |
| Post-apply SQL audit not executed | **Critical** |
| Vercel preview invite not live-tested | **High** |
| Packaged runtime smoke not executed | **High** |
| Desktop E2E session not executed | **High** |
| 25-project / concurrent registration atomicity not live-tested | **Medium** |
| Registration cooldown resume (5 min) not live-tested | **Low** |

---

## Slice 3 go/no-go

### Slice 3: **NO-GO**

Required before GO:

1. Create `.env.live-validation.local` with non-production `NEUD_SUPABASE_DB_URL`
2. Apply migrations 016–021 via `npm run apply:live-migrations`
3. Pass `npm run audit:live-security`
4. Pass `npm run test:live-validation`
5. Deploy Vercel preview; configure `NEUD_TRUSTED_PORTAL_ORIGIN`; live-test invites
6. Complete packaged runtime smoke and desktop E2E session
7. Review production migration runbook with live timing data

**Slice 3 has not been started.**
