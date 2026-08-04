-- 042_fix_access_management_directory.sql
-- Fix directory RPC users query: profiles has no is_active column (42703 at runtime).
-- Replaces function body only; does not modify 036 or 041 files.

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
      'teamId', tm.team_id,
      'userId', tm.user_id,
      'role', tm.role,
      'userName', coalesce(p.full_name, ''),
      'userEmail', coalesce(p.email, '')
    ) order by coalesce(p.full_name, p.email)), '[]'::jsonb)
    into v_team_memberships
    from public.team_memberships tm
    join public.profiles p on p.id = tm.user_id
    where tm.status = 'active';
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
      and public.is_team_admin(t.id);
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
    from public.profiles p;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'name', pr.name,
    'slug', pr.slug
  ) order by pr.name), '[]'::jsonb)
  into v_projects
  from public.projects pr
  where coalesce(pr.is_active, true) = true
    and (v_is_owner or public.can_view_project(pr.id));

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

revoke all on function public.get_access_management_directory() from public;
revoke execute on function public.get_access_management_directory() from anon;
revoke execute on function public.get_access_management_directory() from service_role;
grant execute on function public.get_access_management_directory() to authenticated;
