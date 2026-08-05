-- WARNING: MANUAL EXECUTION ONLY
-- Verification queries after destructive cleanup.

-- Retained tables should exist
select to_regclass('public.profiles') as profiles_table;
select to_regclass('public.access_requests') as access_requests_table;
select to_regclass('public.account_entitlements') as account_entitlements_table;
select to_regclass('public.authorized_devices') as authorized_devices_table;
select to_regclass('public.auth_audit_log') as auth_audit_log_table;

-- Removed tables should be gone
select to_regclass('public.projects') as projects_table;
select to_regclass('public.data_engines') as data_engines_table;
select to_regclass('public.data_engine_commands') as data_engine_commands_table;
select to_regclass('public.desktop_hosts') as desktop_hosts_table;

-- Realtime publication should no longer include runtime tables
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
