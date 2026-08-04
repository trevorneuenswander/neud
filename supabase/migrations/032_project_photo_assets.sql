-- 032_project_photo_assets.sql
-- Cloud photo asset registry for manual/local-only photos (authenticated upload, hosted resolve).

create table if not exists public.project_photo_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_bucket text not null default 'project-display-assets',
  storage_path text not null,
  content_hash text not null,
  lot_key text,
  original_filename text,
  mime_type text not null default 'image/jpeg',
  byte_size integer,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, content_hash)
);

create index if not exists idx_project_photo_assets_project
  on public.project_photo_assets (project_id)
  where deleted_at is null;

alter table public.project_photo_assets enable row level security;

insert into storage.buckets (id, name, public)
values ('project-display-assets', 'project-display-assets', false)
on conflict (id) do nothing;

create or replace function public.register_project_photo_asset(
  p_project_id uuid,
  p_storage_path text,
  p_content_hash text,
  p_lot_key text default null,
  p_original_filename text default null,
  p_mime_type text default 'image/jpeg',
  p_byte_size integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset_id uuid;
  v_path text := btrim(p_storage_path);
  v_hash text := btrim(p_content_hash);
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if not public.can_operate_project(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_path = '' or v_hash = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Storage path and content hash are required.');
  end if;

  if v_path !~ ('^' || p_project_id::text || '/') then
    return jsonb_build_object('ok', false, 'code', 'invalid_request', 'message', 'Storage path must be scoped to the project.');
  end if;

  insert into public.project_photo_assets (
    project_id,
    storage_path,
    content_hash,
    lot_key,
    original_filename,
    mime_type,
    byte_size,
    uploaded_by
  ) values (
    p_project_id,
    v_path,
    v_hash,
    nullif(btrim(p_lot_key), ''),
    nullif(btrim(p_original_filename), ''),
    coalesce(nullif(btrim(p_mime_type), ''), 'image/jpeg'),
    p_byte_size,
    v_user_id
  )
  on conflict (project_id, content_hash) do update
  set storage_path = excluded.storage_path,
      lot_key = coalesce(excluded.lot_key, public.project_photo_assets.lot_key),
      original_filename = coalesce(excluded.original_filename, public.project_photo_assets.original_filename),
      mime_type = excluded.mime_type,
      byte_size = coalesce(excluded.byte_size, public.project_photo_assets.byte_size),
      updated_at = now(),
      deleted_at = null
  returning id into v_asset_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'registered',
    'asset_id', v_asset_id,
    'storage_object_id', v_asset_id
  );
end;
$$;

create or replace function public.resolve_project_photo_asset_urls(
  p_asset_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row record;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if p_asset_ids is null or array_length(p_asset_ids, 1) is null then
    return jsonb_build_object('ok', true, 'code', 'resolved', 'items', '[]'::jsonb);
  end if;

  for v_row in
    select a.id, a.project_id, a.storage_bucket, a.storage_path
    from public.project_photo_assets a
    where a.id = any(p_asset_ids)
      and a.deleted_at is null
      and public.can_view_project(a.project_id)
  loop
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'asset_id', v_row.id,
        'storage_object_id', v_row.id,
        'storage_bucket', v_row.storage_bucket,
        'storage_path', v_row.storage_path
      )
    );
  end loop;

  return jsonb_build_object('ok', true, 'code', 'resolved', 'items', v_items);
end;
$$;

revoke all on function public.register_project_photo_asset(uuid, text, text, text, text, text, integer) from public;
revoke execute on function public.register_project_photo_asset(uuid, text, text, text, text, text, integer) from anon;
revoke execute on function public.register_project_photo_asset(uuid, text, text, text, text, text, integer) from service_role;
grant execute on function public.register_project_photo_asset(uuid, text, text, text, text, text, integer) to authenticated;

revoke all on function public.resolve_project_photo_asset_urls(uuid[]) from public;
revoke execute on function public.resolve_project_photo_asset_urls(uuid[]) from anon;
revoke execute on function public.resolve_project_photo_asset_urls(uuid[]) from service_role;
grant execute on function public.resolve_project_photo_asset_urls(uuid[]) to authenticated;
