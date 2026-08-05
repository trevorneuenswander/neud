# Alpha v0.1.0 — Official Baseline

**Status:** Locked. Do not regress unless a later Alpha prompt explicitly requires a compatible change.

**Canonical version:** `0.1.0` (root `package.json`)

## Product scope at baseline

Alpha v0.1.0 represents the completed **local Broad Arrow workflow** and finalized display set for BAG-Graphics on the desktop-first NEUD platform.

### Locked display designs (no visual redesign)

| Display | Slug / identity | Notes |
|---------|-----------------|-------|
| Stream Bid Display | `stream-bid-display` | 3840×2160 transparent bid column, pip mask, slideshow, bid/reserve animations |
| Stream Ticker | `stream-ticker` | 3840×2160 lower ticker, 3 upcoming lots, marquee freeze on lot transition |
| Legacy Pylon | `legacy-pylon` / platform pylon routes | Canonical Broad Arrow pylon layout and behavior |
| Legacy Ticker | `legacy-ticker` / platform ticker routes | Legacy lot animations and marquee |

HTML layout, CSS geometry, animations, typography, scrolling, slideshow, bid behavior, and data presentation for these displays are **frozen**.

Only backward-compatible runtime or delivery changes are permitted in later Alphas.

### Completed local runtime behavior

- Electron desktop host with embedded Next.js UI
- Local SQLite under `%APPDATA%\NEUD\`
- Local API server on `127.0.0.1:8070`
- Webpage Scraper + Local Controller effective state
- Canonical project JSON (`canonical-project-data.ts`)
- `NEUDDisplay.subscribe()` display runtime (`public/neud-display-runtime.js`)
- Local display URLs via Next viewer shell: `/display/{projectId}/{slug}`
- Local HTML API: `127.0.0.1:8070/api/display/{projectId}/{slug}`
- SSE + polling for BAG live state; polling primary for display transport
- Display versioning, enable/disable, archive, developer-tools publish (local revisions)
- Stream display regression suite (`npm run test:stream-displays`, `validate:stream-displays`)

### Completed tests and validation (baseline)

- `npm run test:stream-displays` — 40 tests
- `npm run test:neud-display-runtime-handshake`
- `npm run validate:stream-displays`
- Broad Arrow display import and legacy ticker/pylon live integration tests
- Local controller lot persistence and canonical project data tests

### Explicitly not in v0.1.0

- Simultaneous Vercel-hosted live display delivery with cloud canonical snapshots
- Online JSON viewer on Vercel
- Desktop-to-cloud canonical publishing (beyond display HTML sync stub)
- Publisher-instance lease on cloud
- Signed read-only display access URLs (wired)
- Public publishing relay (Phase E stub only)

## Architecture decisions preserved

- **Local-first:** Desktop is authoritative for scraper, Local Controller, effective state, and local display delivery.
- **One display HTML revision** per display — same HTML usable locally and (future) online.
- **One canonical JSON shape** — `buildCanonicalProjectSnapshot()` / `NEUDDisplay.subscribe`.
- **No separate local vs online display HTML versions.**
- **Monorepo:** Root Next.js app + `@neud/desktop` workspace + `workers/data-engine`.
- **Vercel:** Existing `neud` project deploys root Next.js (transitional portal).
- **Supabase:** Auth + entitlements retained; display metadata sync tables (`012_displays.sql`).

## Reference documents

- [release-versioning.md](./release-versioning.md)
- [displays/html-data-contract.md](./displays/html-data-contract.md)
- [desktop-overhaul-audit.md](./desktop-overhaul-audit.md)
- [deployment.md](./deployment.md)
