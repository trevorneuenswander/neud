-- 036_access_management_rpcs.sql
-- Shared access directory and core team mutations.

create or replace function public.get_access_management_directory()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_teams jsonb := '[]'::jsonb;
  v_users jsonb := '[]'::jsonb;
  v_project_members jsonb := '[]'::jsonb;
  v_project_teams jsonb := '[]'::jsonb;
  v_invitations jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  v_is_owner := public.is_platform_owner() or public.is_platform_admin();

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'slug', t.slug,
      'description', t.description,
      'isActive', t.is_active,
      'memberCount', (
        select count(*)::integer from public.team_memberships tm
        where tm.team_id = t.id and tm.status = 'active'
      )
    ) order by t.name), '[]'::jsonb)
    into v_teams
    from public.teams t
    where t.deleted_at is null and t.is_active = true;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'slug', t.slug,
      'description', t.description,
      'isActive', t.is_active,
      'memberCount', (
        select count(*)::integer from public.team_memberships tm2
        where tm2.team_id = t.id and tm2.status = 'active'
      )
    ) order by t.name), '[]'::jsonb)
    into v_teams
    from public.teams t
    where t.deleted_at is null
      and t.is_active = true
      and public.is_team_admin(t.id);
  end if;

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'fullName', coalesce(p.full_name, ''),
      'email', coalesce(p.email, ''),
      'platformRole', p.role,
      'team', coalesce(p.team, ''),
      'accountStatus', case when coalesce(p.is_active, true) then 'active' else 'inactive' end
    ) order by coalesce(p.full_name, p.email)), '[]'::jsonb)
    into v_users
    from public.profiles p;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'projectId', pm.project_id,
    'userId', pm.user_id,
    'role', pm.access_level
  )), '[]'::jsonb)
  into v_project_members
  from public.project_members pm
  where v_is_owner or public.can_view_project(pm.project_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'projectId', pta.project_id,
    'teamId', pta.team_id
  )), '[]'::jsonb)
  into v_project_teams
  from public.project_team_assignments pta
  where v_is_owner or public.can_view_project(pta.project_id);

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'email', i.email_normalized,
      'teamId', i.team_id,
      'platformRole', i.platform_role,
      'teamRole', i.team_role,
      'status', i.status,
      'expiresAt', i.expires_at,
      'createdAt', i.created_at
    ) order by i.created_at desc), '[]'::jsonb)
    into v_invitations
    from public.cloud_invitations i
    where i.status in ('pending', 'accepted', 'expired', 'revoked');
  end if;

  return jsonb_build_object(
    'ok', true,
    'teams', v_teams,
    'users', v_users,
    'projectMembers', v_project_members,
    'projectTeams', v_project_teams,
    'invitations', v_invitations
  );
end;
$$;

create or replace function public.create_team(
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_slug text;
  v_team_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if not public.is_platform_owner() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Team name is required.');
  end if;

  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);

  insert into public.teams (name, slug, description, created_by)
  values (v_name, v_slug, nullif(btrim(p_description), ''), v_user_id)
  returning id into v_team_id;

  insert into public.team_memberships (team_id, user_id, role, created_by)
  values (v_team_id, v_user_id, 'owner', v_user_id);

  insert into public.activity_events (
    id, user_id, event_type, description, source, severity, source_instance_id, occurred_at
  ) values (
    gen_random_uuid(), v_user_id, 'team.created', 'Created team.', 'access-management', 'info', gen_random_uuid(), now()
  );

  return jsonb_build_object('ok', true, 'code', 'created', 'team_id', v_team_id);
end;
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

  if not public.can_operate_project(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
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

revoke all on function public.assign_project_team(uuid, uuid) from public;
revoke execute on function public.assign_project_team(uuid, uuid) from anon;
revoke execute on function public.assign_project_team(uuid, uuid) from service_role;
grant execute on function public.assign_project_team(uuid, uuid) to authenticated;

revoke all on function public.get_access_management_directory() from public;
revoke execute on function public.get_access_management_directory() from anon;
revoke execute on function public.get_access_management_directory() from service_role;
grant execute on function public.get_access_management_directory() to authenticated;

revoke all on function public.create_team(text, text) from public;
revoke execute on function public.create_team(text, text) from anon;
revoke execute on function public.create_team(text, text) from service_role;
grant execute on function public.create_team(text, text) to authenticated;
