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

test("activity sync service logs push and pull stages", () => {
  const activity = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(activity, /appendActivitySyncLog/);
  assert.match(activity, /sync\.begin/);
  assert.match(activity, /sync\.complete/);
  assert.match(activity, /push\.rpc_failed/);
});

test("activity sync uses authenticated cloud coordinator without service role", () => {
  const client = read("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.doesNotMatch(client, /service_role/);
  assert.match(client, /upsert_activity_events_for_sync/);
});

test("activity sync starts on login and syncNow is invoked", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /activitySyncService\?\.syncNow\("login"\)/);
  assert.match(main, /setEnsureHostedProjectForSync/);
});
