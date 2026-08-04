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

const migration = stripSqlComments(read("supabase/migrations/029_list_project_active_displays.sql"));

const BASELINE_SAFE_LIST_FIELDS = [
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
  "refresh_rate_ms",
];

test("029 baseline defines authenticated active display listing RPCs", () => {
  assert.match(read("supabase/migrations/029_list_project_active_displays.sql"), /029_list_project_active_displays\.sql/);
  assert.match(migration, /create or replace function public\.list_project_active_displays\(p_project_id uuid\)/);
  assert.match(
    migration,
    /create or replace function public\.count_active_displays_for_projects\(p_project_ids uuid\[\]\)/,
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public/);
  assert.match(migration, /can_view_project/);
});

test("029 baseline returns safe portal metadata without publish error column", () => {
  for (const field of BASELINE_SAFE_LIST_FIELDS) {
    assert.match(migration, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(migration, /online_publish_error/);
  assert.doesNotMatch(migration, /html_content/);
  assert.doesNotMatch(migration, /canonical_payload/);
});

test("029 baseline excludes archived and deleted displays", () => {
  assert.match(migration, /list_project_active_displays[\s\S]*deleted_at is null[\s\S]*is_archived = false/);
  assert.match(
    migration,
    /count_active_displays_for_projects[\s\S]*deleted_at is null[\s\S]*is_archived = false/,
  );
});

test("029 baseline grants authenticated only through public revoke", () => {
  assert.match(
    migration,
    /grant execute on function public\.list_project_active_displays\(uuid\) to authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.count_active_displays_for_projects\(uuid\[\]\) to authenticated/,
  );
  assert.match(migration, /revoke all on function public\.list_project_active_displays\(uuid\) from public/);
  assert.doesNotMatch(migration, /revoke execute on function public\.list_project_active_displays\(uuid\) from anon/);
  assert.doesNotMatch(
    migration,
    /revoke execute on function public\.list_project_active_displays\(uuid\) from service_role/,
  );
});

test("hosted portal uses list and count RPCs without N+1 count queries", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /rpc\("count_active_displays_for_projects"/);
  assert.match(queries, /rpc\("list_project_active_displays"/);
  assert.match(queries, /from\("project_members"\)/);
  assert.doesNotMatch(queries, /for \(const project of projectRows\)[\s\S]*count_active_displays_for_projects/);
});

test("public viewer bundle RPC remains separate from authenticated active listing", () => {
  const viewerMigration = stripSqlComments(read("supabase/migrations/024_display_online_viewer.sql"));
  assert.match(viewerMigration, /get_online_display_viewer_bundle/);
  assert.match(migration, /list_project_active_displays/);
  assert.doesNotMatch(migration, /get_online_display_viewer_bundle/);
});
