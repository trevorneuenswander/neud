-- =============================================================================
-- NEUD: display data mappings (cloud sync)
-- =============================================================================

create table if not exists public.display_data_mappings (
  id uuid primary key,
  display_id uuid not null,
  project_id uuid not null,
  json_path text not null,
  target_selector text not null,
  target_type text not null,
  target_property text,
  formatter text,
  condition_json jsonb,
  fallback_value text,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  created_by_user_id uuid,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  deleted_at timestamptz,
  sync_version integer not null default 1,
  source_instance_id uuid not null
);

create index if not exists idx_display_data_mappings_display
  on public.display_data_mappings (display_id, deleted_at, sort_order);

create table if not exists public.display_data_mapping_deletion_tombstones (
  mapping_id uuid primary key,
  display_id uuid not null,
  project_id uuid not null,
  deleted_at timestamptz not null default now(),
  deleted_by_user_id uuid,
  source_instance_id uuid not null,
  processed_at timestamptz
);

create index if not exists idx_display_data_mapping_tombstones_project
  on public.display_data_mapping_deletion_tombstones (project_id, deleted_at desc);

alter table public.display_data_mappings enable row level security;
alter table public.display_data_mapping_deletion_tombstones enable row level security;
