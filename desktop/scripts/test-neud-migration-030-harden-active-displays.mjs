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

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const migration = stripSqlComments(read("supabase/migrations/030_harden_project_active_displays.sql"));

const FINAL_SAFE_LIST_FIELDS = [
  "id",
  "slug",
  "name",
  "description",
  "display_width",
  "display_height",
  "enabled",
  "online_viewer_enabled",
  "online_visibility",
  "online_published_at",
  "online_published_revision_id",
  "online_publish_error",
  "refresh_rate_ms",
];

test("030 hardens list_project_active_displays with publish error column", () => {
  assert.match(read("supabase/migrations/030_harden_project_active_displays.sql"), /030_harden_project_active_displays\.sql/);
  assert.match(migration, /drop function if exists public\.list_project_active_displays\(uuid\)/);
  assert.match(migration, /create function public\.list_project_active_displays\(p_project_id uuid\)/);
  for (const field of FINAL_SAFE_LIST_FIELDS) {
    assert.match(migration, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(migration, /html_content/);
  assert.doesNotMatch(migration, /canonical_payload/);
  assert.doesNotMatch(migration, /credential/);
});

test("030 hardens grants with explicit anon and service_role revokes", () => {
  assert.match(migration, /revoke execute on function public\.list_project_active_displays\(uuid\) from anon/);
  assert.match(
    migration,
    /revoke execute on function public\.list_project_active_displays\(uuid\) from service_role/,
  );
  assert.match(
    migration,
    /revoke execute on function public\.count_active_displays_for_projects\(uuid\[\]\) from anon/,
  );
  assert.match(
    migration,
    /revoke execute on function public\.count_active_displays_for_projects\(uuid\[\]\) from service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.list_project_active_displays\(uuid\) to authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.count_active_displays_for_projects\(uuid\[\]\) to authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]* to anon/);
  assert.doesNotMatch(migration, /grant execute[\s\S]* to service_role/);
});

test("030 preserves SECURITY DEFINER and can_view_project enforcement", () => {
  assert.match(migration, /list_project_active_displays[\s\S]*security definer[\s\S]*set search_path = public/i);
  assert.match(
    migration,
    /count_active_displays_for_projects[\s\S]*security definer[\s\S]*set search_path = public/i,
  );
  assert.match(migration, /deleted_at is null/);
  assert.match(migration, /is_archived = false/);
  assert.match(migration, /can_view_project/);
});

test("030 count RPC includes all active displays regardless of publish or viewer state", () => {
  const countSection = migration.match(
    /count_active_displays_for_projects[\s\S]*revoke all on function public\.count_active_displays_for_projects/,
  )?.[0];
  assert.ok(countSection);
  assert.doesNotMatch(countSection, /online_viewer_enabled = true/);
  assert.doesNotMatch(countSection, /enabled = true/);
  assert.doesNotMatch(countSection, /online_published_revision_id is not null/);
});
