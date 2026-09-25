-- 054_v0_2_1_team_member_count_and_owner_project_access.sql
-- Count only active team memberships with existing profiles; block sole-owner project removal.

create or replace function public.count_team_active_members(p_team_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.team_memberships tm
  inner join public.profiles p on p.id = tm.user_id
  where tm.team_id = p_team_id
    and tm.status = 'active';
$$;

revoke all on function public.count_team_active_members(uuid) from public;
revoke execute on function public.count_team_active_members(uuid) from anon;
revoke execute on function public.count_team_active_members(uuid) from service_role;
grant execute on function public.count_team_active_members(uuid) to authenticated;

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

  if public.is_sole_owner_user(p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'owner_protected');
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

create or replace function public.get_access_management_directory(
  p_include_fixtures boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_teams jsonb := '[]'::jsonb;
  v_team_memberships jsonb := '[]'::jsonb;
  v_users jsonb := '[]'::jsonb;
  v_projects jsonb := '[]'::jsonb;
  v_project_members jsonb := '[]'::jsonb;
  v_project_teams jsonb := '[]'::jsonb;
  v_invitations jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  v_is_owner := public.has_site_wide_access();

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'slug', t.slug,
      'description', t.description,
      'isActive', t.is_active,
      'memberCount', public.count_team_active_members(t.id)
    ) order by t.name), '[]'::jsonb)
    into v_teams
    from public.teams t
    where t.deleted_at is null
      and t.is_active = true
      and (p_include_fixtures or not public.is_validation_fixture_team_name(t.name));
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'slug', t.slug,
      'description', t.description,
      'isActive', t.is_active,
      'memberCount', public.count_team_active_members(t.id)
    ) order by t.name), '[]'::jsonb)
    into v_teams
    from public.teams t
    where t.deleted_at is null
      and t.is_active = true
      and public.is_team_admin(t.id)
      and (p_include_fixtures or not public.is_validation_fixture_team_name(t.name));
  end if;

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', tm.team_id,
      'userId', tm.user_id,
      'role', tm.role,
      'userName', coalesce(p.full_name, ''),
      'userEmail', coalesce(p.email, '')
    ) order by coalesce(p.full_name, p.email)), '[]'::jsonb)
    into v_team_memberships
    from public.team_memberships tm
    join public.profiles p on p.id = tm.user_id
    join public.teams t on t.id = tm.team_id
    where tm.status = 'active'
      and (p_include_fixtures or not public.is_validation_fixture_team_name(t.name))
      and (p_include_fixtures or not public.is_validation_fixture_email(p.email));
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', tm.team_id,
      'userId', tm.user_id,
      'role', tm.role,
      'userName', coalesce(p.full_name, ''),
      'userEmail', coalesce(p.email, '')
    ) order by coalesce(p.full_name, p.email)), '[]'::jsonb)
    into v_team_memberships
    from public.team_memberships tm
    join public.profiles p on p.id = tm.user_id
    join public.teams t on t.id = tm.team_id
    where tm.status = 'active'
      and public.is_team_admin(t.id)
      and (p_include_fixtures or not public.is_validation_fixture_team_name(t.name))
      and (p_include_fixtures or not public.is_validation_fixture_email(p.email));
  end if;

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'fullName', coalesce(p.full_name, ''),
      'email', coalesce(p.email, ''),
      'platformRole', p.role,
      'team', coalesce(p.team, ''),
      'accountStatus', 'active'
    ) order by coalesce(p.full_name, p.email)), '[]'::jsonb)
    into v_users
    from public.profiles p
    where (p_include_fixtures or not public.is_validation_fixture_email(p.email))
      and (
        p.role in ('owner', 'admin')
        or exists (
          select 1
          from public.team_memberships tm
          join public.teams t on t.id = tm.team_id
          where tm.user_id = p.id
            and tm.status = 'active'
            and (p_include_fixtures or not public.is_validation_fixture_team_name(t.name))
        )
        or exists (
          select 1
          from public.project_members pm
          join public.projects pr on pr.id = pm.project_id
          where pm.user_id = p.id
            and coalesce(pr.is_active, true) = true
            and pr.archived_at is null
            and (p_include_fixtures or not public.is_validation_fixture_project(pr.slug, pr.name))
        )
      );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'name', pr.name,
    'slug', pr.slug
  ) order by pr.name), '[]'::jsonb)
  into v_projects
  from public.projects pr
  where coalesce(pr.is_active, true) = true
    and pr.archived_at is null
    and (v_is_owner or public.can_view_project(pr.id))
    and (p_include_fixtures or not public.is_validation_fixture_project(pr.slug, pr.name));

  select coalesce(jsonb_agg(jsonb_build_object(
    'projectId', pm.project_id,
    'userId', pm.user_id,
    'role', pm.access_level
  )), '[]'::jsonb)
  into v_project_members
  from public.project_members pm
  join public.projects pr on pr.id = pm.project_id
  where (v_is_owner or public.can_view_project(pm.project_id))
    and coalesce(pr.is_active, true) = true
    and pr.archived_at is null
    and (p_include_fixtures or not public.is_validation_fixture_project(pr.slug, pr.name));

  select coalesce(jsonb_agg(jsonb_build_object(
    'projectId', pta.project_id,
    'teamId', pta.team_id
  )), '[]'::jsonb)
  into v_project_teams
  from public.project_team_assignments pta
  join public.projects pr on pr.id = pta.project_id
  join public.teams t on t.id = pta.team_id
  where (v_is_owner or public.can_view_project(pta.project_id))
    and coalesce(pr.is_active, true) = true
    and pr.archived_at is null
    and (p_include_fixtures or not public.is_validation_fixture_project(pr.slug, pr.name))
    and (p_include_fixtures or not public.is_validation_fixture_team_name(t.name));

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
    where i.status in ('pending', 'accepted', 'expired', 'revoked')
      and (p_include_fixtures or not public.is_validation_fixture_email(i.email_normalized));
  end if;

  return jsonb_build_object(
    'ok', true,
    'teams', coalesce(v_teams, '[]'::jsonb),
    'teamMemberships', coalesce(v_team_memberships, '[]'::jsonb),
    'users', coalesce(v_users, '[]'::jsonb),
    'projects', coalesce(v_projects, '[]'::jsonb),
    'projectMembers', coalesce(v_project_members, '[]'::jsonb),
    'projectTeams', coalesce(v_project_teams, '[]'::jsonb),
    'invitations', coalesce(v_invitations, '[]'::jsonb)
  );
end;
$$;
