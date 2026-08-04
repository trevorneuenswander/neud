-- 039_project_photo_delivery.sql
-- Authorize hosted photo asset resolution for private and public viewers.

create or replace function public.asset_referenced_in_canonical(
  p_project_id uuid,
  p_asset_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  select pp.canonical_payload
  into v_payload
  from public.project_publishing pp
  where pp.project_id = p_project_id
    and pp.canonical_payload is not null
  order by pp.updated_at desc
  limit 1;

  if v_payload is null then
    return false;
  end if;

  return v_payload::text like ('%' || p_asset_id::text || '%');
end;
$$;

create or replace function public.authorize_hosted_photo_asset(
  p_asset_id uuid,
  p_project_slug text,
  p_display_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_display record;
  v_asset record;
  v_public_allowed boolean := false;
begin
  if p_asset_id is null or btrim(p_project_slug) = '' or btrim(p_display_slug) = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select p.id into v_project_id
  from public.projects p
  where p.slug = btrim(p_project_slug)
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_project_id is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select d.id, d.online_viewer_enabled, d.online_visibility, d.deleted_at
  into v_display
  from public.displays d
  where d.project_id = v_project_id
    and d.slug = btrim(p_display_slug)
  limit 1;

  if v_display.id is null or v_display.deleted_at is not null or not v_display.online_viewer_enabled then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select a.id, a.project_id, a.storage_bucket, a.storage_path
  into v_asset
  from public.project_photo_assets a
  where a.id = p_asset_id
    and a.deleted_at is null
    and a.project_id = v_project_id;

  if v_asset.id is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.asset_referenced_in_canonical(v_project_id, p_asset_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_display.online_visibility = 'public' then
    v_public_allowed := true;
  elsif v_user_id is not null and public.can_view_project(v_project_id) then
    v_public_allowed := true;
  end if;

  if not v_public_allowed then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'authorized',
    'asset_id', v_asset.id,
    'project_id', v_asset.project_id,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path
  );
end;
$$;

revoke all on function public.asset_referenced_in_canonical(uuid, uuid) from public;
revoke execute on function public.asset_referenced_in_canonical(uuid, uuid) from anon;
revoke execute on function public.asset_referenced_in_canonical(uuid, uuid) from service_role;
grant execute on function public.asset_referenced_in_canonical(uuid, uuid) to authenticated;

revoke all on function public.authorize_hosted_photo_asset(uuid, text, text) from public;
revoke execute on function public.authorize_hosted_photo_asset(uuid, text, text) from service_role;
grant execute on function public.authorize_hosted_photo_asset(uuid, text, text) to anon;
grant execute on function public.authorize_hosted_photo_asset(uuid, text, text) to authenticated;
