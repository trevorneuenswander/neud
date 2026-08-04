-- 031_project_display_sort_order.sql
-- Cloud project display order + authenticated reorder RPC for hosted/desktop parity.

alter table public.displays
  add column if not exists sort_order double precision;

create index if not exists idx_displays_project_sort_order
  on public.displays (project_id, sort_order)
  where deleted_at is null and is_archived = false;

create or replace function public.reorder_project_displays(
  p_project_id uuid,
  p_display_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_count integer;
  v_actual_count integer;
  v_index integer;
  v_display_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if not public.can_operate_project(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_display_ids is null or array_length(p_display_ids, 1) is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Display order is required.');
  end if;

  if array_length(p_display_ids, 1) <> (select count(distinct entry) from unnest(p_display_ids) as entry) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Duplicate display ids are not allowed.');
  end if;

  select count(*)::integer
  into v_expected_count
  from public.displays d
  where d.project_id = p_project_id
    and d.deleted_at is null
    and d.is_archived = false;

  select count(*)::integer
  into v_actual_count
  from public.displays d
  where d.project_id = p_project_id
    and d.deleted_at is null
    and d.is_archived = false
    and d.id = any(p_display_ids);

  if v_actual_count <> array_length(p_display_ids, 1) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Display order must include every active project display exactly once.');
  end if;

  if v_expected_count <> array_length(p_display_ids, 1) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Display order must include every active project display exactly once.');
  end if;

  v_index := 0;
  foreach v_display_id in array p_display_ids loop
    update public.displays
    set sort_order = v_index,
        updated_at = now()
    where id = v_display_id
      and project_id = p_project_id
      and deleted_at is null
      and is_archived = false;
    v_index := v_index + 1;
  end loop;

  insert into public.activity_events (
    id,
    project_id,
    user_id,
    event_type,
    description,
    metadata,
    source,
    severity,
    source_instance_id,
    occurred_at
  ) values (
    gen_random_uuid(),
    p_project_id,
    v_user_id,
    'display.order_changed',
    'Reordered project displays.',
    jsonb_build_object(
      'displayCount', v_index,
      'displayIds', to_jsonb(p_display_ids)
    ),
    'hosted-portal',
    'info',
    gen_random_uuid(),
    now()
  );

  return jsonb_build_object('ok', true, 'code', 'reordered', 'count', v_index);
end;
$$;

-- Extend hosted/desktop activity allowlist for display order changes.
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
    'display.order_changed',
    'display.online_viewer_enabled',
    'display.online_viewer_disabled',
    'display.online_visibility_changed',
    'display.online_published',
    'display.online_publish_failed',
    'display.online_publish_resumed',
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
revoke execute on function public.upsert_activity_events_for_sync(jsonb) from anon;
revoke execute on function public.upsert_activity_events_for_sync(jsonb) from service_role;
grant execute on function public.upsert_activity_events_for_sync(jsonb) to authenticated;

revoke all on function public.reorder_project_displays(uuid, uuid[]) from public;
revoke execute on function public.reorder_project_displays(uuid, uuid[]) from anon;
revoke execute on function public.reorder_project_displays(uuid, uuid[]) from service_role;
grant execute on function public.reorder_project_displays(uuid, uuid[]) to authenticated;

drop function if exists public.list_project_active_displays(uuid);

create function public.list_project_active_displays(p_project_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  display_width integer,
  display_height integer,
  enabled boolean,
  online_viewer_enabled boolean,
  online_visibility text,
  online_published_at timestamptz,
  online_published_revision_id uuid,
  online_publish_error text,
  refresh_rate_ms integer,
  sort_order double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.slug,
    d.name,
    d.description,
    d.display_width,
    d.display_height,
    d.enabled,
    d.online_viewer_enabled,
    d.online_visibility,
    d.online_published_at,
    d.online_published_revision_id,
    d.online_publish_error,
    d.refresh_rate_ms,
    d.sort_order
  from public.displays d
  where d.project_id = p_project_id
    and d.deleted_at is null
    and d.is_archived = false
    and public.can_view_project(p_project_id)
  order by d.sort_order nulls last, d.name asc, d.slug asc;
$$;

revoke all on function public.list_project_active_displays(uuid) from public;
revoke execute on function public.list_project_active_displays(uuid) from anon;
revoke execute on function public.list_project_active_displays(uuid) from service_role;
grant execute on function public.list_project_active_displays(uuid) to authenticated;
