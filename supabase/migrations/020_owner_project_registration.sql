-- =============================================================================
-- NEUD Alpha v0.1.1 Slice 2.3: owner/manager hosted project registration
-- =============================================================================
--
-- Allows authenticated users to register a new hosted project for a local UUID
-- they control, without requiring platform-admin intervention for every project.
--
-- Existing projects still require membership. Slug conflicts and UUID squatting on
-- existing rows remain blocked.
--
-- Dependency: 018
-- =============================================================================

alter table public.projects
  add column if not exists registered_by_user_id uuid references auth.users (id);

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
      'project_id', p_project_id
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
