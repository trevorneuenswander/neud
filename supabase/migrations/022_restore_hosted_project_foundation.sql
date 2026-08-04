-- =============================================================================
-- NEUD Alpha v0.1.1 Slice 2.3: restore hosted project foundation
-- =============================================================================
--
-- Restores projects, project_members, project_type, membership helpers, and
-- current profiles contact schema for databases that skipped migrations 002–015
-- but already contain Slice 2.3 publishing/display objects (016+).
--
-- Idempotent: safe to rerun. Does NOT modify activity_events, displays,
-- display_revisions, publishing tables, or password_reset_tokens.
--
-- Apply BEFORE 018_project_publishing_secure_auth.sql on gap databases.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared trigger helper (from 001; ensure present)
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- project_type enum (002 + 003)
-- -----------------------------------------------------------------------------

do $$
begin
  create type public.project_type as enum ('bag-graphics');
exception
  when duplicate_object then null;
end;
$$;

alter type public.project_type add value if not exists 'webpage-scraper';
alter type public.project_type add value if not exists 'json-ingest';
alter type public.project_type add value if not exists 'google-sheet-ingest';

-- -----------------------------------------------------------------------------
-- Project number sequence (002)
-- -----------------------------------------------------------------------------

create sequence if not exists public.project_number_seq;

-- -----------------------------------------------------------------------------
-- projects (002 + 010 + 020 column)
-- -----------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number bigint not null default nextval('public.project_number_seq'),
  owner_id uuid not null references auth.users (id) on delete restrict,
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
  updated_at timestamptz not null default now()
);

alter table public.projects
  add column if not exists is_active boolean not null default true;

alter table public.projects
  add column if not exists registered_by_user_id uuid references auth.users (id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_name_length_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_name_length_check
      check (char_length(trim(name)) between 1 and 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_slug_format_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_slug_format_check
      check (
        slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and char_length(slug) between 1 and 120
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_status_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_status_check
      check (status in ('draft', 'active', 'maintenance', 'archived'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_primary_color_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_primary_color_check
      check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_secondary_color_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_secondary_color_check
      check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end;
$$;

create unique index if not exists projects_project_number_unique
  on public.projects (project_number);

create unique index if not exists projects_slug_unique
  on public.projects (slug);

create unique index if not exists projects_display_token_unique
  on public.projects (display_token);

create index if not exists projects_owner_id_idx
  on public.projects (owner_id);

create index if not exists projects_status_idx
  on public.projects (status);

create index if not exists projects_project_type_idx
  on public.projects (project_type);

create index if not exists projects_updated_at_idx
  on public.projects (updated_at desc);

create index if not exists idx_projects_is_active
  on public.projects (is_active);

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- project_members (002)
-- -----------------------------------------------------------------------------

create table if not exists public.project_members (
  project_id uuid not null
    references public.projects (id)
    on delete cascade,
  user_id uuid not null
    references auth.users (id)
    on delete cascade,
  access_level text not null default 'viewer',
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_members_access_level_check'
      and conrelid = 'public.project_members'::regclass
  ) then
    alter table public.project_members
      add constraint project_members_access_level_check
      check (access_level in ('manager', 'operator', 'viewer'));
  end if;
end;
$$;

create index if not exists project_members_user_id_idx
  on public.project_members (user_id);

-- -----------------------------------------------------------------------------
-- Membership helper functions (002; required by 018–021)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Last-manager protection (002)
-- -----------------------------------------------------------------------------

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

drop trigger if exists project_members_enforce_manager_minimum on public.project_members;
create trigger project_members_enforce_manager_minimum
  before update or delete on public.project_members
  for each row execute function public.enforce_project_manager_minimum();

-- -----------------------------------------------------------------------------
-- Profiles: current contact schema (015) + application roles (008)
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists email text,
  add column if not exists phone_number text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'company'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'team'
  ) then
    alter table public.profiles rename column company to team;
  end if;
end;
$$;

comment on column public.profiles.email is
  'Profile contact email copied from auth.users on signup; may differ from login email if changed separately.';
comment on column public.profiles.phone_number is
  'Optional contact phone number stored as text.';
comment on column public.profiles.team is
  'Optional team label for the user profile (not normalized team membership).';

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or btrim(p.email) = '');

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'operator'
where role = 'user';

update public.profiles
set role = 'viewer'
where role not in ('owner', 'admin', 'operator', 'viewer');

insert into public.profiles (id, full_name, email, team, role)
select
  u.id,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  u.email,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'company', u.raw_user_meta_data ->> 'team', '')), ''),
  coalesce(nullif(btrim(u.raw_user_meta_data ->> 'role'), ''), 'viewer')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

alter table public.profiles
  alter column role set default 'viewer';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'operator', 'viewer'));

comment on column public.profiles.role is
  'Application role: owner > admin > operator > viewer';

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, team, role)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'company', new.raw_user_meta_data ->> 'team', '')), ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'role'), ''), 'viewer')
  )
  on conflict (id) do update
  set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    team = coalesce(public.profiles.team, excluded.team),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set
      email = new.email,
      updated_at = now()
    where id = new.id
      and (email is null or email = old.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated_profile on auth.users;
create trigger on_auth_user_email_updated_profile
  after update of email on auth.users
  for each row execute function public.sync_profile_email_from_auth();

drop policy if exists "Users can update own profile contact fields" on public.profiles;
create policy "Users can update own profile contact fields"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Row Level Security: projects and project_members (002)
-- -----------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

drop policy if exists "Platform admins and members can read projects" on public.projects;
create policy "Platform admins and members can read projects"
  on public.projects for select
  to authenticated
  using (public.is_project_member(id));

drop policy if exists "Platform admins can insert projects" on public.projects;
create policy "Platform admins can insert projects"
  on public.projects for insert
  to authenticated
  with check (public.is_platform_admin());

drop policy if exists "Platform admins and managers can update projects" on public.projects;
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

drop policy if exists "Platform admins can read all project memberships" on public.project_members;
create policy "Platform admins can read all project memberships"
  on public.project_members for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Project managers can read project memberships" on public.project_members;
create policy "Project managers can read project memberships"
  on public.project_members for select
  to authenticated
  using (public.is_project_manager(project_id));

drop policy if exists "Members can read own project membership" on public.project_members;
create policy "Members can read own project membership"
  on public.project_members for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Platform admins can insert project memberships" on public.project_members;
create policy "Platform admins can insert project memberships"
  on public.project_members for insert
  to authenticated
  with check (public.is_platform_admin());

drop policy if exists "Project managers can insert project memberships" on public.project_members;
create policy "Project managers can insert project memberships"
  on public.project_members for insert
  to authenticated
  with check (public.is_project_manager(project_id));

drop policy if exists "Platform admins can update project memberships" on public.project_members;
create policy "Platform admins can update project memberships"
  on public.project_members for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Project managers can update project memberships" on public.project_members;
create policy "Project managers can update project memberships"
  on public.project_members for update
  to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

drop policy if exists "Platform admins can delete project memberships" on public.project_members;
create policy "Platform admins can delete project memberships"
  on public.project_members for delete
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Project managers can delete project memberships" on public.project_members;
create policy "Project managers can delete project memberships"
  on public.project_members for delete
  to authenticated
  using (public.is_project_manager(project_id));
