-- =============================================================================
-- NEUD Alpha v0.1.1: project online publishing foundation (Slice 1)
-- =============================================================================
--
-- Transitional schema (desktop-first overhaul):
--   - project_id references are logical UUID references only.
--   - No foreign keys to public.projects or legacy hosted membership tables.
--   - RLS is enabled with no authenticated policies during Slice 1.
--   - Desktop sync and future Vercel routes will use service role or
--     membership-aware policies after cloud Project/Team sync is restored.
--
-- Dependency order:
--   - Requires migration 001 (public.set_updated_at trigger function).
--   - Does NOT require public.projects or is_project_member().
--
-- See docs/alpha-v0.1.1-online-delivery-plan.md
-- =============================================================================

create table if not exists public.project_publishing_settings (
  project_id uuid primary key,
  online_publishing_enabled boolean not null default false,
  active_publisher_instance_id uuid,
  latest_published_revision bigint not null default 0,
  last_successful_publish_at timestamptz,
  last_publish_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger project_publishing_settings_updated_at
  before update on public.project_publishing_settings
  for each row execute function public.set_updated_at();

create table if not exists public.project_canonical_snapshots (
  project_id uuid primary key,
  contract_version text not null,
  revision bigint not null,
  generated_at timestamptz not null,
  received_at timestamptz not null default now(),
  publisher_instance_id uuid not null,
  source_mode text not null
    check (source_mode in ('webpage-scraper', 'local-controller')),
  source_connected boolean not null default false,
  payload jsonb not null,
  payload_hash text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_canonical_snapshots_revision
  on public.project_canonical_snapshots (project_id, revision desc);

create index if not exists idx_project_canonical_snapshots_received_at
  on public.project_canonical_snapshots (received_at desc);

create trigger project_canonical_snapshots_updated_at
  before update on public.project_canonical_snapshots
  for each row execute function public.set_updated_at();

create table if not exists public.project_publisher_leases (
  project_id uuid primary key,
  publisher_instance_id uuid not null,
  acquired_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_publisher_leases_expires
  on public.project_publisher_leases (lease_expires_at asc)
  where released_at is null;

create trigger project_publisher_leases_updated_at
  before update on public.project_publisher_leases
  for each row execute function public.set_updated_at();

alter table public.project_publishing_settings enable row level security;
alter table public.project_canonical_snapshots enable row level security;
alter table public.project_publisher_leases enable row level security;

-- Transitional RLS (intentionally no authenticated policies in Slice 1):
--   - Authenticated web/portal clients are denied by default.
--   - The Supabase service role bypasses RLS automatically.
--   - Future migration will add membership-aware read/write policies once
--     cloud Project/Team synchronization is restored on hosted Supabase.
