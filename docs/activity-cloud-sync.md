# Activity Cloud Synchronization

NEUD Activity events are synchronized bidirectionally between local SQLite (offline cache) and Supabase PostgreSQL (authoritative cloud store).

## Current cloud schema (transitional)

Migration `supabase/migrations/011_activity_events.sql` creates `public.activity_events` with:

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | Primary key; globally unique event identity / idempotency key |
| `project_id` | `uuid` | Logical project reference (no FK yet) |
| `team_id` | `uuid` | Logical team reference (no FK yet) |
| `user_id` | `uuid` | Logical user reference (no FK yet) |
| `actor_display_name` | `text` | Display-name snapshot for historical readability |
| `event_type` | `text` | Stable event type |
| `description` | `text` | Clean description (no duplicated actor name) |
| `metadata` | `jsonb` | Structured metadata |
| `source` | `text` | Optional source label |
| `severity` | `text` | `info`, `warning`, or `error` |
| `source_instance_id` | `uuid` | NEUD installation ID (`neud.instanceId`) |
| `source_local_id` | `text` | Original local row ID |
| `occurred_at` | `timestamptz` | When the event occurred |
| `created_at` | `timestamptz` | Server creation time |
| `updated_at` | `timestamptz` | Server update time |
| `deleted_at` | `timestamptz` | Optional soft-delete tombstone |

## Why foreign keys are deferred

The hosted Supabase project currently retains authentication tables (`profiles`, `auth.users`, entitlements) but **does not** contain cloud-authoritative `projects`, `teams`, or membership tables. Those were removed during the desktop-first cleanup (`supabase/cleanup/desktop_only_destructive_cleanup.sql`).

Activity sync therefore stores `project_id`, `team_id`, and `user_id` as plain UUID columns without database foreign-key constraints. Desktop authorization is enforced in the application layer via `AccessAuthorizationService`.

## Transitional RLS behavior

Row Level Security is **enabled** on `activity_events`, but **no authenticated-user policies** are defined yet.

| Role | Access |
|------|--------|
| `service_role` | Full access (bypasses RLS automatically) |
| `authenticated` | Denied by default (no matching policy) |
| `anon` | Denied by default |

This is intentional and secure because:

1. Desktop Activity sync uses the service role in the main process only (never exposed to the renderer).
2. Upload and pull filtering run through `AccessAuthorizationService` before cloud writes and after cloud reads.
3. Authenticated portal clients cannot read or insert Activity until membership-aware policies exist.
4. No `using (true)` or unrestricted insert policies were added.

## Conflict policy

Activity events are append-only. The cloud UUID is the idempotency key. Retries use upsert-on-conflict by `id`. Local stale records must not overwrite newer cloud data on pull.

## Future migration: foreign keys

After cloud Project, Team, and User synchronization is implemented, apply a new migration similar to:

```sql
-- PLACEHOLDER — do not run until cloud projects/teams/users exist.

alter table public.activity_events
  add constraint activity_events_project_id_fkey
  foreign key (project_id)
  references public.projects (id)
  on delete set null;

-- alter table public.activity_events
--   add constraint activity_events_team_id_fkey
--   foreign key (team_id)
--   references public.teams (id)
--   on delete set null;

alter table public.activity_events
  add constraint activity_events_user_id_fkey
  foreign key (user_id)
  references auth.users (id)
  on delete set null;
```

Adjust table and column names to match the final cloud schema.

## Future migration: membership-aware RLS

After `public.projects`, team membership tables, and helper functions such as `is_project_member()` exist in the hosted database, add policies such as:

```sql
-- PLACEHOLDER — do not run until membership helpers exist.

create policy activity_events_select_member
  on public.activity_events
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_platform_admin()
      or (
        project_id is not null
        and public.is_project_member(project_id)
      )
      or (
        project_id is null
        and user_id = auth.uid()
      )
    )
  );

create policy activity_events_insert_member
  on public.activity_events
  for insert
  to authenticated
  with check (
    deleted_at is null
    and (
      public.is_platform_admin()
      or (
        project_id is not null
        and public.is_project_member(project_id)
      )
      or (
        project_id is null
        and user_id = auth.uid()
      )
    )
  );

create policy activity_events_update_admin
  on public.activity_events
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
```

## Retention and backup

- Cloud Activity is the authoritative shared audit trail.
- Activity is retained permanently by default; soft-delete uses `deleted_at`.
- Deleted or renamed users retain historical attribution via `actor_display_name`.
- Project deletion should set `project_id` to null (via future FK `on delete set null`) rather than silently removing audit history.

## Local migration command

```bash
npm run migrate:activity-to-cloud -- --dry-run
npm run migrate:activity-to-cloud -- --batch-size=50 --resume
```

## Production readiness checklist

1. Apply `011_activity_events.sql` to hosted Supabase.
2. Run `npm run migrate:activity-to-cloud` on each existing desktop installation.
3. Verify two-instance sync (Instance A writes, Instance B receives).
4. Verify offline queue upload without duplicates.
5. Apply future FK and RLS migrations after cloud Project/Team sync ships.
