# Slice 2.2 — Live Supabase validation matrix

Apply migrations **016**, **017**, **018**, and **019** to a **non-production** Supabase project only.

Do **not** apply migrations 016–019 to hosted production until this matrix passes and the Slice 2.2 report is reviewed.

## Prerequisites

1. Local Supabase (`supabase start`) or a dedicated test project
2. Migrations applied through **019**
3. Vercel preview deployment with `SUPABASE_SERVICE_ROLE_KEY` set (for invite endpoint only)
4. Test users with profiles and project memberships:

| user | platform role | project access |
|------|---------------|----------------|
| owner@test | owner | manager on test project |
| admin@test | admin | manager on managed team project |
| manager@test | user | manager on test project |
| operator@test | user | operator on test project |
| viewer@test | user | viewer on test project |
| outsider@test | user | none |

Register hosted project UUID alignment:

```sql
select public.register_hosted_project_for_desktop(
  'test-project-id'::uuid,
  'test-project-slug',
  'Test Project'
);
```

## Display sync authorization

Sign in through NEUD desktop as each role. Confirm display sync uses authenticated session (no `server.env` service role).

| Test | Caller | Action | Expected |
|------|--------|--------|----------|
| Manager read displays | manager | list project displays | rows returned |
| Viewer read displays | viewer | list project displays | rows returned |
| Viewer write denied | viewer | upsert display metadata | RLS / permission error |
| Operator write allowed | operator | upsert display metadata | success |
| Cross-project read denied | operator | read other project displays | empty / denied |
| Cross-project write denied | operator | upsert to other project | denied |
| Project ID change blocked | manager | update display with new project_id | trigger / RLS error |
| Sign-out stops sync | any | sign out during sync | sync pauses, no further cloud writes |

## Activity sync authorization

| Test | Caller | Action | Expected |
|------|--------|--------|----------|
| Authenticated insert | operator | sync queued activity event | success, actor = auth.uid() |
| Forged actor rejected | operator | RPC with different actor_user_id in payload | ignored / actor forced to auth.uid() |
| Cross-project insert denied | operator | event for unassigned project | forbidden |
| Unauthorized event type | operator | unknown event type string | rejected by RPC allowlist |
| Offline queue resume | operator | queue offline, reconnect, sign in | events sync without duplicates |

## User directory authorization

| Test | Caller | RPC | Expected |
|------|--------|-----|----------|
| Owner global directory | owner | `get_authorized_users_directory` | permitted users, no auth secrets |
| Admin scoped directory | admin | `get_authorized_users_directory` | team/project scoped results |
| Operator project directory | operator | `get_accessible_project_users_directory` | project members only |
| Viewer project directory | viewer | `get_accessible_project_users_directory` | read-only member list |
| Outsider denied | outsider | either RPC | empty / forbidden |
| No auth.users enumeration | operator | direct `auth.users` query | denied by RLS |

## Identity administration (trusted server)

| Test | Caller | Endpoint | Expected |
|------|--------|----------|----------|
| Unauthenticated | none | `POST /api/desktop/admin/invite-user` | 401 |
| Viewer forbidden | viewer | invite user | 403 |
| Operator forbidden | operator | invite user | 403 |
| Admin permitted | admin | invite user to managed scope | 200 + invitation sent |
| Owner permitted | owner | invite user | 200 |
| No generic admin proxy | any | arbitrary Supabase Admin path | 404 / not exposed |
| No privileged error leak | viewer | invite attempt | stable JSON error, no stack/service key |

## Desktop host registration

| Test | Caller | RPC | Expected |
|------|--------|-----|----------|
| Authenticated host upsert | operator | `upsert_desktop_host_for_client` | success for authorized project |
| Outsider denied | outsider | same RPC | forbidden |

## Publishing regression (Slice 2.1)

Re-run Slice 2.1 publishing matrix after 019 apply to confirm no regression.

## Packaging validation

1. `npm run build:desktop`
2. Confirm `desktop/dist/**` contains no `SUPABASE_SERVICE_ROLE_KEY`, `getSupabaseMain`, or seeded secret
3. Confirm `desktop/dist/services/supabase-main.js` is absent (build cleanup)
4. Start packaged or dev desktop **without** `SUPABASE_SERVICE_ROLE_KEY` in environment
5. Confirm startup succeeds and local scraper/displays work

## Rollback

If 019 must be rolled back on a test project:

1. Drop 019 RLS policies and RPCs in reverse dependency order
2. Re-apply 018-only display policies if needed for transitional service-role sync (not for production desktop)
3. Do not drop audit columns referenced by existing rows

## Status in CI

Repository tests validate:

- Migration 019 structure
- Desktop source and `desktop/dist/**` secret scan
- Authenticated coordinator wiring
- Trusted admin route boundary

Live Supabase execution requires the manual steps above until a dedicated integration harness is added.
