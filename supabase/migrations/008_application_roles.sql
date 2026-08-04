-- =============================================================================
-- Application roles: owner, admin, operator, viewer
-- =============================================================================

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'operator'
where role = 'user';

update public.profiles
set role = 'viewer'
where role not in ('owner', 'admin', 'operator', 'viewer');

alter table public.profiles
  alter column role set default 'viewer';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'operator', 'viewer'));

comment on column public.profiles.role is
  'Application role: owner > admin > operator > viewer';

-- =============================================================================
-- Owner protection helpers
-- =============================================================================

create or replace function public.count_active_owners()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.profiles
  where role = 'owner';
$$;

revoke all on function public.count_active_owners() from public;
grant execute on function public.count_active_owners() to authenticated;

create or replace function public.enforce_last_owner_protection(
  p_target_user_id uuid,
  p_next_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  owner_count integer;
begin
  select role
  into current_role
  from public.profiles
  where id = p_target_user_id;

  if current_role is distinct from 'owner' then
    return;
  end if;

  owner_count := public.count_active_owners();

  if owner_count <= 1 then
    raise exception 'last-owner-protected';
  end if;

  if p_next_role is not null and p_next_role <> 'owner' then
    return;
  end if;
end;
$$;

revoke all on function public.enforce_last_owner_protection(uuid, text) from public;
grant execute on function public.enforce_last_owner_protection(uuid, text) to authenticated;

-- =============================================================================
-- Platform users directory (owners and admins only)
-- =============================================================================

create or replace function public.get_platform_users_directory()
returns table (
  id uuid,
  full_name text,
  company text,
  role text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  assigned_project_count bigint
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
    u.email,
    p.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    (
      select count(*)::bigint
      from public.project_members pm
      where pm.user_id = p.id
    ) as assigned_project_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_platform_admin()
  order by coalesce(p.full_name, u.email) asc;
$$;

revoke all on function public.get_platform_users_directory() from public;
grant execute on function public.get_platform_users_directory() to authenticated;

create or replace function public.get_user_project_assignments(p_user_id uuid)
returns table (
  project_id uuid,
  project_name text,
  project_slug text,
  access_level text,
  assigned_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    pm.project_id,
    pr.name,
    pr.slug,
    pm.access_level,
    pm.created_at
  from public.project_members pm
  join public.projects pr on pr.id = pm.project_id
  where pm.user_id = p_user_id
    and public.is_platform_admin()
  order by pr.name asc;
$$;

revoke all on function public.get_user_project_assignments(uuid) from public;
grant execute on function public.get_user_project_assignments(uuid) to authenticated;

create or replace function public.get_project_members_directory(p_project_id uuid)
returns table (
  project_id uuid,
  user_id uuid,
  access_level text,
  assigned_by uuid,
  created_at timestamptz,
  full_name text,
  company text,
  email text,
  role text
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
    u.email,
    p.role
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

-- =============================================================================
-- Auth audit log: platform admins may read all events
-- =============================================================================

drop policy if exists "Users can read own auth audit events" on public.auth_audit_log;

create policy "Users can read own auth audit events"
  on public.auth_audit_log for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Platform admins can read all auth audit events"
  on public.auth_audit_log for select
  to authenticated
  using (public.is_platform_admin());

-- =============================================================================
-- Profiles: platform admins may update non-owner roles via service layer.
-- Direct client updates remain blocked; mutations use service role.
