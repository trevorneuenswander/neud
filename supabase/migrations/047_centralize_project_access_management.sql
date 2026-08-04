-- 047_centralize_project_access_management.sql
-- Centralize project access-management authorization for member and team assignment RPCs.

create or replace function public.can_manage_project_access(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.has_site_wide_access()
    or public.is_project_manager(p_project_id);
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_manage_project_access(p_project_id);
$$;

create or replace function public.can_manage_project_users(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_manage_project_access(p_project_id);
$$;

create or replace function public.assign_project_team(
  p_project_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  if not exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.deleted_at is null and t.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'code', 'outside_team_scope');
  end if;

  insert into public.project_team_assignments (project_id, team_id, assigned_by)
  values (p_project_id, p_team_id, v_user_id)
  on conflict (project_id, team_id) do nothing;

  insert into public.activity_events (
    id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at
  ) values (
    gen_random_uuid(), p_project_id, v_user_id, 'project.team_assigned', 'Assigned team to project.', 'access-management', 'info', gen_random_uuid(), now()
  );

  return jsonb_build_object('ok', true, 'code', 'assigned');
end;
$$;

create or replace function public.remove_project_team(
  p_project_id uuid,
  p_team_id uuid
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

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  delete from public.project_team_assignments
  where project_id = p_project_id and team_id = p_team_id;

  insert into public.activity_events (
    id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at
  ) values (
    gen_random_uuid(), p_project_id, auth.uid(), 'project.team_removed', 'Removed team from project.', 'access-management', 'info', gen_random_uuid(), now()
  );

  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;

create or replace function public.upsert_project_member(
  p_project_id uuid,
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

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  if p_role not in ('manager', 'operator', 'viewer') then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select pm.access_level into v_existing_role
  from public.project_members pm
  where pm.project_id = p_project_id and pm.user_id = p_user_id;

  insert into public.project_members (project_id, user_id, access_level)
  values (p_project_id, p_user_id, p_role)
  on conflict (project_id, user_id) do update set access_level = excluded.access_level;

  insert into public.activity_events (id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (
    gen_random_uuid(),
    p_project_id,
    auth.uid(),
    case when v_existing_role is null then 'project.member_added' else 'project.role_changed' end,
    case
      when v_existing_role is null then format('Project access granted as %s.', initcap(p_role))
      else format('Project access changed to %s.', initcap(p_role))
    end,
    'access-management',
    'info',
    gen_random_uuid(),
    now()
  );

  return jsonb_build_object('ok', true, 'code', 'upserted');
end;
$$;

create or replace function public.remove_project_member(
  p_project_id uuid,
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

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  delete from public.project_members
  where project_id = p_project_id and user_id = p_user_id;

  insert into public.activity_events (id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), p_project_id, auth.uid(), 'project.member_removed', 'Project access removed.', 'access-management', 'info', gen_random_uuid(), now());

  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;

revoke all on function public.can_manage_project_access(uuid) from public;
revoke execute on function public.can_manage_project_access(uuid) from anon;
revoke execute on function public.can_manage_project_access(uuid) from service_role;
grant execute on function public.can_manage_project_access(uuid) to authenticated;
