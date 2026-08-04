-- 028_viewer_status_semantics.sql
-- Stop treating unchanged snapshot age as stale data; refresh source metadata on duplicate hash.

create or replace function public.publish_project_canonical_snapshot(
  p_project_id uuid,
  p_publisher_instance_id uuid,
  p_contract_version text,
  p_revision bigint,
  p_generated_at timestamptz,
  p_source_mode text,
  p_source_connected boolean,
  p_payload jsonb,
  p_payload_hash text,
  p_max_payload_bytes integer default 1048576
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_settings public.project_publishing_settings%rowtype;
  v_lease public.project_publisher_leases%rowtype;
  v_existing public.project_canonical_snapshots%rowtype;
  v_payload_bytes integer;
  v_max_bytes integer := greatest(coalesce(p_max_payload_bytes, 1048576), 1024);
  v_refreshed_payload jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'authentication_required',
      'message', 'Sign in required.'
    );
  end if;

  if p_project_id is null or p_publisher_instance_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'project_id and publisher_instance_id are required.'
    );
  end if;

  if not public.is_project_member(p_project_id) then
    return jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'You do not have access to this project.'
    );
  end if;

  if not public.can_publish_project(p_project_id) then
    return jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'Your project role cannot publish canonical snapshots.'
    );
  end if;

  if p_contract_version is null or btrim(p_contract_version) = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'contract_version is required.'
    );
  end if;

  if p_revision is null or p_revision < 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'revision must be a positive integer.'
    );
  end if;

  if p_payload is null or p_payload_hash is null or btrim(p_payload_hash) = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'payload and payload_hash are required.'
    );
  end if;

  if p_source_mode not in ('webpage-scraper', 'local-controller') then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'Invalid source_mode.'
    );
  end if;

  v_payload_bytes := octet_length(convert_to(p_payload::text, 'UTF8'));
  if v_payload_bytes > v_max_bytes then
    return jsonb_build_object(
      'ok', false,
      'code', 'payload_too_large',
      'message', 'Canonical payload exceeds the maximum allowed size.',
      'payload_bytes', v_payload_bytes,
      'max_payload_bytes', v_max_bytes
    );
  end if;

  select *
  into v_settings
  from public.project_publishing_settings
  where project_id = p_project_id;

  if not found or v_settings.online_publishing_enabled is distinct from true then
    return jsonb_build_object(
      'ok', false,
      'code', 'publishing_disabled',
      'message', 'Online publishing is disabled for this project.'
    );
  end if;

  select *
  into v_lease
  from public.project_publisher_leases
  where project_id = p_project_id;

  if not found
    or v_lease.released_at is not null
    or v_lease.publisher_instance_id <> p_publisher_instance_id
    or v_lease.lease_expires_at <= v_now then
    return jsonb_build_object(
      'ok', false,
      'code', 'lease_not_owned',
      'message', 'Publisher lease is not active for this instance.'
    );
  end if;

  select *
  into v_existing
  from public.project_canonical_snapshots
  where project_id = p_project_id;

  if found then
    if v_existing.payload_hash = p_payload_hash then
      if v_existing.source_mode is distinct from p_source_mode
         or v_existing.source_connected is distinct from coalesce(p_source_connected, false) then
        v_refreshed_payload := jsonb_set(
          jsonb_set(
            coalesce(v_existing.payload, p_payload),
            '{source,mode}',
            to_jsonb(p_source_mode),
            true
          ),
          '{source,connected}',
          to_jsonb(coalesce(p_source_connected, false)),
          true
        );

        update public.project_canonical_snapshots
        set
          source_mode = p_source_mode,
          source_connected = coalesce(p_source_connected, false),
          payload = v_refreshed_payload,
          received_at = v_now,
          updated_at = v_now
        where project_id = p_project_id;
      end if;

      return jsonb_build_object(
        'ok', true,
        'code', 'duplicate_unchanged',
        'revision', v_existing.revision,
        'payload_hash', v_existing.payload_hash
      );
    end if;

    if p_revision < v_existing.revision then
      return jsonb_build_object(
        'ok', false,
        'code', 'stale_revision',
        'message', 'Revision is older than the latest published snapshot.',
        'latest_revision', v_existing.revision
      );
    end if;
  end if;

  insert into public.project_canonical_snapshots (
    project_id,
    contract_version,
    revision,
    generated_at,
    received_at,
    publisher_instance_id,
    published_by_user_id,
    source_mode,
    source_connected,
    payload,
    payload_hash,
    updated_at
  ) values (
    p_project_id,
    p_contract_version,
    p_revision,
    coalesce(p_generated_at, v_now),
    v_now,
    p_publisher_instance_id,
    v_user_id,
    p_source_mode,
    coalesce(p_source_connected, false),
    p_payload,
    p_payload_hash,
    v_now
  )
  on conflict (project_id) do update
  set
    contract_version = excluded.contract_version,
    revision = excluded.revision,
    generated_at = excluded.generated_at,
    received_at = excluded.received_at,
    publisher_instance_id = excluded.publisher_instance_id,
    published_by_user_id = excluded.published_by_user_id,
    source_mode = excluded.source_mode,
    source_connected = excluded.source_connected,
    payload = excluded.payload,
    payload_hash = excluded.payload_hash,
    updated_at = excluded.updated_at
  where public.project_canonical_snapshots.payload_hash is distinct from excluded.payload_hash
     or public.project_canonical_snapshots.revision is distinct from excluded.revision;

  update public.project_publishing_settings
  set
    active_publisher_instance_id = p_publisher_instance_id,
    latest_published_revision = greatest(latest_published_revision, p_revision),
    last_successful_publish_at = v_now,
    last_publish_error = null,
    updated_at = v_now
  where project_id = p_project_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'published',
    'revision', p_revision,
    'payload_hash', p_payload_hash,
    'received_at', v_now
  );
end;
$$;

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
  v_canonical_payload jsonb;
  v_canonical_data_present boolean := false;
  v_project_json jsonb;
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
    v_canonical_payload := coalesce(v_snapshot.payload -> 'data', '{}'::jsonb);
    v_canonical_data_present := (
      v_canonical_payload ? 'current'
      or v_canonical_payload ? 'auctionDisplay'
      or v_canonical_payload ? 'broadArrowDisplay'
      or v_canonical_payload ? 'lots'
      or v_canonical_payload ? 'next'
      or v_canonical_payload ? 'lastSold'
      or v_canonical_payload ? 'prev'
    );

    if v_canonical_payload ? 'dataStale'
       and coalesce((v_canonical_payload ->> 'dataStale')::boolean, false) then
      v_data_stale := true;
      v_stale_reason := coalesce(v_stale_reason, 'explicit_payload_marker');
    end if;
  else
    v_canonical_payload := '{}'::jsonb;
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
    'canonical_data_present', v_canonical_data_present,
    'data_stale', v_data_stale,
    'stale_reason', v_stale_reason,
    'snapshot_received_at', v_snapshot.received_at,
    'publisher_last_heartbeat_at', v_lease.last_heartbeat_at
  );
end;
$$;

revoke all on function public.get_online_display_viewer_bundle(text, text) from public;
revoke execute on function public.get_online_display_viewer_bundle(text, text) from service_role;
grant execute on function public.get_online_display_viewer_bundle(text, text) to anon;
grant execute on function public.get_online_display_viewer_bundle(text, text) to authenticated;

revoke all on function public.publish_project_canonical_snapshot(uuid, uuid, text, bigint, timestamptz, text, boolean, jsonb, text, integer) from public;
revoke execute on function public.publish_project_canonical_snapshot(uuid, uuid, text, bigint, timestamptz, text, boolean, jsonb, text, integer) from service_role;
grant execute on function public.publish_project_canonical_snapshot(uuid, uuid, text, bigint, timestamptz, text, boolean, jsonb, text, integer) to authenticated;
