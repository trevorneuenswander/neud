-- =============================================================================
-- NEUD v0.3.0: ensure the SEMA cloud project exists for Project Access
-- =============================================================================
-- Project Access reads public.projects via get_access_management_directory.
-- SEMA must appear there for authorized users even when not downloaded locally.
-- Uses a stable UUID so desktop package directory linking can remain deterministic.

create or replace function public.ensure_sema_cloud_project()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid := '5e0a0001-0000-4000-8000-000000000001'::uuid;
  v_owner_id uuid;
  v_existing_id uuid;
begin
  select id
  into v_existing_id
  from public.projects
  where slug = 'sema'
  limit 1;

  if v_existing_id is not null then
    update public.projects
    set
      name = coalesce(nullif(btrim(name), ''), 'SEMA'),
      project_type = 'sema-schedule'::public.project_type,
      is_active = true,
      archived_at = null,
      updated_at = now()
    where id = v_existing_id;
    return v_existing_id;
  end if;

  select id
  into v_owner_id
  from public.profiles
  where role = 'owner'
  order by created_at asc
  limit 1;

  if v_owner_id is null then
    return null;
  end if;

  insert into public.projects (
    id,
    owner_id,
    name,
    slug,
    description,
    project_type,
    status,
    icon,
    is_active,
    registered_by_user_id
  ) values (
    v_project_id,
    v_owner_id,
    'SEMA',
    'sema',
    'SEMA schedule graphics driven by Google Sheets with local controller backup.',
    'sema-schedule'::public.project_type,
    'active',
    'sema',
    true,
    v_owner_id
  )
  on conflict (id) do update
  set
    name = excluded.name,
    slug = excluded.slug,
    project_type = excluded.project_type,
    is_active = true,
    archived_at = null,
    updated_at = now();

  insert into public.project_members (
    project_id,
    user_id,
    access_level,
    assigned_by
  ) values (
    v_project_id,
    v_owner_id,
    'manager',
    v_owner_id
  )
  on conflict do nothing;

  return v_project_id;
end;
$$;

revoke all on function public.ensure_sema_cloud_project() from public;
revoke all on function public.ensure_sema_cloud_project() from anon;
grant execute on function public.ensure_sema_cloud_project() to authenticated;
grant execute on function public.ensure_sema_cloud_project() to service_role;

select public.ensure_sema_cloud_project();

-- Keep SEMA present for Project Access even if the one-shot seed ran before an owner existed.
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

  perform public.ensure_sema_cloud_project();

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
