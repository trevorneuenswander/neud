-- 044_exclude_validation_fixtures_from_directory.sql
-- Hide automated validation fixtures from the access directory unless explicitly requested.

create or replace function public.is_validation_fixture_project(p_slug text, p_name text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(p_slug, '') like 'neud-validation-%'
    or coalesce(p_slug, '') like 'live-a-%'
    or coalesce(p_slug, '') like 'live-b-%'
    or coalesce(p_slug, '') like 'rate-%'
    or coalesce(p_slug, '') like 'anon-%'
    or coalesce(p_name, '') like '[NEUD Validation]%';
$$;

create or replace function public.is_validation_fixture_team_name(p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_name, '') ~ '^Matrix Team [0-9]+$';
$$;

create or replace function public.is_validation_fixture_email(p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(p_email), '') like '%@example.com';
$$;

drop function if exists public.get_access_management_directory();

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
      'memberCount', (
        select count(*)::integer from public.team_memberships tm2
        where tm2.team_id = t.id and tm2.status = 'active'
      )
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

revoke all on function public.get_access_management_directory(boolean) from public;
revoke execute on function public.get_access_management_directory(boolean) from anon;
revoke execute on function public.get_access_management_directory(boolean) from service_role;
grant execute on function public.get_access_management_directory(boolean) to authenticated;

revoke all on function public.is_validation_fixture_project(text, text) from public;
revoke all on function public.is_validation_fixture_team_name(text) from public;
revoke all on function public.is_validation_fixture_email(text) from public;
