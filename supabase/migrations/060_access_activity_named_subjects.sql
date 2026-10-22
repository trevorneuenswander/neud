-- =============================================================================
-- 060_access_activity_named_subjects.sql
-- NEUD v0.3.0 correction pass 7: write-time Activity sentences name the subject
-- =============================================================================
-- Patterns:
--   Assigned {User|Team Name} to project
--   Removed {User|Team Name} from project
-- Metadata always carries stable ids + labels for read-time enrichment.

create or replace function public.upsert_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_role text;
  v_subject_name text;
  v_subject_email text;
  v_subject_label text;
  v_description text;
  v_event_type text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;

  if not public.can_manage_project_access(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_access');
  end if;

  if p_role not in ('manager', 'operator', 'viewer') then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  select pm.access_level into v_existing_role
  from public.project_members pm
  where pm.project_id = p_project_id and pm.user_id = p_user_id;

  select
    nullif(btrim(p.full_name), ''),
    nullif(btrim(au.email), '')
  into v_subject_name, v_subject_email
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id = p_user_id;

  v_subject_label := coalesce(v_subject_name, v_subject_email, p_user_id::text, 'unknown user');

  insert into public.project_members (project_id, user_id, access_level)
  values (p_project_id, p_user_id, p_role)
  on conflict (project_id, user_id) do update set access_level = excluded.access_level;

  if v_existing_role is null then
    v_event_type := 'project.member_added';
    v_description := format('Assigned %s to project', v_subject_label);
  else
    v_event_type := 'project.role_changed';
    v_description := format('Project access for %s changed to %s.', v_subject_label, initcap(p_role));
  end if;

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
    v_event_type,
    v_description,
    jsonb_build_object(
      'subjectUserId', p_user_id,
      'subjectFullName', v_subject_name,
      'subjectEmail', v_subject_email,
      'subjectLabel', v_subject_label,
      'accessLevel', p_role,
      'actorUserId', auth.uid()
    ),
    'access-management',
    'info',
    gen_random_uuid(),
    now()
  );

  return jsonb_build_object('ok', true, 'code', 'upserted');
end;
$$;

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
  v_description := format('Removed %s from project', v_subject_label);

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
  v_description := format('Removed %s from project', v_team_name);

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
  v_description := format('Assigned %s to project', v_team_name);

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
