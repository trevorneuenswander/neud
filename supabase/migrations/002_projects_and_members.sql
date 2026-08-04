-- =============================================================================
-- NEUD: projects and project_members
-- =============================================================================

-- =============================================================================
-- Project number sequence
-- =============================================================================

create sequence public.project_number_seq;

-- =============================================================================
-- Project type enum
-- =============================================================================

create type public.project_type as enum (
  'bag-graphics'
);

-- =============================================================================
-- projects
-- =============================================================================

create table public.projects (
  id uuid primary key default gen_random_uuid(),

  project_number bigint not null
    default nextval('public.project_number_seq'),

  owner_id uuid not null
    references auth.users (id)
    on delete restrict,

  name text not null,

  slug text not null,

  description text,

  project_type public.project_type not null,

  status text not null default 'draft',

  display_token uuid not null default gen_random_uuid(),

  theme text not null default 'default',

  logo_url text,

  primary_color text,

  secondary_color text,

  icon text not null default 'folder',

  settings jsonb not null default '{"workers": {}}'::jsonb,

  metadata jsonb not null default '{}'::jsonb,

  archived_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint projects_name_length_check
    check (char_length(trim(name)) between 1 and 120),

  constraint projects_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 120),

  constraint projects_status_check
    check (status in ('draft', 'active', 'maintenance', 'archived')),

  constraint projects_primary_color_check
    check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),

  constraint projects_secondary_color_check
    check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index projects_project_number_unique
  on public.projects (project_number);

create unique index projects_slug_unique
  on public.projects (slug);

create unique index projects_display_token_unique
  on public.projects (display_token);

create index projects_owner_id_idx
  on public.projects (owner_id);

create index projects_status_idx
  on public.projects (status);

create index projects_project_type_idx
  on public.projects (project_type);

create index projects_updated_at_idx
  on public.projects (updated_at desc);

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- =============================================================================
-- project_members
-- =============================================================================

create table public.project_members (
  project_id uuid not null
    references public.projects (id)
    on delete cascade,

  user_id uuid not null
    references auth.users (id)
    on delete cascade,

  access_level text not null default 'viewer',

  assigned_by uuid
    references auth.users (id),

  created_at timestamptz not null default now(),

  primary key (project_id, user_id),

  constraint project_members_access_level_check
    check (access_level in ('manager', 'operator', 'viewer'))
);

create index project_members_user_id_idx
  on public.project_members (user_id);

-- =============================================================================
-- RLS helper functions
-- =============================================================================

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.project_members
      where project_id = p_project_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.get_project_access_level(p_project_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.is_platform_admin() then 'admin'
    else (
      select access_level
      from public.project_members
      where project_id = p_project_id
        and user_id = auth.uid()
    )
  end;
$$;

create or replace function public.is_project_manager(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.project_members
      where project_id = p_project_id
        and user_id = auth.uid()
        and access_level = 'manager'
    );
$$;

create or replace function public.count_project_managers(p_project_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.project_members
  where project_id = p_project_id
    and access_level = 'manager';
$$;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.get_project_access_level(uuid) from public;
revoke all on function public.is_project_manager(uuid) from public;
revoke all on function public.count_project_managers(uuid) from public;

grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.get_project_access_level(uuid) to authenticated;
grant execute on function public.is_project_manager(uuid) to authenticated;
grant execute on function public.count_project_managers(uuid) to authenticated;

-- =============================================================================
-- Last-manager protection
-- =============================================================================

create or replace function public.enforce_project_manager_minimum()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_count integer;
begin
  if tg_op = 'DELETE' then
    if old.access_level = 'manager' then
      manager_count := public.count_project_managers(old.project_id);

      if manager_count <= 1 then
        raise exception 'A Project must retain at least one manager.';
      end if;
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.access_level = 'manager' and new.access_level <> 'manager' then
      manager_count := public.count_project_managers(old.project_id);

      if manager_count <= 1 then
        raise exception 'A Project must retain at least one manager.';
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

create trigger project_members_enforce_manager_minimum
  before update or delete on public.project_members
  for each row execute function public.enforce_project_manager_minimum();

-- =============================================================================
-- Transactional project creation
-- =============================================================================

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

  return new_project_id;
end;
$$;

revoke all on function public.create_project_with_manager(
  text, text, text, public.project_type, text, text, text, text, text
) from public;

grant execute on function public.create_project_with_manager(
  text, text, text, public.project_type, text, text, text, text, text
) to authenticated;

-- =============================================================================
-- Project members directory (managers and platform admins only)
-- =============================================================================

create or replace function public.get_project_members_directory(p_project_id uuid)
returns table (
  project_id uuid,
  user_id uuid,
  access_level text,
  assigned_by uuid,
  created_at timestamptz,
  full_name text,
  company text,
  email text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    pm.project_id,
    pm.user_id,
    pm.access_level,
    pm.assigned_by,
    pm.created_at,
    p.full_name,
    p.company,
    u.email
  from public.project_members pm
  join public.profiles p on p.id = pm.user_id
  join auth.users u on u.id = pm.user_id
  where pm.project_id = p_project_id
    and (
      public.is_platform_admin()
      or public.is_project_manager(p_project_id)
    )
  order by pm.created_at asc;
$$;

revoke all on function public.get_project_members_directory(uuid) from public;
grant execute on function public.get_project_members_directory(uuid) to authenticated;

create or replace function public.get_assignable_users_for_project(p_project_id uuid)
returns table (
  id uuid,
  full_name text,
  company text,
  role text,
  email text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.company,
    p.role,
    u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p.id
  )
    and (
      public.is_platform_admin()
      or public.is_project_manager(p_project_id)
    )
  order by coalesce(p.full_name, u.email) asc;
$$;

revoke all on function public.get_assignable_users_for_project(uuid) from public;
grant execute on function public.get_assignable_users_for_project(uuid) to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

-- projects: SELECT
create policy "Platform admins and members can read projects"
  on public.projects for select
  to authenticated
  using (public.is_project_member(id));

-- projects: INSERT
create policy "Platform admins can insert projects"
  on public.projects for insert
  to authenticated
  with check (public.is_platform_admin());

-- projects: UPDATE
create policy "Platform admins and managers can update projects"
  on public.projects for update
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_project_manager(id)
  )
  with check (
    public.is_platform_admin()
    or public.is_project_manager(id)
  );

-- project_members: SELECT
create policy "Platform admins can read all project memberships"
  on public.project_members for select
  to authenticated
  using (public.is_platform_admin());

create policy "Project managers can read project memberships"
  on public.project_members for select
  to authenticated
  using (public.is_project_manager(project_id));

create policy "Members can read own project membership"
  on public.project_members for select
  to authenticated
  using (user_id = auth.uid());

-- project_members: INSERT
create policy "Platform admins can insert project memberships"
  on public.project_members for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "Project managers can insert project memberships"
  on public.project_members for insert
  to authenticated
  with check (public.is_project_manager(project_id));

-- project_members: UPDATE
create policy "Platform admins can update project memberships"
  on public.project_members for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Project managers can update project memberships"
  on public.project_members for update
  to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

-- project_members: DELETE
create policy "Platform admins can delete project memberships"
  on public.project_members for delete
  to authenticated
  using (public.is_platform_admin());

create policy "Project managers can delete project memberships"
  on public.project_members for delete
  to authenticated
  using (public.is_project_manager(project_id));
