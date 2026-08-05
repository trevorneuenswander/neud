# Alpha v0.1.1 — Online Delivery Plan

**Status:** Implementation complete in repository — pending migration 024 apply + Vercel Preview validation.

**Application version during this milestone:** `0.1.0` (unchanged until full sign-off)

**Prerequisite baseline:** [alpha-v0.1.0-baseline.md](./alpha-v0.1.0-baseline.md) (locked — do not modify)

**Manual checklist:** [alpha-v0.1.1-manual-validation-checklist.md](./alpha-v0.1.1-manual-validation-checklist.md)

---

## Desktop vs hosted responsibilities

| Surface | Role |
|---------|------|
| **NEUD Desktop (Electron)** | Authoritative for scraping, overrides, display editing, local preview, cloud publishing, display sync, and per-display Online Viewer controls. Local SQLite is source of truth. |
| **Hosted web (Vercel)** | Marketing, authentication, account/team management, project portal (view-only), and online display viewing for displays explicitly published from desktop. |

See also [desktop-vs-hosted-portal.md](./desktop-vs-hosted-portal.md).

---

## Hosted route map

| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Marketing home |
| `/download` | Public | Download page (installer delivery pending) |
| `/login` | Public | Supabase auth → `/portal` |
| `/portal` | Authenticated | Portal dashboard |
| `/portal/projects` | Authenticated | Project list |
| `/portal/projects/[slug]/displays` | Authenticated | Online-enabled displays for project |
| `/portal/projects/[slug]/displays/[displaySlug]` | Authenticated + project membership | Private online viewer |
| `/view/[projectSlug]/[displaySlug]` | Public (RPC-enforced) | Public online viewer |
| `/portal/users`, `/portal/profile` | Authenticated | Account management |

**Desktop-only routes** (redirect to `/portal` on hosted web): `/dashboard`, `/projects/*` operational paths, scraper, controller, developer tools, data engines, settings, display editor.

Runtime detection: `NEUD_USE_LOCAL_DATA` (server) + `window.neudDesktop` (client). Middleware guards in `src/lib/supabase/proxy.ts`.

---

## Online viewer schema (Supabase migration 024)

New columns on `public.displays`:

- `online_viewer_enabled` — per-display online availability
- `online_visibility` — `private` | `public`
- `online_published_at` — timestamp when online viewing was enabled/published
- `online_published_revision_id` — pinned HTML revision served to viewers
- `online_publish_error` — last sync error (desktop → cloud)

RPCs:

- `get_online_display_viewer_bundle(project_slug, display_slug)` — viewer payload
- `list_online_project_displays(project_id)` — authenticated portal listing

---

## Private/public authorization model

| Caller | Enabled public display | Enabled private display | Disabled display |
|--------|------------------------|-------------------------|------------------|
| Anonymous | Allowed via `/view/...` | `not_found` (no leak) | `not_found` |
| Authenticated Viewer+ | Allowed | Allowed via `/portal/.../displays/...` | `not_found` |
| Unrelated authenticated user | `not_found` for private | `not_found` | `not_found` |

Enforcement: `SECURITY DEFINER` RPC with `search_path = public`, `can_view_project()` for private displays, uniform `not_found` for unauthorized/missing resources.

**RPC grants:**

- `get_online_display_viewer_bundle` → `anon`, `authenticated` (not `service_role`)
- `list_online_project_displays` → `authenticated` only

---

## Display-specific publishing

1. Operator enables **Online Viewer** on one display in desktop display editor (`OnlineViewerPanel`).
2. Settings persist in SQLite (`project_display_code`) and sync to Supabase via `DisplaySyncService`.
3. `online_published_revision_id` pins the HTML revision — not `active_revision_id` drafts.
4. Live canonical data flows through existing `PublishingManager` → `publish_project_canonical_snapshot`.
5. Hosted viewer loads bundle via RPC; parent page pushes updates over postMessage.

---

## Published revision behavior

- Only `online_published_revision_id` HTML is returned in the viewer bundle.
- Draft/unpublished revisions are never exposed.
- When desktop publishes a new revision while online viewer is enabled, display sync updates `online_published_revision_id` and emits `display.online_published`.

---

## Live canonical delivery

- Canonical snapshot stored in `project_canonical_snapshots` (sanitized at publish time).
- Viewer bundle returns `payload.data` only (render fields — no envelope secrets).
- `canonical_revision` and `data_updated_at` exposed for runtime handshake and stale UI.

---

## Runtime handshake (hosted viewer)

Contract aligned with `display-runtime-contract.ts` / `public/neud-display-runtime.js`:

1. Iframe loads published HTML with injected `NEUDDisplay` bridge (`prepareHostedDisplayDocument`).
2. Display signals `NEUD_DISPLAY_READY` (`source: neud-display`).
3. Parent responds with `NEUD_DATA_UPDATE` (`source: neud-runtime`, `version: 1`, `payload`, `revision`).
4. Subsequent polls update data via postMessage only — iframe reloads only when `published_revision_id` changes.
5. Origin validated against `window.location.origin`; listeners cleaned up on unmount.

Refresh rate: normalized via `normalizeDisplayRefreshRateMs` (1000–60000 ms, default 5000).

---

## Heartbeat and stale threshold

Hosted viewer marks **stale/offline** when:

- Publisher lease missing, released, or expired, **or**
- `project_publishing_settings.last_successful_publish_at` older than ~45 seconds

UI: **Source Offline — The publishing desktop has stopped sending updates.**

When publishing resumes, viewer recovers on next poll without requiring a full page reload.

---

## Activity events (online viewer)

Allowlisted in migration 024 `upsert_activity_events_for_sync`:

| Event | When |
|-------|------|
| `display.online_viewer_enabled` | Operator enables online viewer |
| `display.online_viewer_disabled` | Operator disables online viewer |
| `display.online_visibility_changed` | Private ↔ public while enabled |
| `display.online_published` | Cloud sync pins new online revision |
| `display.online_publish_failed` | Display sync fails while online viewer enabled |
| `display.online_publish_resumed` | Sync succeeds after prior error |

**Not logged:** heartbeats, canonical payload updates, viewer polls, secrets, raw HTML, raw canonical payloads.

---

## Explicitly deferred

| Item | Status |
|------|--------|
| Public Canonical JSON URLs | Deferred — desktop `/projects/[slug]/canonical` redirects to overview |
| Remote browser control | Deferred to Beta |
| Signed opaque display tokens | Planning only |
| macOS packaging / auto-update | Out of scope |
| Production deploy | Gate in manual checklist |
| Installer delivery | Pending |

---

## Validation

### Automated (repository-local)

```powershell
npm run test:neud-hosted-portal
npm run test:neud-online-viewer-security
npm run test:neud-hosted-viewer-handshake
npm run test:neud-publishing
npm run test:neud-published-project
npm run test:neud-canonical-project-data
npm run test:neud-display-runtime-handshake
npm run test:stream-displays
npm run test:neud-release-version
npm run test:neud-release-security
npm run test:activity-sync
npm run build
npm run build:desktop
```

### Manual (requires credentials)

See [alpha-v0.1.1-manual-validation-checklist.md](./alpha-v0.1.1-manual-validation-checklist.md):

- Supabase: `apply:live-migrations`, `audit:live-security`, `test:live-validation`
- Desktop: enable/disable online viewer, visual display check
- Vercel Preview: `npx vercel --archive=tgz` (**no `--prod`**)

---

## Security model summary (migration 024)

- Minimal viewer bundle: project slug (name only for authenticated), display metadata, pinned HTML, sanitized canonical `data`, revision, stale flags, safe timestamps.
- Excludes: users, memberships, emails, secrets, scraper config, unpublished revisions, internal publishing diagnostics, raw JSON endpoints.
- Invalid slugs return uniform `not_found`.
- `service_role` cannot execute viewer RPCs; `anon` cannot list displays or invoke publishing mutations.

---

## Version strategy

| Phase | Version |
|-------|---------|
| Current (Alpha v0.1.1 implementation) | `0.1.0` |
| After full online delivery sign-off | `0.1.1` (future bump) |

Do not bump `package.json` version until Trevor approves release promotion.
