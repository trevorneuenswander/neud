-- 045_access_role_model.sql
-- Sole-owner protection, NEUD-admin site-wide access, and access-management hardening.

-- -----------------------------------------------------------------------------
-- Identity helpers (stable UUID + team identity; not display-name alone)
-- -----------------------------------------------------------------------------

create or replace function public.sole_owner_email()
returns text
language sql
immutable
as $$
  select 'trevorneuenswander@gmail.com';
$$;

create or replace function public.sole_owner_user_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.id
  from public.profiles p
  where lower(coalesce(p.email, '')) = public.sole_owner_email()
    and p.role = 'owner'
  order by p.created_at asc
  limit 1;
$$;

create or replace function public.is_sole_owner_user(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_user_id is not null
    and p_user_id = public.sole_owner_user_id();
$$;

create or replace function public.is_neud_team(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.deleted_at is null
      and (
        lower(coalesce(t.name, '')) = 'neud'
        or lower(coalesce(t.slug, '')) = 'neud'
      )
  );
$$;

create or replace function public.is_neud_team_admin()
returns boolean
language sql
security definer
stable
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
security definer
stable
set search_path = public
as $$
  select public.is_platform_owner()
    or public.is_neud_team_admin();
$$;

revoke all on function public.sole_owner_email() from public;
revoke all on function public.sole_owner_user_id() from public;
revoke all on function public.is_sole_owner_user(uuid) from public;
revoke all on function public.is_neud_team(uuid) from public;
revoke all on function public.is_neud_team_admin() from public;
revoke all on function public.has_site_wide_access() from public;

grant execute on function public.sole_owner_email() to authenticated;
grant execute on function public.sole_owner_user_id() to authenticated;
grant execute on function public.is_sole_owner_user(uuid) to authenticated;
grant execute on function public.is_neud_team(uuid) to authenticated;
grant execute on function public.is_neud_team_admin() to authenticated;
grant execute on function public.has_site_wide_access() to authenticated;

-- -----------------------------------------------------------------------------
-- Team admin scope: site-wide admins or team-specific admins (never team owner role)
-- -----------------------------------------------------------------------------

create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language sql
security definer
stable
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

-- -----------------------------------------------------------------------------
-- Project access helpers: site-wide access replaces profile-admin shortcut
-- -----------------------------------------------------------------------------

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.has_site_wide_access()
    or exists (
      select 1
      from public.project_members
      where project_id = p_project_id
        and user_id = auth.uid()
    );
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
    else (
      select access_level
      from public.project_members
      where project_id = p_project_id
        and user_id = auth.uid()
    )
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
    or exists (
      select 1
      from public.project_members
      where project_id = p_project_id
        and user_id = auth.uid()
        and access_level = 'manager'
    );
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_site_wide_access()
    or public.is_project_manager(p_project_id);
$$;

-- -----------------------------------------------------------------------------
-- Team lifecycle
-- -----------------------------------------------------------------------------

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

  if not public.has_site_wide_access() then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Team name is required.');
  end if;

  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);

  insert into public.teams (name, slug, description, created_by)
  values (v_name, v_slug, null, v_user_id)
  returning id into v_team_id;

  insert into public.team_memberships (team_id, user_id, role, created_by)
  values (v_team_id, v_user_id, 'admin', v_user_id);

  insert into public.activity_events (
    id, user_id, event_type, description, source, severity, source_instance_id, occurred_at
  ) values (
    gen_random_uuid(), v_user_id, 'team.created', 'Team created.', 'access-management', 'info', gen_random_uuid(), now()
  );

  return jsonb_build_object('ok', true, 'code', 'created', 'team_id', v_team_id);
end;
$$;

create or replace function public.update_team(
  p_team_id uuid,
  p_name text default null,
  p_description text default null,
  p_is_active boolean default null
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
  update public.teams
  set name = coalesce(nullif(btrim(p_name), ''), name),
      description = case when p_description is null then description else null end,
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where id = p_team_id and deleted_at is null;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.updated', 'Team updated.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

create or replace function public.archive_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if not public.has_site_wide_access() then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;
  if public.is_neud_team(p_team_id) then
    return jsonb_build_object('ok', false, 'code', 'owner_team_protected');
  end if;
  update public.teams set is_active = false, deleted_at = now(), updated_at = now() where id = p_team_id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.archived', 'Team archived.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'archived');
end;
$$;

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
    gen_random_uuid(),
    auth.uid(),
    case when v_existing_role is null then 'team.member_added' else 'team.role_changed' end,
    case
      when v_existing_role is null then 'Team member added.'
      when p_role = 'admin' then 'Team role changed to Admin.'
      else 'Team role changed to Member.'
    end,
    'access-management',
    'info',
    gen_random_uuid(),
    now()
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

-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------

create or replace function public.create_cloud_invitation(
  p_email text,
  p_team_id uuid default null,
  p_team_role text default null,
  p_platform_role text default null,
  p_token_hash text default null,
  p_expires_at timestamptz default null,
  p_project_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if not public.has_site_wide_access()
     and (p_team_id is null or not public.is_team_admin(p_team_id)) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;
  if p_team_role = 'owner' or lower(coalesce(p_platform_role, '')) = 'owner' then
    return jsonb_build_object('ok', false, 'code', 'owner_role_not_assignable');
  end if;
  if p_team_role is not null and p_team_role not in ('admin', 'member') then
    return jsonb_build_object('ok', false, 'code', 'invalid_team_role');
  end if;
  if v_email = '' or p_token_hash is null or btrim(p_token_hash) = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  if exists (
    select 1 from public.cloud_invitations i
    where i.email_normalized = v_email and i.status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'code', 'duplicate_invitation');
  end if;
  insert into public.cloud_invitations (
    email_normalized, invited_by, team_id, platform_role, team_role,
    project_assignments, token_hash, expires_at
  ) values (
    v_email, auth.uid(), p_team_id, null, p_team_role,
    coalesce(p_project_assignments, '[]'::jsonb), p_token_hash,
    coalesce(p_expires_at, now() + interval '7 days')
  ) returning id into v_id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.created', 'Invitation created.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'created', 'invitation_id', v_id);
end;
$$;

create or replace function public.revoke_cloud_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if not public.has_site_wide_access() then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;
  update public.cloud_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_invitation_id and status = 'pending';
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.revoked', 'Invitation revoked.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

create or replace function public.resend_cloud_invitation(
  p_invitation_id uuid,
  p_token_hash text default null,
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

  if not public.has_site_wide_access()
     and (v_invitation.team_id is null or not public.is_team_admin(v_invitation.team_id)) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
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
  values (gen_random_uuid(), auth.uid(), 'invitation.resent', 'Invitation resent.', 'access-management', 'info', gen_random_uuid(), now());

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

  if v_invitation.team_role = 'owner' then
    return jsonb_build_object('ok', false, 'code', 'owner_role_not_assignable');
  end if;

  if v_invitation.team_id is not null and v_invitation.team_role in ('admin', 'member') then
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
  values (gen_random_uuid(), auth.uid(), 'invitation.accepted', 'Invitation accepted.', 'access-management', 'info', gen_random_uuid(), now());

  return jsonb_build_object('ok', true, 'code', 'accepted', 'invitation_id', v_invitation.id);
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
  if not public.can_manage_project(p_project_id) then
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
  if not public.can_manage_project(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;
  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
  insert into public.activity_events (id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), p_project_id, auth.uid(), 'project.member_removed', 'Project access removed.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;

-- -----------------------------------------------------------------------------
-- Directory RPC: site-wide view for owner + NEUD admins only
-- -----------------------------------------------------------------------------

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

revoke all on function public.sole_owner_user_id() from public;
grant execute on function public.sole_owner_user_id() to authenticated;
