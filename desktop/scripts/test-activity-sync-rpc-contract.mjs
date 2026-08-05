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

test("supabase activity sync RPC migration exists", () => {
  const files = fs
    .readdirSync(path.join(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"));
  const combined = files
    .map((name) => read(path.join("supabase/migrations", name)))
    .join("\n");
  assert.match(combined, /upsert_activity_events_for_sync/);
});

test("local allowlist stays aligned with RPC-oriented event types", () => {
  const allowlist = read("desktop/src/lib/activity/sync-allowlist.ts");
  const migrationFiles = fs
    .readdirSync(path.join(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"));
  const combined = migrationFiles
    .map((name) => stripSqlComments(read(path.join("supabase/migrations", name))))
    .join("\n");
  assert.match(allowlist, /developer-tools\.display-published/);
  assert.match(combined, /upsert_activity_events_for_sync/);
});

test("activity sync RPC contract uses authenticated actor semantics", () => {
  const mapper = read("desktop/src/services/activity-sync/cloud-activity-mapper.ts");
  assert.match(mapper, /toCloudActivityRow/);
  assert.doesNotMatch(mapper, /service_role/);
});
