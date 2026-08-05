# Slice 2.1 — Live Supabase validation matrix

Apply migrations **016**, **017**, and **018** to a **non-production** Supabase project only.

Do **not** apply migration 017 or 018 to hosted production until this matrix passes.

## Prerequisites

1. Local Supabase (`supabase start`) or a dedicated test project
2. Migrations applied through 018
3. Test users with profiles:
   - `owner@test` — platform owner/admin
   - `manager@test` — project manager member
   - `operator@test` — project operator member
   - `viewer@test` — project viewer member
   - `outsider@test` — authenticated but not a project member

Create a hosted project with a known UUID (`test-project-id`) and memberships:

| user | access_level |
|------|----------------|
| manager@test | manager |
| operator@test | operator |
| viewer@test | viewer |

Enable publishing as manager:

```sql
select public.set_project_online_publishing_enabled('test-project-id'::uuid, true);
```

## RPC authorization matrix

Use each user's access token as the Supabase `Authorization: Bearer` header (or sign in via client SDK).

| Test | Caller | RPC | Expected code |
|------|--------|-----|---------------|
| Anonymous rejected | none | any publishing RPC | `authentication_required` |
| Viewer cannot acquire lease | viewer | `acquire_project_publisher_lease` | `forbidden` |
| Viewer cannot publish | viewer | `publish_project_canonical_snapshot` | `forbidden` |
| Outsider forbidden | outsider | `acquire_project_publisher_lease` | `forbidden` |
| Operator may acquire lease | operator | `acquire_project_publisher_lease` | `lease_acquired` |
| Operator cannot disable publishing | operator | `set_project_online_publishing_enabled(false)` | `forbidden` |
| Manager may disable publishing | manager | `set_project_online_publishing_enabled(false)` | `settings_updated` |
| Owner/admin may register project | owner | `register_hosted_project_for_desktop` | `project_registered` |
| Wrong publisher instance renew | operator | `renew_project_publisher_lease` with wrong instance | `lease_not_owned` |
| Stale revision rejected | operator | publish with revision < latest | `stale_revision` |
| Duplicate hash | operator | publish unchanged hash | `duplicate_unchanged` |
| Payload > 1 MB | operator | publish oversized JSON | `payload_too_large` |
| Multibyte UTF-8 boundary | operator | payload with emoji/accents near 1 MB | `payload_too_large` at boundary |
| Publishing disabled | operator | acquire after disable | `publishing_disabled` |
| Audit user attribution | operator | publish snapshot | row has `published_by_user_id = auth.uid()` |

## Desktop validation

1. Sign in through NEUD desktop renderer
2. Confirm `%APPDATA%\\NEUD\\config\\supabase-user-session.enc` exists (encrypted)
3. Confirm `server.env` / packaged resources do **not** contain `SUPABASE_SERVICE_ROLE_KEY` for publishing-only smoke test
4. Enable publishing for a registered project
5. Sign out — publishing status becomes `authentication_required` / `cloud_session_required`
6. Sign in again — publishing resumes after session refresh

## Rollback

If 018 must be rolled back on a test project:

1. Re-apply 017 function bodies and `service_role` grants (from migration 017 file)
2. Drop 018 RLS policies if needed
3. Do not drop audit columns if snapshots already reference them

## Status in CI

Repository tests validate migration structure and desktop code paths only.

Live Supabase execution requires the manual steps above until a dedicated test harness is added.
