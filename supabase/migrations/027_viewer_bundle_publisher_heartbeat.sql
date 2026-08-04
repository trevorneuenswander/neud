-- 027_viewer_bundle_publisher_heartbeat.sql
-- Use publisher lease heartbeat for viewer online/offline state instead of snapshot publish age.

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
  v_lease public.project_publisher_leases%rowtype;
  v_now timestamptz := now();
  v_publisher_stale_seconds integer := 45;
  v_publisher_online boolean := false;
  v_source_offline boolean := true;
  v_data_stale boolean := false;
  v_stale_reason text := null;
  v_source_connected boolean := false;
  v_source_mode text := null;
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
    and is_archived = false
    and enabled = true
    and online_viewer_enabled = true;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_display.online_visibility = 'private' then
    if v_user_id is null then
      return jsonb_build_object('ok', false, 'code', 'authentication_required');
    end if;
    if not public.can_view_project(v_project.id) then
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
  into v_lease
  from public.project_publisher_leases
  where project_id = v_project.id;

  if found
    and v_lease.released_at is null
    and v_lease.lease_expires_at > v_now then
    if v_lease.last_heartbeat_at is not null
       and v_now - v_lease.last_heartbeat_at <= (v_publisher_stale_seconds || ' seconds')::interval then
      v_publisher_online := true;
      v_source_offline := false;
    else
      v_stale_reason := 'heartbeat_stale';
    end if;
  else
    v_stale_reason := 'lease_expired';
  end if;

  select *
  into v_snapshot
  from public.project_canonical_snapshots
  where project_id = v_project.id
  order by revision desc
  limit 1;

  if found then
    v_source_connected := coalesce(v_snapshot.source_connected, false);
    v_source_mode := v_snapshot.source_mode;
    if v_publisher_online
       and v_snapshot.received_at is not null
       and v_now - v_snapshot.received_at > interval '5 minutes' then
      v_data_stale := true;
      if v_stale_reason is null then
        v_stale_reason := 'snapshot_age';
      end if;
    end if;
  end if;

  if v_user_id is null then
    v_project_json := jsonb_build_object('slug', v_project.slug);
  else
    v_project_json := jsonb_build_object(
      'id', v_project.id,
      'slug', v_project.slug,
      'name', v_project.name
    );
  end if;

  v_canonical_payload := coalesce(v_snapshot.payload -> 'data', '{}'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'code', 'viewer_ready',
    'project', v_project_json,
    'display', jsonb_build_object(
      'id', v_display.id,
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
    'published_at', v_display.online_published_at,
    'stale', v_data_stale,
    'source_offline', v_source_offline,
    'publisher_online', v_publisher_online,
    'source_connected', v_source_connected,
    'source_mode', v_source_mode,
    'data_stale', v_data_stale,
    'stale_reason', v_stale_reason
  );
end;
$$;

revoke all on function public.get_online_display_viewer_bundle(text, text) from public;
revoke execute on function public.get_online_display_viewer_bundle(text, text) from service_role;
grant execute on function public.get_online_display_viewer_bundle(text, text) to anon;
grant execute on function public.get_online_display_viewer_bundle(text, text) to authenticated;
