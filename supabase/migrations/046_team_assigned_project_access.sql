-- 046_team_assigned_project_access.sql
-- Team Admins inherit Manager access to projects assigned to their team.

create or replace function public.has_team_assigned_manager_access(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.project_team_assignments pta
    join public.team_memberships tm
      on tm.team_id = pta.team_id
    join public.teams t
      on t.id = pta.team_id
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
security definer
stable
set search_path = public
as $$
  select pm.access_level
  from public.project_members pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.has_site_wide_access()
    or public.has_team_assigned_manager_access(p_project_id)
    or public.get_direct_project_access_level(p_project_id) is not null;
$$;

create or replace function public.get_project_access_level(p_project_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.has_site_wide_access() then 'admin'
    when public.get_direct_project_access_level(p_project_id) = 'manager'
      or public.has_team_assigned_manager_access(p_project_id) then 'manager'
    when public.get_direct_project_access_level(p_project_id) = 'operator' then 'operator'
    when public.get_direct_project_access_level(p_project_id) = 'viewer' then 'viewer'
    else null
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
    public.has_site_wide_access()
    or public.has_team_assigned_manager_access(p_project_id)
    or public.get_direct_project_access_level(p_project_id) = 'manager';
$$;

revoke all on function public.has_team_assigned_manager_access(uuid) from public;
revoke all on function public.get_direct_project_access_level(uuid) from public;
grant execute on function public.has_team_assigned_manager_access(uuid) to authenticated;
grant execute on function public.get_direct_project_access_level(uuid) to authenticated;
