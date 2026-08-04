-- 038_access_management_rls.sql
-- Row level security policies for access-management tables.

create policy project_photo_assets_select
  on public.project_photo_assets
  for select
  to authenticated
  using (public.can_view_project(project_id));

create policy project_photo_assets_insert
  on public.project_photo_assets
  for insert
  to authenticated
  with check (public.can_operate_project(project_id));

create policy project_photo_assets_update
  on public.project_photo_assets
  for update
  to authenticated
  using (public.can_operate_project(project_id))
  with check (public.can_operate_project(project_id));

create policy teams_select
  on public.teams
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.is_team_admin(id)
    or exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = teams.id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  );

create policy teams_insert
  on public.teams
  for insert
  to authenticated
  with check (public.is_platform_owner());

create policy teams_update
  on public.teams
  for update
  to authenticated
  using (public.is_platform_owner() or public.is_team_admin(id))
  with check (public.is_platform_owner() or public.is_team_admin(id));

create policy team_memberships_select
  on public.team_memberships
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.is_platform_admin()
    or public.is_team_admin(team_id)
    or user_id = auth.uid()
  );

create policy team_memberships_write
  on public.team_memberships
  for all
  to authenticated
  using (public.is_platform_owner() or public.is_team_admin(team_id))
  with check (public.is_platform_owner() or public.is_team_admin(team_id));

create policy project_team_assignments_select
  on public.project_team_assignments
  for select
  to authenticated
  using (public.can_view_project(project_id));

create policy project_team_assignments_write
  on public.project_team_assignments
  for all
  to authenticated
  using (public.can_operate_project(project_id))
  with check (public.can_operate_project(project_id));

create policy cloud_invitations_select
  on public.cloud_invitations
  for select
  to authenticated
  using (public.is_platform_owner() or public.is_platform_admin());

create policy cloud_invitations_write
  on public.cloud_invitations
  for all
  to authenticated
  using (public.is_platform_owner() or public.is_platform_admin())
  with check (public.is_platform_owner() or public.is_platform_admin());
