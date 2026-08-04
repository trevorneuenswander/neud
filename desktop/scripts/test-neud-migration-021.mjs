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

test("021 migration adds entitlement hook and abuse controls", () => {
  const migration = read("supabase/migrations/021_cloud_project_registration_hardening.sql");
  assert.match(migration, /can_create_cloud_project/);
  assert.match(migration, /cloud_project_registration_audit/);
  assert.match(migration, /registration_limit_reached/);
  assert.match(migration, /slug_reserved/);
  assert.match(migration, /char_length\(v_name\) > 120/);
  assert.match(migration, /registered_by_user_id/);
});

test("021 migration keeps registration server-derived", () => {
  const migration = read("supabase/migrations/021_cloud_project_registration_hardening.sql");
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.doesNotMatch(migration, /p_registered_by_user_id/);
});
