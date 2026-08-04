-- =============================================================================
-- NEUD Alpha v0.1.1 Slice 2.2: authenticated desktop cloud authorization
-- =============================================================================
--
-- Removes dependency on service_role for desktop display sync, activity sync,
-- directory reads, and desktop host registration.
--
-- Dependency: 002, 011, 012, 018
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared authorization helpers
-- -----------------------------------------------------------------------------

create or replace function public.can_view_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_project_member(p_project_id);
$$;

create or replace function public.can_operate_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case public.get_project_access_level(p_project_id)
    when 'admin' then true
    when 'manager' then true
    when 'operator' then true
    else false
  end;
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_platform_admin()
    or public.is_project_manager(p_project_id);
$$;

create or replace function public.can_manage_project_users(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_manage_project(p_project_id);
$$;

revoke all on function public.can_view_project(uuid) from public;
revoke all on function public.can_operate_project(uuid) from public;
revoke all on function public.can_manage_project(uuid) from public;
revoke all on function public.can_manage_project_users(uuid) from public;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.can_operate_project(uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
grant execute on function public.can_manage_project_users(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Display project_id immutability
-- -----------------------------------------------------------------------------

create or replace function public.prevent_display_project_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'display project_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists displays_prevent_project_id_change on public.displays;
create trigger displays_prevent_project_id_change
  before update on public.displays
  for each row execute function public.prevent_display_project_id_change();

drop trigger if exists display_revisions_prevent_project_id_change on public.display_revisions;
create trigger display_revisions_prevent_project_id_change
  before update on public.display_revisions
  for each row execute function public.prevent_display_project_id_change();

-- -----------------------------------------------------------------------------
-- Display RLS
-- -----------------------------------------------------------------------------

drop policy if exists displays_select on public.displays;
create policy displays_select
  on public.displays for select
  to authenticated
  using (public.can_view_project(project_id));

drop policy if exists displays_insert on public.displays;
create policy displays_insert
  on public.displays for insert
  to authenticated
  with check (public.can_operate_project(project_id));

drop policy if exists displays_update on public.displays;
create policy displays_update
  on public.displays for update
  to authenticated
  using (public.can_operate_project(project_id))
  with check (public.can_operate_project(project_id));

drop policy if exists displays_delete on public.displays;
create policy displays_delete
  on public.displays for delete
  to authenticated
  using (public.can_manage_project(project_id));

drop policy if exists display_revisions_select on public.display_revisions;
create policy display_revisions_select
  on public.display_revisions for select
  to authenticated
  using (public.can_view_project(project_id));

drop policy if exists display_revisions_insert on public.display_revisions;
create policy display_revisions_insert
  on public.display_revisions for insert
  to authenticated
  with check (public.can_operate_project(project_id));

drop policy if exists display_revisions_update on public.display_revisions;
create policy display_revisions_update
  on public.display_revisions for update
  to authenticated
  using (public.can_operate_project(project_id))
  with check (public.can_operate_project(project_id));

drop policy if exists display_revisions_delete on public.display_revisions;
create policy display_revisions_delete
  on public.display_revisions for delete
  to authenticated
  using (public.can_manage_project(project_id));

drop policy if exists display_deletion_tombstones_select on public.display_deletion_tombstones;
create policy display_deletion_tombstones_select
  on public.display_deletion_tombstones for select
  to authenticated
  using (public.can_view_project(project_id));

drop policy if exists display_deletion_tombstones_insert on public.display_deletion_tombstones;
create policy display_deletion_tombstones_insert
  on public.display_deletion_tombstones for insert
  to authenticated
  with check (public.can_operate_project(project_id));

drop policy if exists display_deletion_tombstones_update on public.display_deletion_tombstones;
create policy display_deletion_tombstones_update
  on public.display_deletion_tombstones for update
  to authenticated
  using (public.can_operate_project(project_id))
  with check (public.can_operate_project(project_id));

-- -----------------------------------------------------------------------------
-- Activity RLS + authenticated upsert RPC
-- -----------------------------------------------------------------------------

drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select
  on public.activity_events for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_platform_admin()
      or (
        project_id is not null
        and public.can_view_project(project_id)
      )
      or (
        project_id is null
        and user_id = auth.uid()
      )
    )
  );

create or replace function public.upsert_activity_events_for_sync(
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event jsonb;
  v_project_id uuid;
  v_event_type text;
  v_allowed_types text[] := array[
    'access.team-created',
    'access.team-updated',
    'access.user-invited',
    'access.user-updated',
    'access.project-assigned',
    'access.project-unassigned',
    'project.created',
    'project.updated',
    'project.deleted',
    'display.created',
    'display.updated',
    'display.deleted',
    'display.published',
    'engine.started',
    'engine.stopped',
    'engine.error',
    'data-source.updated',
    'manual.override',
    'system.info',
    'system.warning',
    'system.error',
    'user.action'
  ];
  v_inserted integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'authentication_required',
      'message', 'Sign in required.'
    );
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'events must be a JSON array.'
    );
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_project_id := nullif(v_event->>'project_id', '')::uuid;
    v_event_type := btrim(v_event->>'event_type');

    if v_event->>'id' is null or v_event_type is null or btrim(v_event->>'description') = '' then
      return jsonb_build_object(
        'ok', false,
        'code', 'invalid_input',
        'message', 'Each activity event requires id, event_type, and description.'
      );
    end if;

    if not (v_event_type = any (v_allowed_types)) then
      return jsonb_build_object(
        'ok', false,
        'code', 'forbidden',
        'message', 'Activity event type is not allowed.',
        'event_type', v_event_type
      );
    end if;

    if v_project_id is not null and not public.can_operate_project(v_project_id) then
      return jsonb_build_object(
        'ok', false,
        'code', 'forbidden',
        'message', 'You do not have permission to write activity for this project.',
        'project_id', v_project_id
      );
    end if;

    insert into public.activity_events (
      id,
      project_id,
      team_id,
      user_id,
      actor_display_name,
      event_type,
      description,
      metadata,
      source,
      severity,
      source_instance_id,
      source_local_id,
      occurred_at,
      created_at,
      updated_at,
      deleted_at
    ) values (
      (v_event->>'id')::uuid,
      v_project_id,
      nullif(v_event->>'team_id', '')::uuid,
      v_user_id,
      nullif(v_event->>'actor_display_name', ''),
      v_event_type,
      btrim(v_event->>'description'),
      coalesce(v_event->'metadata', '{}'::jsonb),
      nullif(v_event->>'source', ''),
      coalesce(nullif(v_event->>'severity', ''), 'info'),
      (v_event->>'source_instance_id')::uuid,
      nullif(v_event->>'source_local_id', ''),
      coalesce((v_event->>'occurred_at')::timestamptz, now()),
      coalesce((v_event->>'created_at')::timestamptz, now()),
      coalesce((v_event->>'updated_at')::timestamptz, now()),
      null
    )
    on conflict (id) do update
    set
      project_id = excluded.project_id,
      team_id = excluded.team_id,
      user_id = excluded.user_id,
      actor_display_name = excluded.actor_display_name,
      event_type = excluded.event_type,
      description = excluded.description,
      metadata = excluded.metadata,
      source = excluded.source,
      severity = excluded.severity,
      source_instance_id = excluded.source_instance_id,
      source_local_id = excluded.source_local_id,
      occurred_at = excluded.occurred_at,
      updated_at = excluded.updated_at
    where public.activity_events.user_id = v_user_id
      and (
        excluded.project_id is null
        or public.can_operate_project(excluded.project_id)
      );

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'code', 'upserted',
    'count', v_inserted
  );
end;
$$;

revoke all on function public.upsert_activity_events_for_sync(jsonb) from public;
grant execute on function public.upsert_activity_events_for_sync(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Desktop host registration (authenticated)
-- -----------------------------------------------------------------------------

create or replace function public.upsert_desktop_host_for_client(
  p_host_id uuid,
  p_display_name text,
  p_hostname text,
  p_platform text,
  p_app_version text
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
    return jsonb_build_object(
      'ok', false,
      'code', 'authentication_required',
      'message', 'Sign in required.'
    );
  end if;

  if p_host_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'host_id is required.'
    );
  end if;

  insert into public.desktop_hosts (
    id,
    display_name,
    hostname,
    platform,
    app_version,
    last_seen_at,
    enabled
  ) values (
    p_host_id,
    coalesce(nullif(btrim(p_display_name), ''), 'NEUD Desktop'),
    coalesce(nullif(btrim(p_hostname), ''), 'unknown'),
    coalesce(nullif(btrim(p_platform), ''), 'unknown'),
    coalesce(nullif(btrim(p_app_version), ''), '0.0.0'),
    now(),
    true
  )
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    hostname = excluded.hostname,
    platform = excluded.platform,
    app_version = excluded.app_version,
    last_seen_at = excluded.last_seen_at,
    enabled = true;

  return jsonb_build_object('ok', true, 'code', 'host_registered');
end;
$$;

revoke all on function public.upsert_desktop_host_for_client(uuid, text, text, text, text) from public;
grant execute on function public.upsert_desktop_host_for_client(uuid, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Authorized user directory for desktop sync
-- -----------------------------------------------------------------------------

create or replace function public.get_authorized_users_directory()
returns table (
  id uuid,
  full_name text,
  team text,
  role text,
  email text,
  created_at timestamptz,
  assigned_project_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.team,
    p.role,
    coalesce(p.email, u.email),
    p.created_at,
    (
      select count(*)::bigint
      from public.project_members pm
      where pm.user_id = p.id
    ) as assigned_project_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_platform_admin()
  order by coalesce(p.full_name, coalesce(p.email, u.email)) asc;
$$;

create or replace function public.get_accessible_project_users_directory()
returns table (
  user_id uuid,
  full_name text,
  team text,
  role text,
  email text,
  project_id uuid,
  access_level text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    pm.user_id,
    p.full_name,
    p.team,
    p.role,
    coalesce(p.email, u.email),
    pm.project_id,
    pm.access_level
  from public.project_members pm
  join public.profiles p on p.id = pm.user_id
  join auth.users u on u.id = pm.user_id
  where public.is_project_member(pm.project_id)
  order by pm.project_id asc, coalesce(p.full_name, coalesce(p.email, u.email)) asc;
$$;

revoke all on function public.get_authorized_users_directory() from public;
revoke all on function public.get_accessible_project_users_directory() from public;
grant execute on function public.get_authorized_users_directory() to authenticated;
grant execute on function public.get_accessible_project_users_directory() to authenticated;
