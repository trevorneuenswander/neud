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

test("017 publishing RPC migration defines atomic lease and snapshot functions", () => {
  const migration = read("supabase/migrations/017_project_publishing_rpcs.sql");
  const sqlOnly = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  assert.match(migration, /create or replace function public\.acquire_project_publisher_lease/);
  assert.match(migration, /create or replace function public\.renew_project_publisher_lease/);
  assert.match(migration, /create or replace function public\.release_project_publisher_lease/);
  assert.match(migration, /create or replace function public\.publish_project_canonical_snapshot/);
  assert.match(migration, /create or replace function public\.set_project_online_publishing_enabled/);
  assert.match(migration, /for update/);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute on function public\.acquire_project_publisher_lease/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(sqlOnly, /grant execute[\s\S]*to authenticated/i);
});

test("017 publishing RPC migration enforces lease conflict and duplicate hash handling", () => {
  const migration = read("supabase/migrations/017_project_publishing_rpcs.sql");
  assert.match(migration, /lease_conflict/);
  assert.match(migration, /lease_not_owned/);
  assert.match(migration, /duplicate_unchanged/);
  assert.match(migration, /stale_revision/);
  assert.match(migration, /payload_too_large/);
  assert.match(migration, /publishing_disabled/);
});

test("017 publishing RPC migration does not rewrite migration 016 tables", () => {
  const migration = read("supabase/migrations/017_project_publishing_rpcs.sql");
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /alter table public\.project_canonical_snapshots/i);
});
