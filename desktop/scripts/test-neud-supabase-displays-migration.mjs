import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("012_displays migration does not reference project_members relation", () => {
  const migration = read("supabase/migrations/012_displays.sql");
  const sqlOnly = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /public\.project_members/);
  assert.doesNotMatch(sqlOnly, /from project_members/i);
  assert.doesNotMatch(sqlOnly, /join project_members/i);
  assert.doesNotMatch(sqlOnly, /is_project_member\s*\(/);
});

test("012_displays migration uses transitional RLS like activity events", () => {
  const migration = read("supabase/migrations/012_displays.sql");
  const activity = read("supabase/migrations/011_activity_events.sql");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Transitional RLS/);
  assert.match(migration, /service role/);
  assert.match(activity, /Does NOT require public\.projects, project_members/);
});

test("012_displays migration creates display tables with idempotent guards", () => {
  const migration = read("supabase/migrations/012_displays.sql");
  assert.match(migration, /create table if not exists public\.displays/);
  assert.match(migration, /create table if not exists public\.display_revisions/);
  assert.match(migration, /create table if not exists public\.display_deletion_tombstones/);
  assert.match(migration, /create trigger displays_updated_at/);
});

test("012_displays migration only depends on schema established before it", () => {
  const migration = read("supabase/migrations/012_displays.sql");
  assert.match(migration, /public\.set_updated_at/);
  assert.doesNotMatch(migration, /references public\.projects/);
});
