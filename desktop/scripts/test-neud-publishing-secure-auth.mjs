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

test("018 secure publishing migration revokes service_role and grants authenticated", () => {
  const migration = read("supabase/migrations/018_project_publishing_secure_auth.sql");
  const sqlOnly = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  assert.match(migration, /revoke execute on function public\.acquire_project_publisher_lease/);
  assert.match(migration, /from service_role/);
  assert.match(migration, /grant execute on function public\.publish_project_canonical_snapshot/);
  assert.match(migration, /to authenticated/);
  assert.doesNotMatch(sqlOnly, /grant execute[\s\S]*acquire_project_publisher_lease[\s\S]*to service_role/i);
});

test("018 publishing RPC migration enforces auth.uid and project membership", () => {
  const migration = read("supabase/migrations/018_project_publishing_secure_auth.sql");

  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /authentication_required/);
  assert.match(migration, /is_project_member\(p_project_id\)/);
  assert.match(migration, /can_publish_project\(p_project_id\)/);
  assert.match(migration, /can_manage_project_publishing\(p_project_id\)/);
  assert.match(migration, /register_hosted_project_for_desktop/);
});

test("018 publishing RPC migration adds audit attribution columns", () => {
  const migration = read("supabase/migrations/018_project_publishing_secure_auth.sql");

  assert.match(migration, /acquired_by_user_id/);
  assert.match(migration, /published_by_user_id/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public/);
});

test("018 publishing RPC migration preserves lease and snapshot semantics", () => {
  const migration = read("supabase/migrations/018_project_publishing_secure_auth.sql");

  assert.match(migration, /lease_conflict/);
  assert.match(migration, /lease_not_owned/);
  assert.match(migration, /duplicate_unchanged/);
  assert.match(migration, /stale_revision/);
  assert.match(migration, /payload_too_large/);
  assert.match(migration, /publishing_disabled/);
  assert.match(migration, /octet_length\(convert_to\(p_payload::text, 'UTF8'\)\)/);
});

test("018 publishing migration adds membership-aware RLS read policies", () => {
  const migration = read("supabase/migrations/018_project_publishing_secure_auth.sql");

  assert.match(migration, /project_publishing_settings_select/);
  assert.match(migration, /project_canonical_snapshots_select/);
  assert.match(migration, /project_publisher_leases_select/);
  assert.match(migration, /using \(public\.is_project_member\(project_id\)\)/);
});

test("017 migration remains unchanged historical service_role baseline", () => {
  const migration = read("supabase/migrations/017_project_publishing_rpcs.sql");
  assert.match(migration, /to service_role/);
});
