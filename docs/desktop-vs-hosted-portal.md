# Desktop vs Hosted Portal (Alpha v0.1.1)

## Responsibilities

| Surface | Purpose |
|---------|---------|
| **NEUD Desktop (Electron)** | Scrape, control, edit, render, and publish graphics. Local SQLite is source of truth. |
| **Hosted web portal (Vercel)** | Marketing, authentication, account management, and **view-only** access to displays explicitly published online from desktop. |

## Route separation

- **Desktop operational routes:** `/dashboard`, `/projects/*`, scraper, controller, display editor, developer tools, settings.
- **Hosted portal routes:** `/portal`, `/portal/projects`, `/portal/projects/[slug]/displays`, `/portal/users`, `/portal/profile`.
- **Public marketing:** `/`, `/download`, `/login`.
- **Public viewers:** `/view/[projectSlug]/[displaySlug]` (public visibility only).

Runtime detection uses `NEUD_USE_LOCAL_DATA=1` (server) and `window.neudDesktop` (client). See `src/lib/runtime/environment.ts`.

Middleware redirects hosted requests away from desktop-only paths (`src/lib/supabase/proxy.ts`).

## Online viewer publishing flow

1. Operator enables **Online Viewer** on a display in the desktop display editor.
2. Settings persist in local SQLite (`project_display_code`) and sync to Supabase `displays` columns:
   - `online_viewer_enabled`
   - `online_visibility` (`private` | `public`)
   - `online_published_at` / `online_published_revision_id`
3. Display HTML revisions sync through existing display sync (`DisplaySyncService`).
4. Live canonical payload syncs through existing `PublishingManager` → `publish_project_canonical_snapshot`.
5. Hosted viewer loads HTML + canonical payload via RPC `get_online_display_viewer_bundle`.
6. Parent page delivers live updates using the NEUD display runtime handshake (`NEUD_DISPLAY_READY` → `NEUD_DATA_UPDATE`).

## Private vs public access

- **Private:** `/portal/projects/[slug]/displays/[displaySlug]` — requires authenticated project membership (Viewer+ via `can_view_project`).
- **Public:** `/view/[projectSlug]/[displaySlug]` — no login; RPC enforces `online_visibility = public` and `online_viewer_enabled = true`.
- Unauthorized callers receive uniform `not_found` — no leak of private resource existence.

## Viewer bundle (safe fields)

Returned by `get_online_display_viewer_bundle`:

- Project: `slug` (and `name` for authenticated callers only)
- Display: slug, name, description, resolution, refresh rate, visibility, published revision id, online published timestamp
- `html_content` from `online_published_revision_id` only
- `canonical_payload` — sanitized `data` object for rendering
- `canonical_revision`, `data_updated_at`, `stale`, `source_offline`

Not returned: memberships, user records, secrets, scraper config, draft revisions, publishing internals.

## Runtime handshake

Hosted viewer (`HostedDisplayViewerClient`):

1. Loads pinned HTML once per revision (`prepareHostedDisplayDocument`).
2. Waits for iframe `NEUD_DISPLAY_READY`.
3. Pushes `NEUD_DATA_UPDATE` with canonical snapshot.
4. Polls RPC at normalized refresh rate; updates via postMessage only.

## Activity events

Dedicated online viewer events (cloud allowlist in migration 024):

- `display.online_viewer_enabled` / `display.online_viewer_disabled`
- `display.online_visibility_changed`
- `display.online_published` / `display.online_publish_failed` / `display.online_publish_resumed`

## Deferred milestones

- **Public Canonical JSON URLs** — not implemented; desktop `/projects/[slug]/canonical` redirects to project overview.
- **Remote web controller** — Beta milestone; not implemented in v0.1.1.
- **Installer delivery** — download page exists; packaged installer pending.

## Heartbeat and stale behavior

Hosted viewers treat publishing as stale/offline when:

- Publisher lease is missing, released, or expired, or
- `project_publishing_settings.last_successful_publish_at` is older than ~45 seconds.

UI copy: **Source Offline — The publishing desktop has stopped sending updates.**

Recovery: automatic on next successful publish poll — no full page reload required.

## Manual validation

See [alpha-v0.1.1-manual-validation-checklist.md](./alpha-v0.1.1-manual-validation-checklist.md).
