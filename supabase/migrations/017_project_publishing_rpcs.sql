-- =============================================================================
-- NEUD Alpha v0.1.1 Slice 2: project publishing RPCs
-- =============================================================================
--
-- Atomic lease acquisition and canonical snapshot publication.
-- Callable by service_role only (desktop main process).
--
-- Authorization note (desktop-first overhaul):
--   Hosted public.projects membership is not required. The desktop publisher
--   verifies local AccessAuthorizationService permissions before calling these
--   RPCs. RPCs enforce lease ownership, publishing enabled state, revision,
--   payload hash, and payload size — not hosted project membership.
--
-- Dependency: 016_project_publishing_foundation.sql
-- =============================================================================

create or replace function public.acquire_project_publisher_lease(
  p_project_id uuid,
  p_publisher_instance_id uuid,
  p_lease_duration_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_duration integer := greatest(coalesce(p_lease_duration_seconds, 90), 30);
  v_expires timestamptz := v_now + make_interval(secs => v_duration);
  v_settings public.project_publishing_settings%rowtype;
  v_lease public.project_publisher_leases%rowtype;
begin
  if p_project_id is null or p_publisher_instance_id is null then
    raise exception 'project_id and publisher_instance_id are required.';
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
  where project_id = p_project_id
  for update;

  if found then
    if v_lease.released_at is null
      and v_lease.lease_expires_at > v_now
      and v_lease.publisher_instance_id <> p_publisher_instance_id then
      return jsonb_build_object(
        'ok', false,
        'code', 'lease_conflict',
        'message', 'Another publisher instance holds the active lease.',
        'owner_instance_id', v_lease.publisher_instance_id,
        'lease_expires_at', v_lease.lease_expires_at
      );
    end if;

    update public.project_publisher_leases
    set
      publisher_instance_id = p_publisher_instance_id,
      acquired_at = case
        when v_lease.publisher_instance_id = p_publisher_instance_id
          and v_lease.released_at is null
          and v_lease.lease_expires_at > v_now
        then v_lease.acquired_at
        else v_now
      end,
      last_heartbeat_at = v_now,
      lease_expires_at = v_expires,
      released_at = null,
      updated_at = v_now
    where project_id = p_project_id;

    return jsonb_build_object(
      'ok', true,
      'code', 'lease_acquired',
      'project_id', p_project_id,
      'publisher_instance_id', p_publisher_instance_id,
      'lease_expires_at', v_expires
    );
  end if;

  insert into public.project_publisher_leases (
    project_id,
    publisher_instance_id,
    acquired_at,
    last_heartbeat_at,
    lease_expires_at
  ) values (
    p_project_id,
    p_publisher_instance_id,
    v_now,
    v_now,
    v_expires
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'lease_acquired',
    'project_id', p_project_id,
    'publisher_instance_id', p_publisher_instance_id,
    'lease_expires_at', v_expires
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'code', 'lease_conflict',
      'message', 'Lease acquisition conflict. Retry.'
    );
end;
$$;

create or replace function public.renew_project_publisher_lease(
  p_project_id uuid,
  p_publisher_instance_id uuid,
  p_lease_duration_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_duration integer := greatest(coalesce(p_lease_duration_seconds, 90), 30);
  v_expires timestamptz := v_now + make_interval(secs => v_duration);
  v_lease public.project_publisher_leases%rowtype;
begin
  select *
  into v_lease
  from public.project_publisher_leases
  where project_id = p_project_id
  for update;

  if not found
    or v_lease.released_at is not null
    or v_lease.publisher_instance_id <> p_publisher_instance_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'lease_not_owned',
      'message', 'This instance does not hold the active publisher lease.'
    );
  end if;

  update public.project_publisher_leases
  set
    last_heartbeat_at = v_now,
    lease_expires_at = v_expires,
    updated_at = v_now
  where project_id = p_project_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'lease_renewed',
    'lease_expires_at', v_expires
  );
end;
$$;

create or replace function public.release_project_publisher_lease(
  p_project_id uuid,
  p_publisher_instance_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_lease public.project_publisher_leases%rowtype;
begin
  select *
  into v_lease
  from public.project_publisher_leases
  where project_id = p_project_id
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'lease_not_present');
  end if;

  if v_lease.publisher_instance_id <> p_publisher_instance_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'lease_not_owned',
      'message', 'This instance does not hold the active publisher lease.'
    );
  end if;

  update public.project_publisher_leases
  set
    released_at = v_now,
    lease_expires_at = v_now,
    updated_at = v_now
  where project_id = p_project_id;

  update public.project_publishing_settings
  set
    active_publisher_instance_id = null,
    updated_at = v_now
  where project_id = p_project_id
    and active_publisher_instance_id = p_publisher_instance_id;

  return jsonb_build_object('ok', true, 'code', 'lease_released');
end;
$$;

create or replace function public.set_project_online_publishing_enabled(
  p_project_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if p_project_id is null then
    raise exception 'project_id is required.';
  end if;

  insert into public.project_publishing_settings (
    project_id,
    online_publishing_enabled,
    created_at,
    updated_at
  ) values (
    p_project_id,
    coalesce(p_enabled, false),
    v_now,
    v_now
  )
  on conflict (project_id) do update
  set
    online_publishing_enabled = coalesce(p_enabled, false),
    updated_at = v_now;

  if coalesce(p_enabled, false) is false then
    update public.project_publisher_leases
    set
      released_at = v_now,
      lease_expires_at = v_now,
      updated_at = v_now
    where project_id = p_project_id
      and released_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'online_publishing_enabled', coalesce(p_enabled, false)
  );
end;
$$;

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
  v_now timestamptz := now();
  v_settings public.project_publishing_settings%rowtype;
  v_lease public.project_publisher_leases%rowtype;
  v_existing public.project_canonical_snapshots%rowtype;
  v_payload_bytes integer;
  v_max_bytes integer := greatest(coalesce(p_max_payload_bytes, 1048576), 1024);
begin
  if p_project_id is null or p_publisher_instance_id is null then
    raise exception 'project_id and publisher_instance_id are required.';
  end if;

  if p_contract_version is null or btrim(p_contract_version) = '' then
    raise exception 'contract_version is required.';
  end if;

  if p_revision is null or p_revision < 1 then
    raise exception 'revision must be a positive integer.';
  end if;

  if p_payload is null or p_payload_hash is null or btrim(p_payload_hash) = '' then
    raise exception 'payload and payload_hash are required.';
  end if;

  if p_source_mode not in ('webpage-scraper', 'local-controller') then
    raise exception 'Invalid source_mode.';
  end if;

  v_payload_bytes := octet_length(p_payload::text);
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

revoke all on function public.acquire_project_publisher_lease(uuid, uuid, integer) from public;
revoke all on function public.renew_project_publisher_lease(uuid, uuid, integer) from public;
revoke all on function public.release_project_publisher_lease(uuid, uuid) from public;
revoke all on function public.set_project_online_publishing_enabled(uuid, boolean) from public;
revoke all on function public.publish_project_canonical_snapshot(uuid, uuid, text, bigint, timestamptz, text, boolean, jsonb, text, integer) from public;

grant execute on function public.acquire_project_publisher_lease(uuid, uuid, integer) to service_role;
grant execute on function public.renew_project_publisher_lease(uuid, uuid, integer) to service_role;
grant execute on function public.release_project_publisher_lease(uuid, uuid) to service_role;
grant execute on function public.set_project_online_publishing_enabled(uuid, boolean) to service_role;
grant execute on function public.publish_project_canonical_snapshot(uuid, uuid, text, bigint, timestamptz, text, boolean, jsonb, text, integer) to service_role;
