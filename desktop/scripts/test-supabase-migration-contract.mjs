#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationsDir = path.join(repoRoot, "supabase/migrations");

function readMigration(name) {
  return fs.readFileSync(path.join(migrationsDir, name), "utf8");
}

function combinedMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => fs.readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n");
}

test("required access management directory RPC migration exists", () => {
  const combined = combinedMigrations();
  assert.match(combined, /get_access_management_directory/);
  assert.match(combined, /grant execute on function public\.get_access_management_directory/);
});

test("required activity sync RPC migration exists", () => {
  const combined = combinedMigrations();
  assert.match(combined, /upsert_activity_events_for_sync/);
});

test("hosted desktop project registration RPC exists", () => {
  const combined = combinedMigrations();
  assert.match(combined, /register_hosted_project_for_desktop/);
});

test("migration 044+ uses boolean include_fixtures overload", () => {
  const migration044 = readMigration("044_exclude_validation_fixtures_from_directory.sql");
  assert.match(migration044, /p_include_fixtures boolean/);
  assert.match(migration044, /get_access_management_directory\(boolean\)/);
});

test("activity allowlist migrations through 051 are present", () => {
  assert.equal(fs.existsSync(path.join(migrationsDir, "050_activity_sync_allowlist_extensions.sql")), true);
  assert.equal(fs.existsSync(path.join(migrationsDir, "051_project_marked_activity_events.sql")), true);
});
