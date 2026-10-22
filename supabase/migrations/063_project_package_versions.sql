-- =============================================================================
-- NEUD v0.3.0 Pass 22: project package version catalog + storage
-- Additive only. Enables creator publish of modular v1 packages for Download.
-- =============================================================================

create table if not exists public.project_package_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version integer not null check (version >= 1),
  content_hash text not null,
  storage_prefix text not null,
  manifest jsonb not null default '{}'::jsonb,
  capabilities text[] not null default array[]::text[],
  project_slug text not null,
  project_name text not null,
  project_type text not null,
  description text,
  published_by uuid references auth.users (id),
  published_at timestamptz not null default now(),
  unique (project_id, version)
);

create index if not exists idx_project_package_versions_slug
  on public.project_package_versions (project_slug);

alter table public.project_package_versions enable row level security;

drop policy if exists project_package_versions_select on public.project_package_versions;
create policy project_package_versions_select
  on public.project_package_versions
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.is_project_member(project_id)
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-packages', 'project-packages', false, 52428800)
on conflict (id) do nothing;

drop policy if exists project_packages_storage_select on storage.objects;
create policy project_packages_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project-packages'
    and (
      public.is_platform_owner()
      or public.is_platform_admin()
      or exists (
        select 1
        from public.project_package_versions v
        where name like (v.project_id::text || '/v' || v.version::text || '/%')
          and public.is_project_member(v.project_id)
      )
    )
  );

drop policy if exists project_packages_storage_insert on storage.objects;
create policy project_packages_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project-packages'
    and (
      public.is_platform_owner()
      or public.is_platform_admin()
      or public.get_project_access_level(((storage.foldername(name))[1])::uuid) = 'manager'
    )
  );

drop policy if exists project_packages_storage_update on storage.objects;
create policy project_packages_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'project-packages'
    and (
      public.is_platform_owner()
      or public.is_platform_admin()
      or public.get_project_access_level(((storage.foldername(name))[1])::uuid) = 'manager'
    )
  );

create or replace function public.publish_project_package_version(
  p_project_id uuid,
  p_version integer,
  p_content_hash text,
  p_storage_prefix text,
  p_manifest jsonb,
  p_capabilities text[] default array[]::text[],
  p_project_slug text default null,
  p_project_name text default null,
  p_project_type text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project public.projects%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in required.');
  end if;

  if p_project_id is null or p_version is null or p_version < 1 then
    return jsonb_build_object('ok', false, 'message', 'Invalid package version input.');
  end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Project not found.');
  end if;

  if not (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.get_project_access_level(p_project_id) = 'manager'
  ) then
    return jsonb_build_object('ok', false, 'message', 'Forbidden.');
  end if;

  insert into public.project_package_versions (
    project_id,
    version,
    content_hash,
    storage_prefix,
    manifest,
    capabilities,
    project_slug,
    project_name,
    project_type,
    description,
    published_by
  ) values (
    p_project_id,
    p_version,
    p_content_hash,
    p_storage_prefix,
    coalesce(p_manifest, '{}'::jsonb),
    coalesce(p_capabilities, array[]::text[]),
    coalesce(nullif(trim(p_project_slug), ''), v_project.slug),
    coalesce(nullif(trim(p_project_name), ''), v_project.name),
    coalesce(nullif(trim(p_project_type), ''), v_project.project_type::text),
    nullif(trim(coalesce(p_description, '')), ''),
    v_user_id
  )
  on conflict (project_id, version) do update set
    content_hash = excluded.content_hash,
    storage_prefix = excluded.storage_prefix,
    manifest = excluded.manifest,
    capabilities = excluded.capabilities,
    project_slug = excluded.project_slug,
    project_name = excluded.project_name,
    project_type = excluded.project_type,
    description = excluded.description,
    published_by = excluded.published_by,
    published_at = now();

  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'version', p_version,
    'content_hash', p_content_hash
  );
end;
$$;

revoke all on function public.publish_project_package_version(
  uuid, integer, text, text, jsonb, text[], text, text, text, text
) from public;
grant execute on function public.publish_project_package_version(
  uuid, integer, text, text, jsonb, text[], text, text, text, text
) to authenticated;

-- Expose latest package version on access directory projects when present.
create or replace function public.list_accessible_project_package_versions()
returns table (
  project_id uuid,
  project_slug text,
  latest_version integer,
  content_hash text,
  capabilities text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.project_id,
    v.project_slug,
    v.version as latest_version,
    v.content_hash,
    v.capabilities
  from public.project_package_versions v
  inner join (
    select project_id, max(version) as max_version
    from public.project_package_versions
    group by project_id
  ) latest on latest.project_id = v.project_id and latest.max_version = v.version
  where
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.is_project_member(v.project_id);
$$;

revoke all on function public.list_accessible_project_package_versions() from public;
grant execute on function public.list_accessible_project_package_versions() to authenticated;
