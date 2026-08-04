-- =============================================================================
-- NEUD Alpha v0.1.1 Slice 2.3 live validation: hardened project registration
-- =============================================================================
--
-- Adds abuse controls and a future-compatible entitlement hook for cloud project
-- creation. Supersedes the registration body introduced in 020.
--
-- Dependency: 020
-- =============================================================================

create table if not exists public.cloud_project_registration_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  slug text not null,
  project_name text not null,
  project_type public.project_type not null,
  result_code text not null,
  created_at timestamptz not null default now()
);

create index if not exists cloud_project_registration_audit_user_created_idx
  on public.cloud_project_registration_audit (user_id, created_at desc);

alter table public.cloud_project_registration_audit enable row level security;

revoke all on table public.cloud_project_registration_audit from public;
grant select on table public.cloud_project_registration_audit to authenticated;

create policy cloud_project_registration_audit_select
  on public.cloud_project_registration_audit
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create or replace function public.can_create_cloud_project(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
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
$$;

revoke all on function public.can_create_cloud_project(uuid) from public;
grant execute on function public.can_create_cloud_project(uuid) to authenticated;

create or replace function public.register_hosted_project_for_desktop(
  p_project_id uuid,
  p_slug text,
  p_name text,
  p_project_type public.project_type default 'bag-graphics'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.register_hosted_project_for_desktop(uuid, text, text, public.project_type) from public;
grant execute on function public.register_hosted_project_for_desktop(uuid, text, text, public.project_type) to authenticated;
