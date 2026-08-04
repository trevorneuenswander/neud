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

test("016 publishing migration creates foundation tables with transitional RLS", () => {
  const migration = read("supabase/migrations/016_project_publishing_foundation.sql");
  const sqlOnly = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  assert.match(migration, /create table if not exists public\.project_publishing_settings/);
  assert.match(migration, /create table if not exists public\.project_canonical_snapshots/);
  assert.match(migration, /create table if not exists public\.project_publisher_leases/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Transitional RLS/);
  assert.doesNotMatch(sqlOnly, /references public\.projects/);
  assert.doesNotMatch(sqlOnly, /is_project_member\s*\(/);
  assert.doesNotMatch(sqlOnly, /create policy/i);
  assert.doesNotMatch(sqlOnly, /using\s*\(\s*true\s*\)/i);
});

test("016 publishing migration enforces latest snapshot and lease uniqueness per project", () => {
  const migration = read("supabase/migrations/016_project_publishing_foundation.sql");
  assert.match(migration, /project_canonical_snapshots \([\s\S]*project_id uuid primary key/);
  assert.match(migration, /project_publisher_leases \([\s\S]*project_id uuid primary key/);
  assert.match(migration, /project_publishing_settings \([\s\S]*project_id uuid primary key/);
  assert.match(migration, /payload jsonb not null/);
  assert.match(migration, /payload_hash text not null/);
});

test("local canonical endpoint route and response builder exist", () => {
  const localApi = read("desktop/src/services/local-api-server.ts");
  const localData = read("desktop/src/services/local-data-service.ts");

  assert.match(localApi, /projectCanonicalMatch/);
  assert.match(localApi, /\/canonical\$/);
  assert.match(localApi, /getLocalCanonicalProjectResponse/);
  assert.match(localApi, /sendJsonNoStore/);
  assert.match(localData, /getLocalCanonicalProjectResponse/);
  assert.match(localData, /sanitizeCanonicalProjectData/);
  assert.match(localData, /CanonicalRevisionTracker/);
});

test("canonical JSON UI route redirects and navigation is removed", () => {
  const page = read("src/app/(portal)/projects/[slug]/canonical/page.tsx");
  const nav = read("src/components/projects/ProjectNav.tsx");
  const preview = read("src/components/projects/LocalCanonicalJsonPreview.tsx");

  assert.match(page, /redirect\(/);
  assert.match(page, /deferred to a later milestone/i);
  assert.doesNotMatch(nav, /\/canonical/);
  assert.doesNotMatch(nav, /Canonical JSON/);
  assert.match(preview, /localGetCanonicalProjectPayload/);
});
