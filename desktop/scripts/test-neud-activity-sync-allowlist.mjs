#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("data-source.changed is accepted by local sync allowlist", () => {
  const allowlist = read("src/lib/activity/sync-allowlist.ts");
  assert.match(allowlist, /"data-source\.changed"/);
});

test("migration 050 is additive and registered", () => {
  const migration = read("supabase/migrations/050_activity_sync_allowlist_extensions.sql");
  assert.match(migration, /'data-source\.changed'/);
  const apply = read("scripts/live-validation/apply-migrations.mjs");
  assert.match(apply, /050_activity_sync_allowlist_extensions\.sql/);
});

test("project marked activity events are allowlisted locally and in migration 051", () => {
  const allowlist = read("src/lib/activity/sync-allowlist.ts");
  assert.match(allowlist, /"project\.marked-active"/);
  assert.match(allowlist, /"project\.marked-inactive"/);
  const migration = read("supabase/migrations/051_project_marked_activity_events.sql");
  assert.match(migration, /'project\.marked-active'/);
  assert.match(migration, /'project\.marked-inactive'/);
  const apply = read("scripts/live-validation/apply-migrations.mjs");
  assert.match(apply, /051_project_marked_activity_events\.sql/);
});

test("exact allowlist remains explicit without wildcards", () => {
  const allowlist = read("src/lib/activity/sync-allowlist.ts");
  assert.doesNotMatch(allowlist, /display\.\*/);
  assert.doesNotMatch(allowlist, /data-source\.\*/);
  assert.match(allowlist, /ACTIVITY_SYNC_ALLOWED_EVENT_TYPES/);
});

test("retryRecoverableActivityEvents requeues allowlist failures", () => {
  const repository = read("desktop/src/repositories/activity-events-repository.ts");
  assert.match(repository, /retryRecoverableActivityEvents/);
  assert.match(repository, /sync_status = 'pending'/);
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /retryRecoverableActivityEvents/);
});

test("push uploads rows individually to avoid batch blocking", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /upsertEvents\(\[row\]\)/);
});

test("successful retry preserves cloud event id via upsert", () => {
  const client = read("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.match(client, /upsert_activity_events_for_sync/);
  const migration = read("supabase/migrations/050_activity_sync_allowlist_extensions.sql");
  assert.match(migration, /on conflict \(id\) do update/);
});

test("activity sync status uses lowercase activity mid-sentence", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /Some activity events failed to sync/);
  assert.match(service, /Activity sync is up to date/);
  assert.match(service, /Syncing activity…/);
  assert.doesNotMatch(service, /Some Activity events failed/);
});

test("data-source activity label is human-readable", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /Data source changed to \$\{label\}/);
  const normalize = read("src/lib/activity/normalize.ts");
  assert.match(normalize, /"data-source\.changed": "Data source changed"/);
});

test("invalid unknown event types remain rejected locally before upload", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /isActivitySyncAllowedEventType\(record\.type\)/);
});

test("offline state is distinct from forbidden allowlist failures", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /Activity sync is waiting for an internet connection/);
  assert.match(service, /event_not_allowlisted/);
});

test("diagnose activity sync script is registered", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:activity-sync/);
  assert.ok(fs.existsSync(path.join(root, "scripts/live-validation/diagnose-activity-sync.mjs")));
});
