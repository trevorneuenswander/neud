-- =============================================================================
-- NEUD: shared Activity events (authoritative cloud store)
-- =============================================================================
--
-- Transitional schema (desktop-first overhaul):
--   - project_id, team_id, and user_id are logical UUID references only.
--   - No foreign keys to public.projects, teams, or auth.users until cloud
--     Project/Team/User synchronization is implemented.
--   - RLS is enabled with no authenticated policies; desktop sync uses the
--     service role with app-layer authorization (AccessAuthorizationService).
--   - Future migration will add FK constraints and membership-aware RLS policies.
--
-- Dependency order:
--   - Requires migration 001 (public.set_updated_at trigger function).
--   - Does NOT require public.projects, project_members, or is_project_member().
--     Those were removed from hosted Supabase during desktop-only cleanup.
--
-- See docs/activity-cloud-sync.md for the post-sync follow-up plan.
-- =============================================================================

create table if not exists public.activity_events (
  id uuid primary key,

  -- Logical reference to cloud project (FK added in a future migration).
  project_id uuid,

  -- Logical reference to cloud team (FK added in a future migration).
  team_id uuid,

  -- Logical reference to authenticated user (FK added in a future migration).
  user_id uuid,

  actor_display_name text,

  event_type text not null,

  description text not null,

  metadata jsonb not null default '{}'::jsonb,

  source text,

  severity text not null default 'info'
    check (severity in ('info', 'warning', 'error')),

  source_instance_id uuid not null,

  source_local_id text,

  occurred_at timestamptz not null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  deleted_at timestamptz
);

create index if not exists activity_events_project_id_idx
  on public.activity_events (project_id, occurred_at desc);

create index if not exists activity_events_team_id_idx
  on public.activity_events (team_id, occurred_at desc)
  where team_id is not null;

create index if not exists activity_events_user_id_idx
  on public.activity_events (user_id, occurred_at desc);

create index if not exists activity_events_occurred_at_idx
  on public.activity_events (occurred_at desc);

create index if not exists activity_events_updated_at_id_idx
  on public.activity_events (updated_at asc, id asc);

create index if not exists activity_events_source_instance_idx
  on public.activity_events (source_instance_id);

create index if not exists activity_events_not_deleted_idx
  on public.activity_events (deleted_at)
  where deleted_at is null;

drop trigger if exists activity_events_updated_at on public.activity_events;

create trigger activity_events_updated_at
  before update on public.activity_events
  for each row execute function public.set_updated_at();

alter table public.activity_events enable row level security;

-- Transitional RLS (intentionally no authenticated policies):
--   - Authenticated web/portal clients are denied by default (no matching policy).
--   - Do NOT add using (true) or unrestricted insert policies here.
--   - The Supabase service role bypasses RLS automatically; desktop Activity sync
--     uses the service role plus AccessAuthorizationService for authorization.
--   - A future migration will add membership-aware select/insert/update policies
--     after Projects, Teams, and memberships are cloud-authoritative.
--
-- Example future policy shape (NOT applied yet; see docs/activity-cloud-sync.md):
--   select/insert gated by is_project_member(project_id) or is_platform_admin()
--   update restricted to platform admins for description repair
