-- 049_display_enabled_activity_events.sql
-- Allow local display enable/disable activity events separate from online viewer.

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
  v_actor_display_name text;
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
    'display.enabled',
    'display.disabled',
    'display.online_viewer_enabled',
    'display.online_viewer_disabled',
    'display.online_visibility_changed',
    'display.online_published',
    'display.online_publish_failed',
    'display.online_publish_resumed',
    'display.activated_online',
    'display.deactivated_online',
    'team.created',
    'team.updated',
    'team.archived',
    'team.member_added',
    'team.member_removed',
    'team.member_role_changed',
    'project.member_added',
    'project.member_removed',
    'project.member_role_changed',
    'project.team_assigned',
    'project.team_removed',
    'invitation.created',
    'invitation.resent',
    'invitation.revoked',
    'invitation.accepted',
    'invitation.expired',
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

    v_actor_display_name := coalesce(
      nullif(btrim(v_event->>'actor_display_name'), ''),
      public.resolve_activity_actor_display_name(v_user_id)
    );

    insert into public.activity_events (
      id, project_id, team_id, user_id, actor_display_name, event_type, description,
      metadata, source, severity, source_instance_id, source_local_id,
      occurred_at, created_at, updated_at, deleted_at
    ) values (
      (v_event->>'id')::uuid,
      v_project_id,
      nullif(v_event->>'team_id', '')::uuid,
      v_user_id,
      v_actor_display_name,
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
    set project_id = excluded.project_id,
        team_id = excluded.team_id,
        user_id = excluded.user_id,
        actor_display_name = coalesce(
          nullif(excluded.actor_display_name, ''),
          public.resolve_activity_actor_display_name(excluded.user_id)
        ),
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
      and (excluded.project_id is null or public.can_operate_project(excluded.project_id));

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('ok', true, 'code', 'upserted', 'count', v_inserted);
end;
$$;
