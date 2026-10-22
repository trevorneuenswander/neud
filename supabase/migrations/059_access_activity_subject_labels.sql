-- =============================================================================
-- 059_access_activity_subject_labels.sql
-- NEUD v0.3.0 correction pass 4: activity subjects for access removals
-- =============================================================================
-- Project access removed must name the affected user.
-- Team removed from project must name the team.
-- Store subject fields in metadata so later renders do not depend on fragile lookups.

create or replace function public.remove_project_member(
  p_project_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_name text;
  v_subject_email text;
  v_subject_label text;
  v_description text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if public.is_sole_owner_user(p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'owner_protected');
  end if;

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  select
    nullif(btrim(p.full_name), ''),
    nullif(btrim(au.email), '')
  into v_subject_name, v_subject_email
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id = p_user_id;

  v_subject_label := coalesce(v_subject_name, v_subject_email, p_user_id::text, 'unknown user');
  v_description := format('Project access removed for %s.', v_subject_label);

  delete from public.project_members
  where project_id = p_project_id and user_id = p_user_id;

  insert into public.activity_events (
    id,
    project_id,
    user_id,
    event_type,
    description,
    metadata,
    source,
    severity,
    source_instance_id,
    occurred_at
  ) values (
    gen_random_uuid(),
    p_project_id,
    auth.uid(),
    'project.member_removed',
    v_description,
    jsonb_build_object(
      'subjectUserId', p_user_id,
      'subjectFullName', v_subject_name,
      'subjectEmail', v_subject_email,
      'subjectLabel', v_subject_label,
      'actorUserId', auth.uid()
    ),
    'access-management',
    'info',
    gen_random_uuid(),
    now()
  );

  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;

create or replace function public.remove_project_team(
  p_project_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_name text;
  v_project_name text;
  v_description text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  select nullif(btrim(t.name), '')
  into v_team_name
  from public.teams t
  where t.id = p_team_id;

  select nullif(btrim(pr.name), '')
  into v_project_name
  from public.projects pr
  where pr.id = p_project_id;

  v_team_name := coalesce(v_team_name, 'Team');
  v_description := format('%s removed from project.', v_team_name);

  delete from public.project_team_assignments
  where project_id = p_project_id and team_id = p_team_id;

  insert into public.activity_events (
    id,
    project_id,
    user_id,
    event_type,
    description,
    metadata,
    source,
    severity,
    source_instance_id,
    occurred_at
  ) values (
    gen_random_uuid(),
    p_project_id,
    auth.uid(),
    'project.team_removed',
    v_description,
    jsonb_build_object(
      'teamId', p_team_id,
      'teamName', v_team_name,
      'projectId', p_project_id,
      'projectName', v_project_name,
      'actorUserId', auth.uid()
    ),
    'access-management',
    'info',
    gen_random_uuid(),
    now()
  );

  return jsonb_build_object('ok', true, 'code', 'removed');
end;
$$;

create or replace function public.assign_project_team(
  p_project_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_name text;
  v_project_name text;
  v_description text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  if not exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.deleted_at is null and t.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'code', 'outside_team_scope');
  end if;

  select nullif(btrim(t.name), '')
  into v_team_name
  from public.teams t
  where t.id = p_team_id;

  select nullif(btrim(pr.name), '')
  into v_project_name
  from public.projects pr
  where pr.id = p_project_id;

  v_team_name := coalesce(v_team_name, 'Team');
  v_description := format('%s assigned to project.', v_team_name);

  insert into public.project_team_assignments (project_id, team_id, assigned_by)
  values (p_project_id, p_team_id, v_user_id)
  on conflict (project_id, team_id) do nothing;

  insert into public.activity_events (
    id,
    project_id,
    user_id,
    event_type,
    description,
    metadata,
    source,
    severity,
    source_instance_id,
    occurred_at
  ) values (
    gen_random_uuid(),
    p_project_id,
    v_user_id,
    'project.team_assigned',
    v_description,
    jsonb_build_object(
      'teamId', p_team_id,
      'teamName', v_team_name,
      'projectId', p_project_id,
      'projectName', v_project_name,
      'actorUserId', v_user_id
    ),
    'access-management',
    'info',
    gen_random_uuid(),
    now()
  );

  return jsonb_build_object('ok', true, 'code', 'assigned');
end;
$$;
