# NEUD Alpha v0.3.1 — Team Admin Access & Hosted Display Rollout Notes

## Cloud last-Team-Admin safeguard — OWNER APPROVAL REQUIRED

**Status:** Prepared; **not applied** to production.

Desktop Users and Access (online) calls Supabase RPCs (`upsert_team_member` /
`remove_team_member`) through the cloud access bridge. Local SQLite last-Admin
guards alone do **not** protect hosted demote/remove.

### Draft migration

See: [`065_team_admin_last_admin_guard.DRAFT.sql`](./065_team_admin_last_admin_guard.DRAFT.sql)

| Item | Detail |
|------|--------|
| Purpose | Reject demote/remove when a team would be left with zero active Admins |
| Compatibility | Additive; no schema drops; existing multi-admin teams unchanged |
| Rollback | Restore RPC bodies from `045_access_role_model.sql` (or later superseding migration) |
| Nonproduction test | Apply draft on a Preview/branch Supabase project; demote sole admin → `last_team_admin_protected`; demote when two admins remain → success |
| Production | **Do not apply without explicit Owner approval** |

### Recommendation

Apply **before** or **immediately with** production portal deployment that enables
Team Admin Users and Access demote/remove on neud.io.

## Desktop Users and Access

- Route gate uses `canManageUsersAndAccess` (Owner or Team Admin).
- Team Admins may invite/promote/demote within administered teams.
- Local SQLite last-Admin protection in `AccessManagementService` (offline/local path).
- Team id bridging is unique local↔cloud only; same-name unrelated local teams do not share permissions.

## Hosted portal (neud.io)

- `/users` remaps to `/portal/users` before desktop-only catch-all redirect.
- Hosted Users page and nav admit Team Admins via `resolveAccessCapabilities`.
- Display list RPC errors are surfaced instead of a silent empty list.

## Hosted display source of truth

| Record | Source of truth |
|--------|-----------------|
| Display definitions / HTML revisions | Local SQLite; synced via Display Sync when online |
| Online viewer / published revision | Supabase `public.displays` after desktop Online Viewer publish |
| Project / team membership | Supabase + local cache |

Do not invent or silently upload local display rows.
