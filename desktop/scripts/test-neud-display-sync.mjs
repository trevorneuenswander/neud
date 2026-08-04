import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("supabase displays migration exists", () => {
  const migration = read("supabase/migrations/012_displays.sql");
  assert.match(migration, /create table if not exists public\.displays/);
  assert.match(migration, /display_revisions/);
  assert.match(migration, /display_deletion_tombstones/);
});

test("local display sync migration exists", () => {
  const migration = read("desktop/src/database/migrations/024_display_sync.sql");
  assert.match(migration, /display_sync_queue/);
  assert.match(migration, /display_deletion_tombstones/);
});

test("display sync service implements push and tombstone pull", () => {
  const service = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(service, /pushPending/);
  assert.match(service, /pullTombstones/);
  assert.match(service, /queueOperation/);
  assert.match(service, /reconcileHostedProjectAndDisplayIdentity/);
  assert.match(service, /syncFollowUpRequested/);
  assert.match(service, /pushDisplayBaseMetadata/);
  assert.match(service, /collectDisplaySyncTargets/);
  assert.match(service, /resolveSyncPassResult/);
});

test("display enable queues immediate sync", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /syncNow\?\.\("display-enabled"\)/);
});

test("main wires display sync service", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /DisplaySyncService/);
  assert.match(main, /bootstrapRestoredCloudSession/);
  assert.match(main, /startCloudSyncServices/);
  assert.match(main, /setDisplaySync/);
});

test("create display queues sync operations", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /display\.create/);
  assert.match(service, /display\.revision\.create/);
});
