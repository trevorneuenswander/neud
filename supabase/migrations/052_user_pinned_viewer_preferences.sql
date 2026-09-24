-- Per-user pinned display viewer preferences (not shared project configuration)

create table if not exists public.user_pinned_viewer_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  pinned_display_ids uuid[] not null default '{}',
  viewer_height_px integer not null default 220,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id),
  constraint user_pinned_viewer_preferences_height_range
    check (viewer_height_px >= 120 and viewer_height_px <= 2000),
  constraint user_pinned_viewer_preferences_pin_count
    check (coalesce(array_length(pinned_display_ids, 1), 0) <= 4)
);

create index if not exists idx_user_pinned_viewer_preferences_project
  on public.user_pinned_viewer_preferences (project_id, user_id);

alter table public.user_pinned_viewer_preferences enable row level security;

create policy user_pinned_viewer_preferences_select_own
  on public.user_pinned_viewer_preferences
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and public.can_view_project(project_id)
  );

create policy user_pinned_viewer_preferences_insert_own
  on public.user_pinned_viewer_preferences
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.can_view_project(project_id)
  );

create policy user_pinned_viewer_preferences_update_own
  on public.user_pinned_viewer_preferences
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and public.can_view_project(project_id)
  )
  with check (
    auth.uid() = user_id
    and public.can_view_project(project_id)
  );

create policy user_pinned_viewer_preferences_delete_own
  on public.user_pinned_viewer_preferences
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    and public.can_view_project(project_id)
  );

grant select, insert, update, delete on public.user_pinned_viewer_preferences to authenticated;
