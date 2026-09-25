-- 055_user_pinned_viewer_stacks.sql
-- Stack membership for pinned viewer; allow more than four underlying pins.

alter table public.user_pinned_viewer_preferences
  add column if not exists pinned_stacks jsonb not null default '[]'::jsonb;

alter table public.user_pinned_viewer_preferences
  drop constraint if exists user_pinned_viewer_preferences_pin_count;
