-- =============================================================================
-- NEUD: shared Display records (authoritative cloud store)
-- =============================================================================
--
-- Transitional schema (desktop-first overhaul):
--   - project_id and user references are logical UUID references only.
--   - No foreign keys to public.projects or legacy hosted membership tables.
--   - RLS is enabled with no authenticated policies; desktop sync uses the
--     service role with app-layer authorization (AccessAuthorizationService).
--   - A future migration will add membership-aware policies after Projects,
--     Teams, and memberships are cloud-authoritative.
--
-- Dependency order:
--   - Requires migration 001 (public.set_updated_at trigger function).
--   - Does NOT require public.projects or legacy membership helpers.
--
-- =============================================================================

create table if not exists public.displays (
  id uuid primary key,
  project_id uuid not null,
  name text not null,
  description text,
  slug text not null,
  display_type text not null default 'project-html',
  enabled boolean not null default false,
  refresh_rate_ms integer not null default 5000,
  display_width integer not null default 1920,
  display_height integer not null default 1080,
  is_archived boolean not null default false,
  archived_at timestamptz,
  archived_by_user_id uuid,
  active_revision_id uuid,
  created_at timestamptz not null default now(),
  created_by_user_id uuid,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  deleted_at timestamptz,
  sync_version integer not null default 1,
  source_instance_id uuid not null
);

create unique index if not exists idx_displays_project_slug
  on public.displays (project_id, slug)
  where deleted_at is null;

create index if not exists idx_displays_project_active
  on public.displays (project_id, is_archived)
  where deleted_at is null;

create table if not exists public.display_revisions (
  id uuid primary key,
  display_id uuid not null,
  project_id uuid not null,
  version_number integer not null,
  html_content text not null,
  content_hash text not null,
  version_note text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid,
  restored_from_revision_id uuid,
  sync_version integer not null default 1,
  source_instance_id uuid not null,
  unique (display_id, version_number)
);

create index if not exists idx_display_revisions_display
  on public.display_revisions (display_id, version_number desc);

create table if not exists public.display_deletion_tombstones (
  display_id uuid primary key,
  project_id uuid not null,
  deleted_at timestamptz not null default now(),
  deleted_by_user_id uuid,
  source_instance_id uuid not null,
  processed_at timestamptz
);

create index if not exists idx_display_deletion_tombstones_project
  on public.display_deletion_tombstones (project_id, deleted_at desc);

drop trigger if exists displays_updated_at on public.displays;

create trigger displays_updated_at
  before update on public.displays
  for each row execute function public.set_updated_at();

alter table public.displays enable row level security;
alter table public.display_revisions enable row level security;
alter table public.display_deletion_tombstones enable row level security;

-- Transitional RLS (intentionally no authenticated policies):
--   - Authenticated web/portal clients are denied by default (no matching policy).
--   - The Supabase service role bypasses RLS automatically; desktop display sync
--     uses the service role plus AccessAuthorizationService for authorization.
--   - A future migration will add membership-aware policies after Projects,
--     Teams, and memberships are cloud-authoritative.
