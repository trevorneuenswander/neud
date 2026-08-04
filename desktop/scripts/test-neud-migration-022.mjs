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

test("022 migration restores hosted project foundation idempotently", () => {
  const migration = read("supabase/migrations/022_restore_hosted_project_foundation.sql");
  assert.match(migration, /create table if not exists public\.projects/);
  assert.match(migration, /create table if not exists public\.project_members/);
  assert.match(migration, /create type public\.project_type as enum/);
  assert.match(migration, /is_project_member/);
  assert.match(migration, /is_project_manager/);
  assert.match(migration, /get_project_access_level/);
  assert.match(migration, /rename column company to team/);
  assert.match(migration, /add column if not exists email text/);
  assert.match(migration, /drop policy if exists/);
  assert.doesNotMatch(migration, /drop table public\.(displays|activity_events|project_publishing_settings)/i);
});

test("022 migration is ordered before 018 in live apply script", () => {
  const applyScript = read("scripts/live-validation/apply-migrations.mjs");
  const index022 = applyScript.indexOf("022_restore_hosted_project_foundation.sql");
  const index018 = applyScript.indexOf("018_project_publishing_secure_auth.sql");
  assert.ok(index022 > -1);
  assert.ok(index018 > index022);
});
