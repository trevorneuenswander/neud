-- 025_display_online_viewer_eligibility.sql
-- Require local display enabled + pinned revision for hosted portal eligibility.

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
    and is_archived = false
    and enabled = true
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
  into v_settings
  from public.project_publishing_settings
  where project_id = v_project.id;

  select *
  into v_lease
  from public.project_publisher_leases
  where project_id = v_project.id;

  if v_settings.last_successful_publish_at is not null then
    v_stale := v_now - v_settings.last_successful_publish_at > interval '45 seconds';
  end if;

  if v_lease.expires_at is null or v_lease.expires_at <= v_now then
    v_source_offline := true;
  end if;

  select *
  into v_snapshot
  from public.project_canonical_snapshots
  where project_id = v_project.id
  order by revision desc
  limit 1;

  v_project_json := jsonb_build_object(
    'id', v_project.id,
    'slug', v_project.slug,
    'name', v_project.name
  );

  v_canonical_payload := coalesce(v_snapshot.payload -> 'data', '{}'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'code', 'viewer_ready',
    'project', v_project_json,
    'display', jsonb_build_object(
      'id', v_display.id,
      'slug', v_display.slug,
      'name', v_display.name,
      'online_visibility', v_display.online_visibility,
      'refresh_rate_ms', v_display.refresh_rate_ms,
      'display_width', v_display.display_width,
      'display_height', v_display.display_height
    ),
    'html_content', v_revision.html_content,
    'canonical_payload', v_canonical_payload,
    'published_at', v_display.online_published_at,
    'stale', v_stale,
    'source_offline', v_source_offline
  );
end;
$$;

revoke all on function public.get_online_display_viewer_bundle(text, text) from public;
revoke execute on function public.get_online_display_viewer_bundle(text, text) from service_role;
grant execute on function public.get_online_display_viewer_bundle(text, text) to anon;
grant execute on function public.get_online_display_viewer_bundle(text, text) to authenticated;

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
    and d.is_archived = false
    and d.enabled = true
    and d.online_viewer_enabled = true
    and d.online_published_revision_id is not null
    and exists (
      select 1
      from public.display_revisions dr
      where dr.id = d.online_published_revision_id
        and dr.display_id = d.id
    )
    and public.can_view_project(p_project_id)
  order by d.name asc;
$$;

revoke all on function public.list_online_project_displays(uuid) from public;
revoke execute on function public.list_online_project_displays(uuid) from anon;
revoke execute on function public.list_online_project_displays(uuid) from service_role;
grant execute on function public.list_online_project_displays(uuid) to authenticated;
