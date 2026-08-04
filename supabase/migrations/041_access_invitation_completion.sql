-- 041_access_invitation_completion.sql
-- Resend invitation, complete accept assignments, extend access directory.

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
      'accountStatus', case when coalesce(p.is_active, true) then 'active' else 'inactive' end
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
    'teams', v_teams,
    'teamMemberships', v_team_memberships,
    'users', v_users,
    'projects', v_projects,
    'projectMembers', v_project_members,
    'projectTeams', v_project_teams,
    'invitations', v_invitations
  );
end;
$$;

create or replace function public.resend_cloud_invitation(
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  select * into v_invitation
  from public.cloud_invitations
  where id = p_invitation_id
  limit 1;

  if v_invitation.id is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.is_platform_owner()
     and not public.is_platform_admin()
     and (v_invitation.team_id is null or not public.is_team_admin(v_invitation.team_id)) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_invitation.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  if p_token_hash is null or btrim(p_token_hash) = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  update public.cloud_invitations
  set token_hash = btrim(p_token_hash),
      expires_at = coalesce(p_expires_at, now() + interval '7 days'),
      updated_at = now()
  where id = p_invitation_id and status = 'pending';

  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.resent', 'Resent invitation.', 'access-management', 'info', gen_random_uuid(), now());

  return jsonb_build_object('ok', true, 'code', 'resent', 'invitation_id', p_invitation_id);
end;
$$;

create or replace function public.accept_cloud_invitation(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_user_email text;
  v_assignment jsonb;
  v_project_id uuid;
  v_project_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  select lower(coalesce(p.email, '')) into v_user_email
  from public.profiles p
  where p.id = auth.uid();

  select * into v_invitation
  from public.cloud_invitations
  where token_hash = btrim(p_token_hash)
  limit 1;

  if v_invitation.id is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_invitation.status = 'revoked' then
    return jsonb_build_object('ok', false, 'code', 'invitation_revoked');
  end if;

  if v_invitation.status = 'expired' or v_invitation.expires_at < now() then
    update public.cloud_invitations set status = 'expired', updated_at = now()
    where id = v_invitation.id and status = 'pending';
    return jsonb_build_object('ok', false, 'code', 'invitation_expired');
  end if;

  if v_invitation.status = 'accepted' then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  if v_user_email = '' or v_user_email <> v_invitation.email_normalized then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_invitation.team_id is not null and v_invitation.team_role is not null then
    insert into public.team_memberships (team_id, user_id, role, created_by)
    values (v_invitation.team_id, auth.uid(), v_invitation.team_role, v_invitation.invited_by)
    on conflict (team_id, user_id) do update
      set role = excluded.role, status = 'active', updated_at = now();
  end if;

  for v_assignment in select value from jsonb_array_elements(coalesce(v_invitation.project_assignments, '[]'::jsonb))
  loop
    v_project_id := nullif(v_assignment->>'projectId', '')::uuid;
    v_project_role := nullif(v_assignment->>'role', '');
    if v_project_id is not null and v_project_role in ('manager', 'operator', 'viewer') then
      insert into public.project_members (project_id, user_id, access_level)
      values (v_project_id, auth.uid(), v_project_role)
      on conflict (project_id, user_id) do update set access_level = excluded.access_level;
    end if;
  end loop;

  update public.cloud_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.accepted', 'Accepted invitation.', 'access-management', 'info', gen_random_uuid(), now());

  return jsonb_build_object('ok', true, 'code', 'accepted', 'invitation_id', v_invitation.id);
end;
$$;

create or replace function public.revoke_cloud_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  select * into v_invitation from public.cloud_invitations where id = p_invitation_id limit 1;
  if v_invitation.id is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.is_platform_owner()
     and not public.is_platform_admin()
     and (v_invitation.team_id is null or not public.is_team_admin(v_invitation.team_id)) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_invitation.status = 'revoked' then
    return jsonb_build_object('ok', true, 'code', 'revoked');
  end if;

  if v_invitation.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;

  update public.cloud_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_invitation_id and status = 'pending';

  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.revoked', 'Revoked invitation.', 'access-management', 'info', gen_random_uuid(), now());

  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

revoke all on function public.resend_cloud_invitation(uuid, text, timestamptz) from public;
revoke execute on function public.resend_cloud_invitation(uuid, text, timestamptz) from anon;
revoke execute on function public.resend_cloud_invitation(uuid, text, timestamptz) from service_role;
grant execute on function public.resend_cloud_invitation(uuid, text, timestamptz) to authenticated;
