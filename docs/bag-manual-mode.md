# BAG Manual Mode

Manual Mode lets an operator keep the BAG graphic on air when the scraper disconnects or produces incorrect data. Manual changes update the same SQLite live state, SSE stream, controller, and OBS display used in Automatic Mode.

## Architecture

```text
Scraper Snapshot
      ↓
Latest Automatic State
      ↓
BAG Live-State Service
      ├── Automatic Mode → Active State
      └── Manual Mode → Manual Active State
                              ↓
                    SQLite + SSE + JSON
                         ├── Controller
                         └── OBS Display
```

## Precedence

Active rendered state resolves in this order:

```text
active manual state
→ latest valid scraper state
→ last persisted valid state
→ empty state
```

While Manual Mode is active:

- Scraper snapshots are still normalized and stored as `automatic_state_json`.
- The on-air `state_json` remains the manual working state.
- The controller receives automatic comparison metadata.
- The OBS display reads only the active `state` field from JSON/SSE.

Returning to Automatic Mode is deliberate. The scraper reconnecting does not silently resume automatic control.

## Database changes

Migration `004_bag_manual_mode.sql` extends `bag_live_state`:

| Column | Purpose |
| --- | --- |
| `automatic_state_json` | Latest normalized scraper state |
| `manual_state_json` | Active manual working state |
| `manual_started_at` | Manual session start timestamp |
| `manual_started_by` | Operator email/id when available |

Audit history is stored in `bag_manual_events`:

| Column | Purpose |
| --- | --- |
| `event_type` | Action name |
| `previous_value_json` | Relevant previous value |
| `next_value_json` | Relevant new value |
| `details_json` | Optional metadata |
| `created_by` | Operator identifier |

Credentials and scraper configuration are not written to audit rows.

## Mutation API

All mutation routes require authenticated local desktop access and a `bag-graphics` project.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/projects/:projectId/bag/manual/enter` | POST | Enter Manual Mode |
| `/api/projects/:projectId/bag/manual/exit` | POST | Resume Automatic Mode |
| `/api/projects/:projectId/bag/manual/previous` | POST | Previous lot |
| `/api/projects/:projectId/bag/manual/next` | POST | Next lot |
| `/api/projects/:projectId/bag/manual/select` | POST | Jump to lot |
| `/api/projects/:projectId/bag/manual/lot` | PATCH | Edit current lot fields |
| `/api/projects/:projectId/bag/manual/bid` | POST | Exact bid |
| `/api/projects/:projectId/bag/manual/bid/adjust` | POST | Increment/decrement bid |
| `/api/projects/:projectId/bag/manual/bid/calculate` | POST | Preview calculator result |
| `/api/projects/:projectId/bag/manual/bid/apply-calculator` | POST | Apply calculator result |
| `/api/projects/:projectId/bag/manual/status` | POST | Mark sold or passed |
| `/api/projects/:projectId/bag/manual/status/clear` | POST | Clear sold/pass state |

Read-only routes remain unauthenticated on loopback:

- `GET /api/projects/:projectId/bag/live`
- `GET /api/projects/:projectId/bag/live/events`
- `GET /api/projects/:projectId/bag/display`

`GET /bag/live` now returns a controller envelope:

```json
{
  "state": { "...active on-air state..." },
  "automaticState": { "...latest scraper state..." },
  "manualSession": null,
  "automaticComparison": null
}
```

OBS consumers should continue to use `state` only.

## Controller controls

The BAG controller page exposes:

- Automatic/Manual mode switch
- Manual lot navigation
- Editable lot number and title
- Exact bid entry
- Bid increment buttons: `-5000`, `-1000`, `-500`, `+500`, `+1000`, `+5000`
- Calculator preview and apply
- Sold / Passed / Clear status actions
- Automatic comparison panel while Manual Mode is active
- Resume Automatic confirmation dialog

Controls are disabled while a mutation is pending.

## Scraper behavior during Manual Mode

When a snapshot arrives in Manual Mode:

1. Normalize it normally.
2. Save it to `automatic_state_json`.
3. Update connection metadata on the manual active state.
4. Publish SSE with unchanged on-air manual `state`.
5. Include automatic comparison data for the controller.

## Resume Automatic workflow

Before exiting Manual Mode, the controller shows:

- current manual lot and bid
- latest automatic lot and bid
- latest automatic update time

On confirmation:

1. Active state becomes the latest valid automatic state.
2. Manual override metadata is cleared.
3. Mode returns to `automatic`.
4. An audit row is written.
5. SQLite and SSE update immediately.

If no valid automatic state exists, exit is blocked with an error.

## Bid calculator rules

Supported inputs:

- plain numbers: `42000`, `42,000`, `$42,000`
- expressions: `42000 + 1000`, `42000 - 500`, `current + 1000`, `current - 500`
- optional parentheses for grouped arithmetic

The parser accepts only numbers, commas, currency symbols, `current`, `+`, `-`, and parentheses. It does not use `eval()`.

Invalid expressions return actionable validation errors.

## Audit history

Recorded actions include:

- entered Manual Mode
- exited Manual Mode
- previous/next/jump lot selection
- lot field edits
- exact bid changes
- bid adjustments
- sold / passed / clear status

Audit persistence failures are logged but do not block live mutations.

## Restart recovery

After restarting the desktop app while Manual Mode is active:

- Manual Mode remains active.
- Manual lot and bid remain on air.
- Latest automatic state remains available.
- The controller shows a one-time restored-session notice.

## Failure behavior

- Invalid manual patches preserve the previous on-air state.
- Invalid snapshots during Manual Mode do not replace manual lot/bid data.
- Missing automatic state blocks resume-to-automatic.
- Non-BAG projects and unauthenticated callers cannot mutate manual state.

## Future auction export integration

Manual Mode persistence is designed to remain compatible with a future auction export/import milestone:

- `bag_manual_events` provides operator traceability.
- `automatic_state_json` preserves the latest scraper truth separately from manual overrides.
- A future export job can serialize `bag_live_state`, `bag_manual_events`, and auction lot ordering without changing the on-air pipeline.

Recommended next task: auction JSON export/import with restore preview and selective merge of manual vs automatic history.
