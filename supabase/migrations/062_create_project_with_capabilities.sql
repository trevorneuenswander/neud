-- =============================================================================
-- NEUD v0.3.0 Pass 21: create/set project capabilities RPCs
-- Separate from 061 so the modular enum value is committed first.
-- =============================================================================

create or replace function public.create_project_with_capabilities(
  p_name text,
  p_slug text,
  p_description text default null,
  p_capabilities text[] default array['display-only']::text[],
  p_team_ids uuid[] default array[]::uuid[],
  p_project_type public.project_type default 'modular',
  p_theme text default 'default',
  p_icon text default 'folder'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_capability text;
  v_team_id uuid;
  v_is_owner boolean;
  v_is_team_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;

  v_is_owner := public.is_platform_owner() or public.is_platform_admin();
  v_is_team_admin := public.user_is_any_team_admin();

  if not v_is_owner and not v_is_team_admin then
    raise exception 'forbidden';
  end if;

  if p_name is null or char_length(trim(p_name)) < 1 then
    raise exception 'Project name is required.';
  end if;

  if p_capabilities is null or coalesce(array_length(p_capabilities, 1), 0) < 1 then
    raise exception 'Select at least one capability.';
  end if;

  foreach v_capability in array p_capabilities loop
    if v_capability not in (
      'data-source',
      'webpage-scraper',
      'live-chat',
      'scoreboard',
      'timer',
      'lower-thirds',
      'display-only',
      'social-feed',
      'results-leaderboard',
      'rundown-schedule',
      'election-results',
      'weather',
      'statistics',
      'manual-controller',
      'automation-trigger'
    ) then
      raise exception 'Invalid capability: %', v_capability;
    end if;
  end loop;

  if p_team_ids is not null then
    foreach v_team_id in array p_team_ids loop
      if v_team_id is null then
        continue;
      end if;
      if not v_is_owner and not public.user_administrates_team(v_team_id) then
        raise exception 'You may only assign teams you administrate.';
      end if;
      if not exists (
        select 1 from public.teams t where t.id = v_team_id and t.deleted_at is null
      ) then
        raise exception 'Team not found.';
      end if;
    end loop;
  end if;

  insert into public.projects (
    owner_id,
    name,
    slug,
    description,
    project_type,
    status,
    theme,
    icon,
    is_active
  ) values (
    auth.uid(),
    trim(p_name),
    trim(p_slug),
    nullif(trim(coalesce(p_description, '')), ''),
    p_project_type,
    'active',
    coalesce(nullif(trim(p_theme), ''), 'default'),
    coalesce(nullif(trim(p_icon), ''), 'folder'),
    true
  )
  returning id into v_project_id;

  foreach v_capability in array p_capabilities loop
    insert into public.project_capabilities (project_id, capability, created_by)
    values (v_project_id, v_capability, auth.uid())
    on conflict do nothing;
  end loop;

  if p_team_ids is not null then
    foreach v_team_id in array p_team_ids loop
      if v_team_id is null then
        continue;
      end if;
      insert into public.project_team_assignments (project_id, team_id, assigned_by)
      values (v_project_id, v_team_id, auth.uid())
      on conflict do nothing;
    end loop;
  end if;

  -- Creator gets direct manager access.
  insert into public.project_members (project_id, user_id, access_level)
  values (v_project_id, auth.uid(), 'manager')
  on conflict (project_id, user_id) do update
    set access_level = 'manager';

  return v_project_id;
end;
$$;

revoke all on function public.create_project_with_capabilities(
  text, text, text, text[], uuid[], public.project_type, text, text
) from public;
grant execute on function public.create_project_with_capabilities(
  text, text, text, text[], uuid[], public.project_type, text, text
) to authenticated;

create or replace function public.set_project_capabilities(
  p_project_id uuid,
  p_capabilities text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capability text;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;

  if not (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.get_project_access_level(p_project_id) = 'manager'
  ) then
    raise exception 'forbidden';
  end if;

  if p_capabilities is null or coalesce(array_length(p_capabilities, 1), 0) < 1 then
    raise exception 'Select at least one capability.';
  end if;

  foreach v_capability in array p_capabilities loop
    if v_capability not in (
      'data-source',
      'webpage-scraper',
      'live-chat',
      'scoreboard',
      'timer',
      'lower-thirds',
      'display-only',
      'social-feed',
      'results-leaderboard',
      'rundown-schedule',
      'election-results',
      'weather',
      'statistics',
      'manual-controller',
      'automation-trigger'
    ) then
      raise exception 'Invalid capability: %', v_capability;
    end if;
  end loop;

  delete from public.project_capabilities where project_id = p_project_id;

  foreach v_capability in array p_capabilities loop
    insert into public.project_capabilities (project_id, capability, created_by)
    values (p_project_id, v_capability, auth.uid());
  end loop;
end;
$$;

revoke all on function public.set_project_capabilities(uuid, text[]) from public;
grant execute on function public.set_project_capabilities(uuid, text[]) to authenticated;
