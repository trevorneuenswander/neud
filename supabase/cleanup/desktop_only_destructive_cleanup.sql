-- WARNING: DESTRUCTIVE MANUAL CLEANUP ONLY
-- DO NOT RUN AUTOMATICALLY
-- DO NOT RUN UNTIL:
--   1. Desktop migration export is complete
--   2. Backups are verified
--   3. Authentication-only cloud schema (007) is deployed
--   4. Desktop app is validated against local SQLite data
--
-- This script removes hosted portal/runtime tables from Supabase.
-- Retained resources: auth.users, profiles, access_requests, account_entitlements,
-- authorized_devices, auth_audit_log (after migration 007).

begin;

-- Drop realtime publication members first
alter publication supabase_realtime drop table if exists public.data_engine_status;
alter publication supabase_realtime drop table if exists public.data_engine_snapshots;
alter publication supabase_realtime drop table if exists public.data_engine_logs;
alter publication supabase_realtime drop table if exists public.data_engine_commands;

-- Runtime/project tables (destructive)
drop table if exists public.data_engine_logs cascade;
drop table if exists public.data_engine_snapshots cascade;
drop table if exists public.data_engine_commands cascade;
drop table if exists public.data_engine_status cascade;
drop table if exists public.webpage_scraper_sources cascade;
drop table if exists public.webpage_scraper_settings cascade;
drop table if exists public.data_engines cascade;
drop table if exists public.desktop_hosts cascade;
drop table if exists public.project_members cascade;
drop table if exists public.projects cascade;

-- Drop project/engine helper functions no longer needed
drop function if exists public.create_project_with_manager(text, text, text, public.project_type, text);
drop function if exists public.get_project_members_directory(uuid);
drop function if exists public.get_assignable_users_for_project(uuid);
drop function if exists public.initialize_webpage_scraper_engine(uuid, uuid);
drop function if exists public.ensure_project_data_engines(uuid);
drop function if exists public.claim_data_engine_command(uuid, text);
drop function if exists public.prune_data_engine_snapshots(uuid, integer);
drop function if exists public.prune_data_engine_logs(uuid, integer);
drop function if exists public.fail_stale_data_engine_command(bigint, integer);
drop function if exists public.get_data_engine_project_id(uuid);
drop function if exists public.can_read_data_engine(uuid);
drop function if exists public.can_control_data_engine(uuid);
drop function if exists public.can_configure_data_engine(uuid);
drop function if exists public.project_supports_data_engines(uuid);
drop function if exists public.is_project_member(uuid);
drop function if exists public.get_project_access_level(uuid);
drop function if exists public.is_project_manager(uuid);
drop function if exists public.count_project_managers(uuid);
drop function if exists public.enforce_project_manager_minimum();

commit;
