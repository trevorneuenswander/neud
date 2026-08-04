#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const publishingRpcs = [
  "acquire_project_publisher_lease",
  "renew_project_publisher_lease",
  "release_project_publisher_lease",
  "publish_project_canonical_snapshot",
  "set_project_online_publishing_enabled",
  "register_hosted_project_for_desktop",
];

const authenticatedCloudRpcs = [
  "upsert_activity_events_for_sync",
  "upsert_desktop_host_for_client",
  "get_authorized_users_directory",
  "get_accessible_project_users_directory",
];

test("018 revokes service_role from publishing RPCs", () => {
  const migration = read("supabase/migrations/018_project_publishing_secure_auth.sql");
  for (const rpc of publishingRpcs) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}`), rpc);
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[^;]* to authenticated`), rpc);
  }
});

test("019 grants authenticated cloud sync RPCs and display RLS", () => {
  const migration = read("supabase/migrations/019_desktop_authenticated_cloud_auth.sql");
  for (const rpc of authenticatedCloudRpcs) {
    assert.match(migration, new RegExp(rpc));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`));
  }
  assert.match(migration, /create policy displays_select/);
  assert.match(migration, /set search_path = public/);
});

test("024 hardens online viewer RPC grants and activity allowlist", () => {
  const migration = read("supabase/migrations/024_display_online_viewer.sql");
  assert.match(migration, /get_online_display_viewer_bundle/);
  assert.match(migration, /list_online_project_displays/);
  assert.match(migration, /revoke execute on function public\.get_online_display_viewer_bundle[^;]* from service_role/);
  assert.match(migration, /revoke execute on function public\.list_online_project_displays[^;]* from anon/);
  assert.match(migration, /display\.online_viewer_enabled/);
  assert.match(migration, /online_published_revision_id/);
});

test("020 supersedes platform-admin-only new project registration", () => {
  const migration = read("supabase/migrations/020_owner_project_registration.sql");
  assert.match(migration, /create or replace function public\.register_hosted_project_for_desktop/);
  assert.doesNotMatch(migration, /is_platform_admin\(\)/);
});

test("final-state SQL audit script exists for live execution", () => {
  const audit = read("supabase/audits/post_019_security_audit.sql");
  assert.match(audit, /pg_proc/);
  assert.match(audit, /information_schema\.routine_privileges/);
  assert.match(audit, /auth\.uid\(\)/);
  for (const rpc of publishingRpcs) {
    assert.match(audit, new RegExp(rpc));
  }
});

test("production migration runbook documents apply order and rollback", () => {
  const runbook = read("docs/production-migration-runbook-v0.1.1.md");
  assert.match(runbook, /016/);
  assert.match(runbook, /017/);
  assert.match(runbook, /018/);
  assert.match(runbook, /019/);
  assert.match(runbook, /020/);
  assert.match(runbook, /021/);
  assert.match(runbook, /rollback/i);
  assert.match(runbook, /non-production/i);
});
