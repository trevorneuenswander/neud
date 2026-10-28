-- Preview-only bootstrap for migration 065 testing.
-- Applies a minimal NEUD access-control surface when the full migration chain
-- cannot be replayed cleanly on a fresh Free project (duplicate 004 versions /
-- CREATE OR REPLACE return-type conflicts).
-- NEVER run against production (abtvefbwnismoqweokqu).

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  team text,
  role text not null default 'user',
  email text,
  phone_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key,
  user_id uuid,
  event_type text not null,
  description text,
  source text,
  severity text,
  source_instance_id uuid,
  occurred_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_teams_slug_unique
  on public.teams (lower(slug))
  where deleted_at is null;

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.project_team_assignments (
  project_id uuid not null references public.projects (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  primary key (project_id, team_id)
);

create table if not exists public.displays (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  display_width integer,
  display_height integer,
  enabled boolean not null default true,
  online_viewer_enabled boolean not null default false,
  online_visibility text not null default 'private',
  online_published_at timestamptz,
  online_published_revision_id uuid,
  online_publish_error text,
  refresh_rate_ms integer,
  sort_order double precision,
  is_archived boolean not null default false,
  deleted_at timestamptz,
  unique (project_id, slug)
);

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'owner'
  );
$$;

create or replace function public.is_sole_owner_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'owner'
  );
$$;

create or replace function public.is_neud_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teams t
    where t.id = p_team_id
      and t.deleted_at is null
      and (
        lower(coalesce(t.name, '')) = 'neud'
        or lower(coalesce(t.slug, '')) = 'neud'
      )
  );
$$;

-- Matches production migration 045: Owner OR NEUD-team Admin only.
-- profiles.role = 'admin' alone is NOT site-wide access.
create or replace function public.is_neud_team_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role = 'admin'
      and t.deleted_at is null
      and (
        lower(coalesce(t.name, '')) = 'neud'
        or lower(coalesce(t.slug, '')) = 'neud'
      )
  );
$$;

create or replace function public.has_site_wide_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or public.is_neud_team_admin();
$$;

create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_site_wide_access()
    or exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = p_team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role = 'admin'
    );
$$;

create or replace function public.has_team_assigned_manager_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_team_assignments pta
    join public.team_memberships tm on tm.team_id = pta.team_id
    join public.teams t on t.id = pta.team_id
    where pta.project_id = p_project_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('admin', 'owner')
      and t.deleted_at is null
      and t.is_active = true
  );
$$;

create or replace function public.get_direct_project_access_level(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select null::text;
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_site_wide_access()
    or public.has_team_assigned_manager_access(p_project_id)
    or public.get_direct_project_access_level(p_project_id) is not null;
$$;

create or replace function public.can_view_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_project_member(p_project_id);
$$;

create or replace function public.list_project_active_displays(p_project_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  display_width integer,
  display_height integer,
  enabled boolean,
  online_viewer_enabled boolean,
  online_visibility text,
  online_published_at timestamptz,
  online_published_revision_id uuid,
  online_publish_error text,
  refresh_rate_ms integer,
  sort_order double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id, d.slug, d.name, d.description, d.display_width, d.display_height,
    d.enabled, d.online_viewer_enabled, d.online_visibility, d.online_published_at,
    d.online_published_revision_id, d.online_publish_error, d.refresh_rate_ms, d.sort_order
  from public.displays d
  where d.project_id = p_project_id
    and d.deleted_at is null
    and d.is_archived = false
    and public.can_view_project(p_project_id)
  order by d.sort_order nulls last, d.name asc, d.slug asc;
$$;

-- Baseline 045 upsert/remove (pre-065) for rollback testing.
create or replace function public.upsert_team_member(
  p_team_id uuid,
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if not public.has_site_wide_access() and not public.is_team_admin(p_team_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;
  if p_role = 'owner' then
    return jsonb_build_object('ok', false, 'code', 'owner_role_not_assignable');
  end if;
  if p_role not in ('admin', 'member') then
    return jsonb_build_object('ok', false, 'code', 'invalid_team_role');
  end if;
  if public.is_sole_owner_user(p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'sole_owner_protected');
  end if;

  select tm.role into v_existing_role
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = p_user_id;

  insert into public.team_memberships (team_id, user_id, role, created_by)
  values (p_team_id, p_user_id, p_role, auth.uid())
  on conflict (team_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();

  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (
    gen_random_uuid(), auth.uid(),
    case when v_existing_role is null then 'team.member_added' else 'team.role_changed' end,
    case
      when v_existing_role is null then 'Team member added.'
      when p_role = 'admin' then 'Team role changed to Admin.'
      else 'Team role changed to Member.'
    end,
    'access-management', 'info', gen_random_uuid(), now()
  );
  return jsonb_build_object('ok', true, 'code', 'upserted');
end;
$$;

create or replace function public.remove_team_member(
  p_team_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if not public.has_site_wide_access() and not public.is_team_admin(p_team_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;
  if public.is_sole_owner_user(p_user_id) and public.is_neud_team(p_team_id) then
    return jsonb_build_object('ok', false, 'code', 'sole_owner_protected');
  end if;
  delete from public.team_memberships where team_id = p_team_id and user_id = p_user_id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.member_removed', 'Team member removed.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;
