-- WARNING: MANUAL EXECUTION ONLY
-- Preflight checks before migrating NEUD to desktop-only runtime data.
-- Do not run as part of normal app setup.

-- 1. Confirm current table counts
select 'access_requests' as table_name, count(*) as row_count from public.access_requests
union all select 'profiles', count(*) from public.profiles
union all select 'projects', count(*) from public.projects
union all select 'project_members', count(*) from public.project_members
union all select 'data_engines', count(*) from public.data_engines
union all select 'data_engine_status', count(*) from public.data_engine_status
union all select 'data_engine_commands', count(*) from public.data_engine_commands
union all select 'data_engine_snapshots', count(*) from public.data_engine_snapshots
union all select 'data_engine_logs', count(*) from public.data_engine_logs
union all select 'webpage_scraper_settings', count(*) from public.webpage_scraper_settings
union all select 'webpage_scraper_sources', count(*) from public.webpage_scraper_sources
union all select 'desktop_hosts', count(*) from public.desktop_hosts;

-- 2. Confirm auth users still exist for retained login service
select count(*) as auth_user_count from auth.users;

-- 3. Confirm no pending engine commands you still need
select count(*) as pending_commands
from public.data_engine_commands
where status in ('pending', 'processing');
