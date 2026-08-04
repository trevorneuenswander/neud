-- 024_display_online_viewer.sql
-- Per-display online viewer controls for Alpha v0.1.1 hosted portal delivery.
-- Additive only; extends displays without altering local enabled semantics.
--
-- Security model (viewer bundle RPC):
--   - SECURITY DEFINER with search_path = public.
--   - anon + authenticated may EXECUTE get_online_display_viewer_bundle only.
--   - service_role is revoked from viewer/list RPCs (no cloud bypass reads).
--   - Anonymous callers receive only enabled + public displays; all other cases
--     return { ok: false, code: 'not_found' } without distinguishing private
--     resources from missing slugs.
--   - Authenticated callers require can_view_project (Viewer+ membership).
--   - Disabled online viewers (online_viewer_enabled = false) are invisible.
--   - HTML comes only from online_published_revision_id (never active/draft).
--   - Canonical payload returns sanitized envelope.data only (render fields).
--   - Response excludes memberships, user records, secrets, scraper config,
--     unpublished revisions, and internal publishing diagnostics.

alter table public.displays
  add column if not exists online_viewer_enabled boolean not null default false;

alter table public.displays
  add column if not exists online_visibility text not null default 'private';

alter table public.displays
  add column if not exists online_published_at timestamptz;

alter table public.displays
  add column if not exists online_published_revision_id uuid;

alter table public.displays
  add column if not exists online_publish_error text;

alter table public.displays
  drop constraint if exists displays_online_visibility_check;

alter table public.displays
  add constraint displays_online_visibility_check
  check (online_visibility in ('private', 'public'));

create index if not exists idx_displays_online_viewer
  on public.displays (project_id, online_viewer_enabled, online_visibility)
  where deleted_at is null and online_viewer_enabled = true;

-- -----------------------------------------------------------------------------
-- Online display viewer bundle (authenticated + optional public access)
-- -----------------------------------------------------------------------------

create or replace function public.get_online_display_viewer_bundle(
  p_project_slug text,
  p_display_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project public.projects%rowtype;
  v_display public.displays%rowtype;
  v_revision public.display_revisions%rowtype;
  v_snapshot public.project_canonical_snapshots%rowtype;
  v_settings public.project_publishing_settings%rowtype;
  v_lease public.project_publisher_leases%rowtype;
  v_now timestamptz := now();
  v_stale boolean := false;
  v_source_offline boolean := false;
  v_project_json jsonb;
  v_canonical_payload jsonb;
begin
  if p_project_slug is null or btrim(p_project_slug) = ''
     or p_display_slug is null or btrim(p_display_slug) = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found'
    );
  end if;

  select *
  into v_project
  from public.projects
  where slug = lower(btrim(p_project_slug));

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select *
  into v_display
  from public.displays
  where project_id = v_project.id
    and slug = lower(btrim(p_display_slug))
    and deleted_at is null
    and online_viewer_enabled = true;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_display.online_visibility = 'private' then
    if v_user_id is null or not public.can_view_project(v_project.id) then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
  end if;

  if v_display.online_published_revision_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_published');
  end if;

  select *
  into v_revision
  from public.display_revisions
  where id = v_display.online_published_revision_id
    and display_id = v_display.id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_published');
  end if;

  select *
  into v_snapshot
  from public.project_canonical_snapshots
  where project_id = v_project.id;

  select *
  into v_settings
  from public.project_publishing_settings
  where project_id = v_project.id;

  select *
  into v_lease
  from public.project_publisher_leases
  where project_id = v_project.id;

  if not found
    or v_lease.released_at is not null
    or v_lease.lease_expires_at <= v_now then
    v_source_offline := true;
  end if;

  if v_settings.last_successful_publish_at is null
    or v_settings.last_successful_publish_at < v_now - interval '45 seconds' then
    v_stale := true;
  end if;

  v_canonical_payload := coalesce(v_snapshot.payload->'data', '{}'::jsonb);

  if v_user_id is null then
    v_project_json := jsonb_build_object('slug', v_project.slug);
  else
    v_project_json := jsonb_build_object(
      'slug', v_project.slug,
      'name', v_project.name
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'viewer_ready',
    'project', v_project_json,
    'display', jsonb_build_object(
      'slug', v_display.slug,
      'name', v_display.name,
      'description', v_display.description,
      'display_width', v_display.display_width,
      'display_height', v_display.display_height,
      'online_visibility', v_display.online_visibility,
      'online_published_at', v_display.online_published_at,
      'published_revision_id', v_display.online_published_revision_id,
      'refresh_rate_ms', v_display.refresh_rate_ms
    ),
    'html_content', v_revision.html_content,
    'canonical_payload', v_canonical_payload,
    'canonical_revision', coalesce(v_snapshot.revision, 0),
    'data_updated_at', v_snapshot.received_at,
    'source_offline', v_source_offline,
    'stale', v_stale or v_source_offline
  );
end;
$$;

revoke all on function public.get_online_display_viewer_bundle(text, text) from public;
revoke execute on function public.get_online_display_viewer_bundle(text, text) from service_role;
grant execute on function public.get_online_display_viewer_bundle(text, text) to anon;
grant execute on function public.get_online_display_viewer_bundle(text, text) to authenticated;

-- List online-enabled displays for portal (authenticated project members)
create or replace function public.list_online_project_displays(
  p_project_id uuid
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  display_width integer,
  display_height integer,
  online_visibility text,
  online_published_at timestamptz,
  enabled boolean,
  refresh_rate_ms integer
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
    d.online_visibility,
    d.online_published_at,
    d.enabled,
    d.refresh_rate_ms
  from public.displays d
  where d.project_id = p_project_id
    and d.deleted_at is null
    and d.online_viewer_enabled = true
    and public.can_view_project(p_project_id)
  order by d.name asc;
$$;

revoke all on function public.list_online_project_displays(uuid) from public;
revoke execute on function public.list_online_project_displays(uuid) from anon;
revoke execute on function public.list_online_project_displays(uuid) from service_role;
grant execute on function public.list_online_project_displays(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Online viewer activity event allowlist (extends 019)
-- -----------------------------------------------------------------------------

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
