# BAG Local Live State

This document describes the local BAG live-state pipeline introduced after the desktop SQLite foundation and BAG source seeding milestones.

## Purpose

Transform raw BAG scraper snapshots into a stable, normalized auction state and expose it to:

- the BAG operator controller page
- the OBS/browser display page
- local JSON and SSE update endpoints

## Architecture

```text
Auction Site
    ↓
Puppeteer Worker (bag-auction adapter)
    ↓
Raw BAG Snapshot (SQLite data_source_snapshots)
    ↓
BagSnapshotNormalizer
    ↓
BagLiveStateService
    ├── SQLite bag_live_state
    ├── GET /api/projects/:projectId/bag/live
    ├── GET /api/projects/:projectId/bag/live/events (SSE)
    ├── GET /api/projects/:projectId/bag/display (OBS HTML)
    ├── GET /api/projects/:projectId/bag/controller (metadata)
    ├── Portal /projects/:slug/controller
    └── OBS browser source URL
```

## Normalized state schema

Version: `schemaVersion: 1`

Key fields:

- `projectId`, `engineId`
- `mode`: `automatic` or `manual` (manual reserved for a future milestone)
- `connection`: scraper connection metadata (`stopped`, `starting`, `connected`, `scraping`, `disconnected`, `retrying`, `error`)
- `currentLot`, `previousLot`, `nextLots`, `lastSold`, `lots`, `lotCount`
- `source`: `{ type, snapshotId, capturedAt }`
- `updatedAt`

Portal-facing types live in `src/lib/bag/types.ts`.

Desktop implementation lives in `desktop/src/bag/live-state/`.

## Snapshot normalization

The normalizer derives state from the actual `bag-auction.js` snapshot payload:

- `prev`, `current`, `next`, `lots`
- `lastSold`
- `auctionDisplay`
- `updatedAt`

Current lot selection prefers merged `auctionDisplay` + `current` data. Bid labels are parsed from strings such as `$ 15,500`. Sold/pass flags come from lot status text when available.

## Precedence model

Future intended precedence:

```text
manual override
→ restored local state
→ latest valid scraper state
→ last persisted valid state
→ empty state
```

Current automatic-only precedence:

```text
latest valid scraper state
→ last persisted valid state
→ empty state
```

Invalid snapshots preserve the previous valid live state and record a normalization error in connection metadata.

## Persistence

Migration: `desktop/src/database/migrations/003_bag_live_state.sql`

Table: `bag_live_state`

- one current row per BAG project
- survives application restart
- stores versioned JSON in `state_json`

## Update flow

1. Worker POSTs snapshot to local API.
2. `LocalDataService.recordSnapshot()` persists the snapshot.
3. `BagLiveStateService.processSnapshot()` normalizes and upserts live state.
4. `BagLiveStateEvents` publishes `bag.live-state.updated`.
5. Controller and OBS display consumers update through SSE (with initial HTTP fetch fallback).

Engine status changes (`recordStatus`, run success/failure) also refresh connection metadata through `syncEngineStatus()`.

## Local API endpoints

Base: `http://127.0.0.1:8070`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:projectId/bag/live` | Normalized current state JSON |
| GET | `/api/projects/:projectId/bag/live/events` | SSE live-state updates |
| GET | `/api/projects/:projectId/bag/display` | OBS browser-source HTML |
| GET | `/api/projects/:projectId/bag/controller` | Controller metadata (display URL, live URL, engine id) |

Notes:

- `:projectId` is the project UUID.
- Non-`bag-graphics` projects receive `400`.
- Unknown projects receive `404`.
- Display and live JSON endpoints are read-only and local-only.

## Real-time transport

Server-Sent Events on `/bag/live/events`.

Event name: `bag.live-state.updated`

Payload:

```json
{
  "type": "bag.live-state.updated",
  "projectId": "...",
  "state": { "...": "..." }
}
```

Connections are cleaned up when the client disconnects. Consumers still fetch `/bag/live` immediately on load.

## Controller route

Portal route:

```text
/projects/:slug/controller
```

Available for `bag-graphics` projects in desktop local mode.

Shows:

- connection status
- automatic mode
- current lot summary
- lot count and last update
- OBS display URL copy action
- existing Start / Stop / Restart / Run Once engine controls

## OBS display URL

Stable local URL:

```text
http://127.0.0.1:8070/api/projects/{projectId}/bag/display
```

Characteristics:

- transparent background
- 1920×1080 layout
- no portal chrome
- no authentication required on loopback
- keeps showing last valid lot during scraper failures

## Startup recovery

On Electron startup, `BagLiveStateService.recoverAllProjects()` loads persisted state or derives it from the latest compatible snapshot.

When a BAG project/controller/display is opened, `ensureLiveState()` performs the same recovery if needed.

## Failure behavior

- Invalid snapshot: preserve previous lot, log normalization warning, expose error in connection metadata.
- Scraper stopped: connection status moves to `stopped`, last valid lot remains visible.
- Missing snapshot: valid empty state with `currentLot: null`.
- Malformed persisted JSON: repository throws an actionable parse error.

## Future Manual Mode integration

Manual Mode should write to the same `bag_live_state` row and `BagLiveState` schema with:

- `mode: "manual"`
- `source.type: "manual"`

The service layer should later enforce the full precedence chain without introducing a second display data path.
