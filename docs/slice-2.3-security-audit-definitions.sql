-- SECURITY DEFINER functions must pin search_path: can_create_cloud_project
CREATE OR REPLACE FUNCTION public.can_create_cloud_project(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_profile public.profiles%rowtype;
  v_owned_count integer;
  v_recent_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    return false;
  end if;

  -- Future subscription entitlements can tighten this function without replacing
  -- the registration RPC architecture.
  select count(*)
  into v_owned_count
  from public.projects
  where owner_id = v_user_id;

  if v_owned_count >= 25 then
    return false;
  end if;

  select count(*)
  into v_recent_count
  from public.cloud_project_registration_audit
  where user_id = v_user_id
    and result_code = 'project_registered'
    and created_at > now() - interval '5 minutes';

  if v_recent_count >= 3 then
    return false;
  end if;

  return true;
end;
$function$


-- SECURITY DEFINER functions must pin search_path: can_manage_project
CREATE OR REPLACE FUNCTION public.can_manage_project(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_platform_admin()
    or public.is_project_manager(p_project_id);
$function$


-- SECURITY DEFINER functions must pin search_path: can_manage_project_users
CREATE OR REPLACE FUNCTION public.can_manage_project_users(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.can_manage_project(p_project_id);
$function$


-- SECURITY DEFINER functions must pin search_path: can_operate_project
CREATE OR REPLACE FUNCTION public.can_operate_project(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case public.get_project_access_level(p_project_id)
    when 'admin' then true
    when 'manager' then true
    when 'operator' then true
    else false
  end;
$function$


-- SECURITY DEFINER functions must pin search_path: can_view_project
CREATE OR REPLACE FUNCTION public.can_view_project(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_project_member(p_project_id);
$function$


-- SECURITY DEFINER functions must pin search_path: get_accessible_project_users_directory
CREATE OR REPLACE FUNCTION public.get_accessible_project_users_directory()
 RETURNS TABLE(user_id uuid, full_name text, team text, role text, email text, project_id uuid, access_level text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


-- SECURITY DEFINER functions must pin search_path: get_authorized_users_directory
CREATE OR REPLACE FUNCTION public.get_authorized_users_directory()
 RETURNS TABLE(id uuid, full_name text, team text, role text, email text, created_at timestamp with time zone, assigned_project_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


-- SECURITY DEFINER functions must pin search_path: register_hosted_project_for_desktop
CREATE OR REPLACE FUNCTION public.register_hosted_project_for_desktop(p_project_id uuid, p_slug text, p_name text, p_project_type project_type DEFAULT 'bag-graphics'::project_type)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.projects%rowtype;
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
  v_reserved_slugs text[] := array[
    'admin', 'api', 'app', 'auth', 'dashboard', 'download', 'health', 'login',
    'neud', 'owner', 'pricing', 'projects', 'public', 'settings', 'signup', 'users'
  ];
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'authentication_required',
      'message', 'Sign in required.'
    );
  end if;

  if p_project_id is null or v_slug = '' or v_name = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'project_id, slug, and name are required.'
    );
  end if;

  if char_length(v_name) > 120 or char_length(v_slug) > 80 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'Project name or slug exceeds allowed length.'
    );
  end if;

  if v_slug ~ '[^a-z0-9-]' or v_slug ~ '^-|-$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'Project slug must use lowercase letters, numbers, and hyphens only.'
    );
  end if;

  if v_slug = any (v_reserved_slugs) then
    return jsonb_build_object(
      'ok', false,
      'code', 'slug_reserved',
      'message', 'This project slug is reserved.'
    );
  end if;

  select *
  into v_existing
  from public.projects
  where id = p_project_id;

  if found then
    if not public.is_project_member(p_project_id) then
      return jsonb_build_object(
        'ok', false,
        'code', 'forbidden',
        'message', 'You do not have access to this hosted project.'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'code', 'project_registered',
      'project_id', p_project_id,
      'registered_by_user_id', v_user_id
    );
  end if;

  if not public.can_create_cloud_project(v_user_id) then
    return jsonb_build_object(
      'ok', false,
      'code', 'registration_limit_reached',
      'message', 'Cloud project registration is temporarily unavailable for this account.'
    );
  end if;

  if exists (
    select 1
    from public.projects
    where slug = v_slug
      and id <> p_project_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'slug_conflict',
      'message', 'Another hosted project already uses this slug.'
    );
  end if;

  insert into public.projects (
    id,
    owner_id,
    name,
    slug,
    project_type,
    registered_by_user_id
  ) values (
    p_project_id,
    v_user_id,
    v_name,
    v_slug,
    coalesce(p_project_type, 'bag-graphics'::public.project_type),
    v_user_id
  );

  insert into public.project_members (
    project_id,
    user_id,
    access_level,
    assigned_by
  ) values (
    p_project_id,
    v_user_id,
    'manager',
    v_user_id
  );

  insert into public.cloud_project_registration_audit (
    user_id,
    project_id,
    slug,
    project_name,
    project_type,
    result_code
  ) values (
    v_user_id,
    p_project_id,
    v_slug,
    v_name,
    coalesce(p_project_type, 'bag-graphics'::public.project_type),
    'project_registered'
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'project_registered',
    'project_id', p_project_id,
    'registered_by_user_id', v_user_id
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'code', 'identity_conflict',
      'message', 'Hosted project identity conflict.'
    );
end;
$function$


-- SECURITY DEFINER functions must pin search_path: upsert_activity_events_for_sync
CREATE OR REPLACE FUNCTION public.upsert_activity_events_for_sync(p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


-- Confirm auth.uid() appears in final register function body
CREATE OR REPLACE FUNCTION public.register_hosted_project_for_desktop(p_project_id uuid, p_slug text, p_name text, p_project_type project_type DEFAULT 'bag-graphics'::project_type)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.projects%rowtype;
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
  v_reserved_slugs text[] := array[
    'admin', 'api', 'app', 'auth', 'dashboard', 'download', 'health', 'login',
    'neud', 'owner', 'pricing', 'projects', 'public', 'settings', 'signup', 'users'
  ];
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'authentication_required',
      'message', 'Sign in required.'
    );
  end if;

  if p_project_id is null or v_slug = '' or v_name = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'project_id, slug, and name are required.'
    );
  end if;

  if char_length(v_name) > 120 or char_length(v_slug) > 80 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'Project name or slug exceeds allowed length.'
    );
  end if;

  if v_slug ~ '[^a-z0-9-]' or v_slug ~ '^-|-$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'Project slug must use lowercase letters, numbers, and hyphens only.'
    );
  end if;

  if v_slug = any (v_reserved_slugs) then
    return jsonb_build_object(
      'ok', false,
      'code', 'slug_reserved',
      'message', 'This project slug is reserved.'
    );
  end if;

  select *
  into v_existing
  from public.projects
  where id = p_project_id;

  if found then
    if not public.is_project_member(p_project_id) then
      return jsonb_build_object(
        'ok', false,
        'code', 'forbidden',
        'message', 'You do not have access to this hosted project.'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'code', 'project_registered',
      'project_id', p_project_id,
      'registered_by_user_id', v_user_id
    );
  end if;

  if not public.can_create_cloud_project(v_user_id) then
    return jsonb_build_object(
      'ok', false,
      'code', 'registration_limit_reached',
      'message', 'Cloud project registration is temporarily unavailable for this account.'
    );
  end if;

  if exists (
    select 1
    from public.projects
    where slug = v_slug
      and id <> p_project_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'slug_conflict',
      'message', 'Another hosted project already uses this slug.'
    );
  end if;

  insert into public.projects (
    id,
    owner_id,
    name,
    slug,
    project_type,
    registered_by_user_id
  ) values (
    p_project_id,
    v_user_id,
    v_name,
    v_slug,
    coalesce(p_project_type, 'bag-graphics'::public.project_type),
    v_user_id
  );

  insert into public.project_members (
    project_id,
    user_id,
    access_level,
    assigned_by
  ) values (
    p_project_id,
    v_user_id,
    'manager',
    v_user_id
  );

  insert into public.cloud_project_registration_audit (
    user_id,
    project_id,
    slug,
    project_name,
    project_type,
    result_code
  ) values (
    v_user_id,
    p_project_id,
    v_slug,
    v_name,
    coalesce(p_project_type, 'bag-graphics'::public.project_type),
    'project_registered'
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'project_registered',
    'project_id', p_project_id,
    'registered_by_user_id', v_user_id
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'code', 'identity_conflict',
      'message', 'Hosted project identity conflict.'
    );
end;
$function$

