-- 030_harden_project_active_displays.sql
-- Hardens authenticated active-display RPCs after initial 029 rollout.

drop function if exists public.list_project_active_displays(uuid);

create function public.list_project_active_displays(p_project_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  display_width integer,
  display_height integer,
  enabled boolean,
  online_viewer_enabled boolean,
  online_visibility text,
  online_published_at timestamptz,
  online_published_revision_id uuid,
  online_publish_error text,
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
    d.enabled,
    d.online_viewer_enabled,
    d.online_visibility,
    d.online_published_at,
    d.online_published_revision_id,
    d.online_publish_error,
    d.refresh_rate_ms
  from public.displays d
  where d.project_id = p_project_id
    and d.deleted_at is null
    and d.is_archived = false
    and public.can_view_project(p_project_id);
$$;

revoke all on function public.list_project_active_displays(uuid) from public;
revoke execute on function public.list_project_active_displays(uuid) from anon;
revoke execute on function public.list_project_active_displays(uuid) from service_role;
grant execute on function public.list_project_active_displays(uuid) to authenticated;

create or replace function public.count_active_displays_for_projects(p_project_ids uuid[])
returns table (
  project_id uuid,
  active_display_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.project_id,
    count(*)::bigint as active_display_count
  from public.displays d
  where d.project_id = any(p_project_ids)
    and d.deleted_at is null
    and d.is_archived = false
    and public.can_view_project(d.project_id)
  group by d.project_id;
$$;

revoke all on function public.count_active_displays_for_projects(uuid[]) from public;
revoke execute on function public.count_active_displays_for_projects(uuid[]) from anon;
revoke execute on function public.count_active_displays_for_projects(uuid[]) from service_role;
grant execute on function public.count_active_displays_for_projects(uuid[]) to authenticated;
