-- 065_team_admin_last_admin_guard.sql
-- DRAFT — PREVIEW VALIDATED on qiilpmtfurhtczizduwz (NEUD Alpha Preview).
-- PRODUCTION APPLICATION NOT AUTHORIZED without separate Owner approval.
--
-- Purpose: Prevent cloud Team Admin demote/remove from leaving a team with zero
-- active Admins (mirrors desktop AccessManagementService last-Admin protection).
--
-- Concurrency: serialize mutations per team with a transaction-scoped advisory
-- lock before counting Admins, so two concurrent removals cannot both pass a
-- stale "count > 1" check and leave zero Admins.
--
-- Compatibility: additive RPC replace only; no table drops.
-- Rollback: restore upsert_team_member / remove_team_member from migration 045
--           (or the later superseding migration currently deployed).

-- NOTE: public.profiles has no is_active column in production (see migration 042).
-- Count only active Admin memberships; do not reference profiles.is_active.
create or replace function public.count_team_active_admins(p_team_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.team_memberships tm
  where tm.team_id = p_team_id
    and tm.status = 'active'
    and tm.role = 'admin';
$$;

revoke all on function public.count_team_active_admins(uuid) from public;
revoke execute on function public.count_team_active_admins(uuid) from anon;
revoke execute on function public.count_team_active_admins(uuid) from service_role;
grant execute on function public.count_team_active_admins(uuid) to authenticated;

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

  -- Serialize concurrent membership mutations for this team within the transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_team_id::text, 0));

  select tm.role into v_existing_role
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = p_user_id
  for update;

  if v_existing_role = 'admin'
     and p_role <> 'admin'
     and public.count_team_active_admins(p_team_id) <= 1 then
    return jsonb_build_object('ok', false, 'code', 'last_team_admin_protected');
  end if;

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
declare
  v_existing_role text;
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

  perform pg_advisory_xact_lock(hashtextextended(p_team_id::text, 0));

  select tm.role into v_existing_role
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = p_user_id
  for update;

  if v_existing_role = 'admin'
     and public.count_team_active_admins(p_team_id) <= 1 then
    return jsonb_build_object('ok', false, 'code', 'last_team_admin_protected');
  end if;

  delete from public.team_memberships where team_id = p_team_id and user_id = p_user_id;
  insert into public.activity_events (id, user_id, event_type, description, source, severity, source_instance_id, occurred_at)
  values (gen_random_uuid(), auth.uid(), 'team.member_removed', 'Team member removed.', 'access-management', 'info', gen_random_uuid(), now());
  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;
