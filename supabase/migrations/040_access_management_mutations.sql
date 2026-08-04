-- 040_access_management_mutations.sql
-- Complete access-management mutation RPCs for shared portal/desktop use.

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
  if not public.is_platform_owner() and not public.is_team_admin(p_team_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.teams
  set name = coalesce(nullif(btrim(p_name), ''), name),
      description = case when p_description is null then description else nullif(btrim(p_description), '') end,
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where id = p_team_id and deleted_at is null;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.updated', 'Updated team.', 'access-management', 'info', gen_random_uuid(), now());
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
  if not public.is_platform_owner() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.teams set is_active = false, deleted_at = now(), updated_at = now() where id = p_team_id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.archived', 'Archived team.', 'access-management', 'info', gen_random_uuid(), now());
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
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if not public.is_platform_owner() and not public.is_team_admin(p_team_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_role not in ('owner', 'admin', 'member') then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  insert into public.team_memberships (team_id, user_id, role, created_by)
  values (p_team_id, p_user_id, p_role, auth.uid())
  on conflict (team_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.member_added', 'Updated team membership.', 'access-management', 'info', gen_random_uuid(), now());
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
  if not public.is_platform_owner() and not public.is_team_admin(p_team_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  delete from public.team_memberships where team_id = p_team_id and user_id = p_user_id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.member_removed', 'Removed team member.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'removed');
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
  if not public.can_operate_project(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  delete from public.project_team_assignments where project_id = p_project_id and team_id = p_team_id;
  insert into public.activity_events (id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), p_project_id, auth.uid(), 'project.team_removed', 'Removed team from project.', 'access-management', 'info', gen_random_uuid(), now());
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
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if not public.can_operate_project(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_role not in ('manager', 'operator', 'viewer') then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  insert into public.project_members (project_id, user_id, access_level)
  values (p_project_id, p_user_id, p_role)
  on conflict (project_id, user_id) do update set access_level = excluded.access_level;
  insert into public.activity_events (id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), p_project_id, auth.uid(), 'project.member_added', 'Updated project member.', 'access-management', 'info', gen_random_uuid(), now());
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
  if not public.can_operate_project(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
  insert into public.activity_events (id, project_id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), p_project_id, auth.uid(), 'project.member_removed', 'Removed project member.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;

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
  if not public.is_platform_owner() and (p_team_id is null or not public.is_team_admin(p_team_id)) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
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
    v_email, auth.uid(), p_team_id, p_platform_role, p_team_role,
    coalesce(p_project_assignments, '[]'::jsonb), p_token_hash,
    coalesce(p_expires_at, now() + interval '7 days')
  ) returning id into v_id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.created', 'Created invitation.', 'access-management', 'info', gen_random_uuid(), now());
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
  if not public.is_platform_owner() and not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.cloud_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_invitation_id and status = 'pending';
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.revoked', 'Revoked invitation.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'revoked');
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
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
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
    return jsonb_build_object('ok', false, 'code', 'invitation_expired');
  end if;
  if v_invitation.status = 'accepted' then
    return jsonb_build_object('ok', false, 'code', 'conflict');
  end if;
  update public.cloud_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = v_invitation.id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'invitation.accepted', 'Accepted invitation.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'accepted', 'invitation_id', v_invitation.id);
end;
$$;

revoke all on function public.update_team(uuid, text, text, boolean) from public;
revoke execute on function public.update_team(uuid, text, text, boolean) from anon;
revoke execute on function public.update_team(uuid, text, text, boolean) from service_role;
grant execute on function public.update_team(uuid, text, text, boolean) to authenticated;

revoke all on function public.archive_team(uuid) from public;
revoke execute on function public.archive_team(uuid) from anon;
revoke execute on function public.archive_team(uuid) from service_role;
grant execute on function public.archive_team(uuid) to authenticated;

revoke all on function public.upsert_team_member(uuid, uuid, text) from public;
revoke execute on function public.upsert_team_member(uuid, uuid, text) from anon;
revoke execute on function public.upsert_team_member(uuid, uuid, text) from service_role;
grant execute on function public.upsert_team_member(uuid, uuid, text) to authenticated;

revoke all on function public.remove_team_member(uuid, uuid) from public;
revoke execute on function public.remove_team_member(uuid, uuid) from anon;
revoke execute on function public.remove_team_member(uuid, uuid) from service_role;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

revoke all on function public.remove_project_team(uuid, uuid) from public;
revoke execute on function public.remove_project_team(uuid, uuid) from anon;
revoke execute on function public.remove_project_team(uuid, uuid) from service_role;
grant execute on function public.remove_project_team(uuid, uuid) to authenticated;

revoke all on function public.upsert_project_member(uuid, uuid, text) from public;
revoke execute on function public.upsert_project_member(uuid, uuid, text) from anon;
revoke execute on function public.upsert_project_member(uuid, uuid, text) from service_role;
grant execute on function public.upsert_project_member(uuid, uuid, text) to authenticated;

revoke all on function public.remove_project_member(uuid, uuid) from public;
revoke execute on function public.remove_project_member(uuid, uuid) from anon;
revoke execute on function public.remove_project_member(uuid, uuid) from service_role;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;

revoke all on function public.create_cloud_invitation(text, uuid, text, text, text, timestamptz, jsonb) from public;
revoke execute on function public.create_cloud_invitation(text, uuid, text, text, text, timestamptz, jsonb) from anon;
revoke execute on function public.create_cloud_invitation(text, uuid, text, text, text, timestamptz, jsonb) from service_role;
grant execute on function public.create_cloud_invitation(text, uuid, text, text, text, timestamptz, jsonb) to authenticated;

revoke all on function public.revoke_cloud_invitation(uuid) from public;
revoke execute on function public.revoke_cloud_invitation(uuid) from anon;
revoke execute on function public.revoke_cloud_invitation(uuid) from service_role;
grant execute on function public.revoke_cloud_invitation(uuid) to authenticated;

revoke all on function public.accept_cloud_invitation(text) from public;
revoke execute on function public.accept_cloud_invitation(text) from anon;
revoke execute on function public.accept_cloud_invitation(text) from service_role;
grant execute on function public.accept_cloud_invitation(text) to authenticated;
