-- =============================================================================
-- NEUD: Data Engine framework + Webpage Scraper extension
-- =============================================================================
-- Safe to apply after 003_project_data_types.sql

-- =============================================================================
-- Generic Data Engine tables
-- =============================================================================

create table public.data_engines (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null
    references public.projects (id)
    on delete cascade,

  name text not null,

  engine_key text not null,

  engine_type text not null,

  enabled boolean not null default true,

  desired_state text not null default 'stopped',

  config jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users (id),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint data_engines_name_length_check
    check (char_length(trim(name)) between 1 and 120),

  constraint data_engines_engine_key_format_check
    check (engine_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(engine_key) between 1 and 64),

  constraint data_engines_desired_state_check
    check (desired_state in ('running', 'stopped')),

  unique (project_id, engine_key)
);

create index data_engines_project_id_idx
  on public.data_engines (project_id);

create index data_engines_engine_type_idx
  on public.data_engines (engine_type);

create trigger data_engines_updated_at
  before update on public.data_engines
  for each row execute function public.set_updated_at();

-- =============================================================================

create table public.data_engine_status (
  engine_id uuid primary key
    references public.data_engines (id)
    on delete cascade,

  actual_state text not null default 'offline',

  health_state text not null default 'unknown',

  worker_id text,
  worker_version text,

  last_heartbeat_at timestamptz,
  last_run_started_at timestamptz,
  last_run_succeeded_at timestamptz,
  last_run_failed_at timestamptz,

  current_interval_ms integer,

  total_runs bigint not null default 0,
  successful_runs bigint not null default 0,
  failed_runs bigint not null default 0,

  last_duration_ms integer,
  average_duration_ms integer,

  last_record_count integer,
  last_payload_size_bytes integer,

  last_error text,

  updated_at timestamptz not null default now(),

  constraint data_engine_status_actual_state_check
    check (actual_state in (
      'offline', 'starting', 'running', 'stopping', 'stopped', 'error'
    )),

  constraint data_engine_status_health_state_check
    check (health_state in ('unknown', 'healthy', 'warning', 'error', 'stale'))
);

create trigger data_engine_status_updated_at
  before update on public.data_engine_status
  for each row execute function public.set_updated_at();

-- =============================================================================

create table public.data_engine_commands (
  id bigint generated always as identity primary key,

  engine_id uuid not null
    references public.data_engines (id)
    on delete cascade,

  command text not null,

  status text not null default 'pending',

  requested_by uuid not null
    references auth.users (id),

  error_message text,

  created_at timestamptz not null default now(),

  processing_started_at timestamptz,

  processed_at timestamptz,

  constraint data_engine_commands_command_check
    check (command in ('start', 'stop', 'restart', 'run_once')),

  constraint data_engine_commands_status_check
    check (status in ('pending', 'processing', 'completed', 'failed'))
);

create index data_engine_commands_pending_idx
  on public.data_engine_commands (engine_id, status, created_at)
  where status = 'pending';

create index data_engine_commands_engine_created_idx
  on public.data_engine_commands (engine_id, created_at desc);

-- =============================================================================

create table public.data_engine_snapshots (
  id bigint generated always as identity primary key,

  engine_id uuid not null
    references public.data_engines (id)
    on delete cascade,

  data jsonb not null,

  record_count integer,
  payload_size_bytes integer,
  duration_ms integer,
  worker_id text,

  captured_at timestamptz not null,

  created_at timestamptz not null default now()
);

create index data_engine_snapshots_engine_created_idx
  on public.data_engine_snapshots (engine_id, created_at desc);

-- =============================================================================

create table public.data_engine_logs (
  id bigint generated always as identity primary key,

  engine_id uuid not null
    references public.data_engines (id)
    on delete cascade,

  level text not null,

  event_type text not null,

  message text not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint data_engine_logs_level_check
    check (level in ('info', 'warning', 'error'))
);

create index data_engine_logs_engine_created_idx
  on public.data_engine_logs (engine_id, created_at desc);

-- =============================================================================
-- Webpage Scraper extension tables
-- =============================================================================

create table public.webpage_scraper_settings (
  engine_id uuid primary key
    references public.data_engines (id)
    on delete cascade,

  poll_interval_ms integer not null default 5000,

  details_ttl_ms integer not null default 300000,

  max_detail_checks_per_poll integer not null default 8,

  headless boolean not null default true,

  updated_by uuid references auth.users (id),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint webpage_scraper_settings_poll_interval_check
    check (poll_interval_ms between 1000 and 3600000),

  constraint webpage_scraper_settings_details_ttl_check
    check (details_ttl_ms between 1000 and 86400000),

  constraint webpage_scraper_settings_max_detail_checks_check
    check (max_detail_checks_per_poll between 1 and 100)
);

create trigger webpage_scraper_settings_updated_at
  before update on public.webpage_scraper_settings
  for each row execute function public.set_updated_at();

-- =============================================================================

create table public.webpage_scraper_sources (
  id uuid primary key default gen_random_uuid(),

  engine_id uuid not null
    references public.data_engines (id)
    on delete cascade,

  name text not null,

  source_key text not null,

  url text not null,

  source_type text not null default 'page',

  enabled boolean not null default true,

  position integer not null default 0,

  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint webpage_scraper_sources_name_length_check
    check (char_length(trim(name)) between 1 and 120),

  constraint webpage_scraper_sources_source_key_format_check
    check (source_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(source_key) between 1 and 64),

  constraint webpage_scraper_sources_url_length_check
    check (char_length(trim(url)) between 1 and 2048),

  constraint webpage_scraper_sources_source_type_check
    check (source_type in ('page', 'login', 'detail', 'display')),

  unique (engine_id, source_key)
);

create index webpage_scraper_sources_engine_position_idx
  on public.webpage_scraper_sources (engine_id, position);

create trigger webpage_scraper_sources_updated_at
  before update on public.webpage_scraper_sources
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS helper functions
-- =============================================================================

create or replace function public.get_data_engine_project_id(p_engine_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select project_id
  from public.data_engines
  where id = p_engine_id;
$$;

create or replace function public.can_read_data_engine(p_engine_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_project_member(public.get_data_engine_project_id(p_engine_id));
$$;

create or replace function public.can_control_data_engine(p_engine_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_platform_admin()
    or public.get_project_access_level(public.get_data_engine_project_id(p_engine_id))
      in ('admin', 'manager', 'operator');
$$;

create or replace function public.can_configure_data_engine(p_engine_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_platform_admin()
    or public.is_project_manager(public.get_data_engine_project_id(p_engine_id));
$$;

create or replace function public.project_supports_data_engines(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.projects
    where id = p_project_id
      and project_type = 'webpage-scraper'
  );
$$;

revoke all on function public.get_data_engine_project_id(uuid) from public;
revoke all on function public.can_read_data_engine(uuid) from public;
revoke all on function public.can_control_data_engine(uuid) from public;
revoke all on function public.can_configure_data_engine(uuid) from public;
revoke all on function public.project_supports_data_engines(uuid) from public;

grant execute on function public.get_data_engine_project_id(uuid) to authenticated;
grant execute on function public.can_read_data_engine(uuid) to authenticated;
grant execute on function public.can_control_data_engine(uuid) to authenticated;
grant execute on function public.can_configure_data_engine(uuid) to authenticated;
grant execute on function public.project_supports_data_engines(uuid) to authenticated;

-- =============================================================================
-- Initialization
-- =============================================================================

create or replace function public.initialize_webpage_scraper_engine(
  p_project_id uuid,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_engine_id uuid;
begin
  if not public.project_supports_data_engines(p_project_id) then
    return null;
  end if;

  select id into v_engine_id
  from public.data_engines
  where project_id = p_project_id
    and engine_key = 'webpage-scraper';

  if v_engine_id is not null then
    return v_engine_id;
  end if;

  insert into public.data_engines (
    project_id,
    name,
    engine_key,
    engine_type,
    enabled,
    desired_state,
    config,
    created_by
  )
  values (
    p_project_id,
    'Webpage Scraper',
    'webpage-scraper',
    'webpage-scraper',
    true,
    'stopped',
    '{"adapter":"bag-auction"}'::jsonb,
    p_created_by
  )
  returning id into v_engine_id;

  insert into public.data_engine_status (engine_id)
  values (v_engine_id)
  on conflict (engine_id) do nothing;

  insert into public.webpage_scraper_settings (engine_id)
  values (v_engine_id)
  on conflict (engine_id) do nothing;

  return v_engine_id;
end;
$$;

create or replace function public.ensure_project_data_engines(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_project_member(p_project_id)
    and not public.is_platform_admin() then
    raise exception 'Unauthorized.';
  end if;

  perform public.initialize_webpage_scraper_engine(p_project_id, auth.uid());
end;
$$;

revoke all on function public.initialize_webpage_scraper_engine(uuid, uuid) from public;
revoke all on function public.ensure_project_data_engines(uuid) from public;

grant execute on function public.initialize_webpage_scraper_engine(uuid, uuid) to authenticated;
grant execute on function public.ensure_project_data_engines(uuid) to authenticated;

-- Extend project creation to initialize default engine
create or replace function public.create_project_with_manager(
  p_name text,
  p_slug text,
  p_description text default null,
  p_project_type public.project_type default 'bag-graphics',
  p_theme text default 'default',
  p_logo_url text default null,
  p_primary_color text default null,
  p_secondary_color text default null,
  p_icon text default 'folder'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_project_id uuid;
  creator_id uuid := auth.uid();
begin
  if creator_id is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Only platform owners and admins may create Projects.';
  end if;

  insert into public.projects (
    owner_id,
    name,
    slug,
    description,
    project_type,
    theme,
    logo_url,
    primary_color,
    secondary_color,
    icon
  )
  values (
    creator_id,
    trim(p_name),
    p_slug,
    nullif(trim(p_description), ''),
    p_project_type,
    coalesce(nullif(trim(p_theme), ''), 'default'),
    nullif(trim(p_logo_url), ''),
    p_primary_color,
    p_secondary_color,
    coalesce(nullif(trim(p_icon), ''), 'folder')
  )
  returning id into new_project_id;

  insert into public.project_members (
    project_id,
    user_id,
    access_level,
    assigned_by
  )
  values (
    new_project_id,
    creator_id,
    'manager',
    creator_id
  );

  perform public.initialize_webpage_scraper_engine(new_project_id, creator_id);

  return new_project_id;
end;
$$;

-- =============================================================================
-- Command claim (worker-safe, race-free)
-- =============================================================================

create or replace function public.claim_data_engine_command(
  p_engine_id uuid,
  p_worker_id text default null
)
returns table (
  command_id bigint,
  command text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.data_engine_commands%rowtype;
begin
  select *
  into v_row
  from public.data_engine_commands
  where engine_id = p_engine_id
    and status = 'pending'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.data_engine_commands
  set
    status = 'processing',
    processing_started_at = now()
  where id = v_row.id;

  command_id := v_row.id;
  command := v_row.command;
  return next;
end;
$$;

revoke all on function public.claim_data_engine_command(uuid, text) from public;
grant execute on function public.claim_data_engine_command(uuid, text) to service_role;

-- =============================================================================
-- Retention pruning
-- =============================================================================

create or replace function public.prune_data_engine_snapshots(
  p_engine_id uuid,
  p_keep_count integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with ranked as (
    select id
    from public.data_engine_snapshots
    where engine_id = p_engine_id
    order by created_at desc
    offset greatest(p_keep_count, 1)
  )
  delete from public.data_engine_snapshots
  where id in (select id from ranked);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.prune_data_engine_logs(
  p_engine_id uuid,
  p_keep_count integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with ranked as (
    select id
    from public.data_engine_logs
    where engine_id = p_engine_id
    order by created_at desc
    offset greatest(p_keep_count, 1)
  )
  delete from public.data_engine_logs
  where id in (select id from ranked);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_data_engine_snapshots(uuid, integer) from public;
revoke all on function public.prune_data_engine_logs(uuid, integer) from public;

grant execute on function public.prune_data_engine_snapshots(uuid, integer) to service_role;
grant execute on function public.prune_data_engine_logs(uuid, integer) to service_role;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.data_engines enable row level security;
alter table public.data_engine_status enable row level security;
alter table public.data_engine_commands enable row level security;
alter table public.data_engine_snapshots enable row level security;
alter table public.data_engine_logs enable row level security;
alter table public.webpage_scraper_settings enable row level security;
alter table public.webpage_scraper_sources enable row level security;

-- data_engines
create policy "Members can read data engines"
  on public.data_engines for select
  to authenticated
  using (public.is_project_member(project_id));

create policy "Managers can insert data engines"
  on public.data_engines for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or public.is_project_manager(project_id)
  );

create policy "Managers can update data engines"
  on public.data_engines for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_manager(project_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_manager(project_id)
  );

create policy "Managers can delete data engines"
  on public.data_engines for delete
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_manager(project_id)
  );

-- data_engine_status
create policy "Members can read engine status"
  on public.data_engine_status for select
  to authenticated
  using (public.can_read_data_engine(engine_id));

-- data_engine_commands
create policy "Members can read engine commands"
  on public.data_engine_commands for select
  to authenticated
  using (public.can_read_data_engine(engine_id));

create policy "Controllers can insert engine commands"
  on public.data_engine_commands for insert
  to authenticated
  with check (public.can_control_data_engine(engine_id));

-- data_engine_snapshots
create policy "Members can read engine snapshots"
  on public.data_engine_snapshots for select
  to authenticated
  using (public.can_read_data_engine(engine_id));

-- data_engine_logs
create policy "Members can read engine logs"
  on public.data_engine_logs for select
  to authenticated
  using (public.can_read_data_engine(engine_id));

-- webpage_scraper_settings
create policy "Members can read scraper settings"
  on public.webpage_scraper_settings for select
  to authenticated
  using (public.can_read_data_engine(engine_id));

create policy "Managers can update scraper settings"
  on public.webpage_scraper_settings for update
  to authenticated
  using (public.can_configure_data_engine(engine_id))
  with check (public.can_configure_data_engine(engine_id));

create policy "Managers can insert scraper settings"
  on public.webpage_scraper_settings for insert
  to authenticated
  with check (public.can_configure_data_engine(engine_id));

-- webpage_scraper_sources
create policy "Members can read scraper sources"
  on public.webpage_scraper_sources for select
  to authenticated
  using (public.can_read_data_engine(engine_id));

create policy "Managers can insert scraper sources"
  on public.webpage_scraper_sources for insert
  to authenticated
  with check (public.can_configure_data_engine(engine_id));

create policy "Managers can update scraper sources"
  on public.webpage_scraper_sources for update
  to authenticated
  using (public.can_configure_data_engine(engine_id))
  with check (public.can_configure_data_engine(engine_id));

create policy "Managers can delete scraper sources"
  on public.webpage_scraper_sources for delete
  to authenticated
  using (public.can_configure_data_engine(engine_id));

-- =============================================================================
-- Realtime publication
-- =============================================================================

alter publication supabase_realtime add table public.data_engine_status;
alter publication supabase_realtime add table public.data_engine_snapshots;
alter publication supabase_realtime add table public.data_engine_logs;
alter publication supabase_realtime add table public.data_engine_commands;
