-- Post-019/020/021/023 security audit for non-production and pre-production validation.
-- Run after applying migrations 016 through 023.

-- FAIL when authenticated-only RPCs still grant EXECUTE to anon
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and privilege_type = 'EXECUTE'
  and grantee = 'anon'
  and routine_name in (
    'acquire_project_publisher_lease',
    'renew_project_publisher_lease',
    'release_project_publisher_lease',
    'publish_project_canonical_snapshot',
    'set_project_online_publishing_enabled',
    'can_publish_project',
    'can_manage_project_publishing',
    'register_hosted_project_for_desktop',
    'can_create_cloud_project',
    'can_view_project',
    'can_operate_project',
    'can_manage_project',
    'can_manage_project_users',
    'upsert_activity_events_for_sync',
    'upsert_desktop_host_for_client',
    'get_authorized_users_directory',
    'get_accessible_project_users_directory'
  )
order by routine_name;

-- FAIL when authenticated-only RPCs still grant EXECUTE to service_role
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and privilege_type = 'EXECUTE'
  and grantee = 'service_role'
  and routine_name in (
    'acquire_project_publisher_lease',
    'renew_project_publisher_lease',
    'release_project_publisher_lease',
    'publish_project_canonical_snapshot',
    'set_project_online_publishing_enabled',
    'can_publish_project',
    'can_manage_project_publishing',
    'register_hosted_project_for_desktop',
    'can_create_cloud_project',
    'can_view_project',
    'can_operate_project',
    'can_manage_project',
    'can_manage_project_users',
    'upsert_activity_events_for_sync',
    'upsert_desktop_host_for_client',
    'get_authorized_users_directory',
    'get_accessible_project_users_directory'
  )
order by routine_name;

-- Publishing RPC grants: authenticated yes, service_role no, anon no
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'acquire_project_publisher_lease',
    'renew_project_publisher_lease',
    'release_project_publisher_lease',
    'publish_project_canonical_snapshot',
    'set_project_online_publishing_enabled',
    'register_hosted_project_for_desktop',
    'upsert_activity_events_for_sync',
    'upsert_desktop_host_for_client',
    'get_authorized_users_directory',
    'get_accessible_project_users_directory',
    'can_create_cloud_project',
    'can_publish_project',
    'can_manage_project_publishing',
    'can_view_project',
    'can_operate_project',
    'can_manage_project',
    'can_manage_project_users'
  )
order by routine_name, grantee;

-- Duplicate/overloaded publishing RPC signatures
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'acquire_project_publisher_lease',
    'renew_project_publisher_lease',
    'release_project_publisher_lease',
    'publish_project_canonical_snapshot',
    'set_project_online_publishing_enabled',
    'register_hosted_project_for_desktop',
    'upsert_activity_events_for_sync',
    'can_create_cloud_project'
  )
order by p.proname, identity_args;

-- SECURITY DEFINER functions must pin search_path
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and p.proname in (
    'can_view_project',
    'can_operate_project',
    'can_manage_project',
    'can_manage_project_users',
    'register_hosted_project_for_desktop',
    'upsert_activity_events_for_sync',
    'get_authorized_users_directory',
    'get_accessible_project_users_directory',
    'can_create_cloud_project'
  )
order by p.proname;

-- Display RLS policies
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('displays', 'display_revisions', 'display_deletion_tombstones')
order by tablename, policyname;

-- Confirm auth.uid() appears in final register function body
select pg_get_functiondef(p.oid) as register_function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'register_hosted_project_for_desktop'
limit 1;
