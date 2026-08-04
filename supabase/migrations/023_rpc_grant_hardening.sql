-- 023_rpc_grant_hardening.sql
-- Align EXECUTE privileges on Slice 2.3 RPCs with the authenticated-only security model.
-- Idempotent: safe to rerun; adjusts grants only (no function bodies, RLS, or schema changes).

-- -----------------------------------------------------------------------------
-- Publishing RPCs (017 / 018)
-- Desktop clients call these with authenticated user sessions only.
-- -----------------------------------------------------------------------------

revoke all on function public.acquire_project_publisher_lease(uuid, uuid, integer) from public;
revoke execute on function public.acquire_project_publisher_lease(uuid, uuid, integer) from anon;
revoke execute on function public.acquire_project_publisher_lease(uuid, uuid, integer) from service_role;
grant execute on function public.acquire_project_publisher_lease(uuid, uuid, integer) to authenticated;

revoke all on function public.renew_project_publisher_lease(uuid, uuid, integer) from public;
revoke execute on function public.renew_project_publisher_lease(uuid, uuid, integer) from anon;
revoke execute on function public.renew_project_publisher_lease(uuid, uuid, integer) from service_role;
grant execute on function public.renew_project_publisher_lease(uuid, uuid, integer) to authenticated;

revoke all on function public.release_project_publisher_lease(uuid, uuid) from public;
revoke execute on function public.release_project_publisher_lease(uuid, uuid) from anon;
revoke execute on function public.release_project_publisher_lease(uuid, uuid) from service_role;
grant execute on function public.release_project_publisher_lease(uuid, uuid) to authenticated;

revoke all on function public.set_project_online_publishing_enabled(uuid, boolean) from public;
revoke execute on function public.set_project_online_publishing_enabled(uuid, boolean) from anon;
revoke execute on function public.set_project_online_publishing_enabled(uuid, boolean) from service_role;
grant execute on function public.set_project_online_publishing_enabled(uuid, boolean) to authenticated;

revoke all on function public.publish_project_canonical_snapshot(
  uuid,
  uuid,
  text,
  bigint,
  timestamptz,
  text,
  boolean,
  jsonb,
  text,
  integer
) from public;
revoke execute on function public.publish_project_canonical_snapshot(
  uuid,
  uuid,
  text,
  bigint,
  timestamptz,
  text,
  boolean,
  jsonb,
  text,
  integer
) from anon;
revoke execute on function public.publish_project_canonical_snapshot(
  uuid,
  uuid,
  text,
  bigint,
  timestamptz,
  text,
  boolean,
  jsonb,
  text,
  integer
) from service_role;
grant execute on function public.publish_project_canonical_snapshot(
  uuid,
  uuid,
  text,
  bigint,
  timestamptz,
  text,
  boolean,
  jsonb,
  text,
  integer
) to authenticated;

-- -----------------------------------------------------------------------------
-- Publishing authorization helpers (018)
-- Used by RLS and SECURITY DEFINER RPCs; authenticated callers only.
-- -----------------------------------------------------------------------------

revoke all on function public.can_publish_project(uuid) from public;
revoke execute on function public.can_publish_project(uuid) from anon;
revoke execute on function public.can_publish_project(uuid) from service_role;
grant execute on function public.can_publish_project(uuid) to authenticated;

revoke all on function public.can_manage_project_publishing(uuid) from public;
revoke execute on function public.can_manage_project_publishing(uuid) from anon;
revoke execute on function public.can_manage_project_publishing(uuid) from service_role;
grant execute on function public.can_manage_project_publishing(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Hosted project registration (018 / 020 / 021)
-- -----------------------------------------------------------------------------

revoke all on function public.register_hosted_project_for_desktop(
  uuid,
  text,
  text,
  public.project_type
) from public;
revoke execute on function public.register_hosted_project_for_desktop(
  uuid,
  text,
  text,
  public.project_type
) from anon;
revoke execute on function public.register_hosted_project_for_desktop(
  uuid,
  text,
  text,
  public.project_type
) from service_role;
grant execute on function public.register_hosted_project_for_desktop(
  uuid,
  text,
  text,
  public.project_type
) to authenticated;

revoke all on function public.can_create_cloud_project(uuid) from public;
revoke execute on function public.can_create_cloud_project(uuid) from anon;
revoke execute on function public.can_create_cloud_project(uuid) from service_role;
grant execute on function public.can_create_cloud_project(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Project access helpers (019)
-- -----------------------------------------------------------------------------

revoke all on function public.can_view_project(uuid) from public;
revoke execute on function public.can_view_project(uuid) from anon;
revoke execute on function public.can_view_project(uuid) from service_role;
grant execute on function public.can_view_project(uuid) to authenticated;

revoke all on function public.can_operate_project(uuid) from public;
revoke execute on function public.can_operate_project(uuid) from anon;
revoke execute on function public.can_operate_project(uuid) from service_role;
grant execute on function public.can_operate_project(uuid) to authenticated;

revoke all on function public.can_manage_project(uuid) from public;
revoke execute on function public.can_manage_project(uuid) from anon;
revoke execute on function public.can_manage_project(uuid) from service_role;
grant execute on function public.can_manage_project(uuid) to authenticated;

revoke all on function public.can_manage_project_users(uuid) from public;
revoke execute on function public.can_manage_project_users(uuid) from anon;
revoke execute on function public.can_manage_project_users(uuid) from service_role;
grant execute on function public.can_manage_project_users(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Desktop cloud sync RPCs (019)
-- -----------------------------------------------------------------------------

revoke all on function public.upsert_activity_events_for_sync(jsonb) from public;
revoke execute on function public.upsert_activity_events_for_sync(jsonb) from anon;
revoke execute on function public.upsert_activity_events_for_sync(jsonb) from service_role;
grant execute on function public.upsert_activity_events_for_sync(jsonb) to authenticated;

revoke all on function public.upsert_desktop_host_for_client(uuid, text, text, text, text) from public;
revoke execute on function public.upsert_desktop_host_for_client(uuid, text, text, text, text) from anon;
revoke execute on function public.upsert_desktop_host_for_client(uuid, text, text, text, text) from service_role;
grant execute on function public.upsert_desktop_host_for_client(uuid, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Directory RPCs (019)
-- -----------------------------------------------------------------------------

revoke all on function public.get_authorized_users_directory() from public;
revoke execute on function public.get_authorized_users_directory() from anon;
revoke execute on function public.get_authorized_users_directory() from service_role;
grant execute on function public.get_authorized_users_directory() to authenticated;

revoke all on function public.get_accessible_project_users_directory() from public;
revoke execute on function public.get_accessible_project_users_directory() from anon;
revoke execute on function public.get_accessible_project_users_directory() from service_role;
grant execute on function public.get_accessible_project_users_directory() to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger helper (019) — not a client RPC; remove broad EXECUTE grants.
-- -----------------------------------------------------------------------------

revoke all on function public.prevent_display_project_id_change() from public;
revoke execute on function public.prevent_display_project_id_change() from anon;
revoke execute on function public.prevent_display_project_id_change() from authenticated;
revoke execute on function public.prevent_display_project_id_change() from service_role;
