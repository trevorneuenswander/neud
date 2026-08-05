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

test("activity sync resolves access from current authorization context", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /this\.access\.getAuthorizationContext\(\)/);
  assert.doesNotMatch(service, /getAuthorizationContext\(userId\)/);
});

test("owner fallback no longer requires profileSyncedAt gate", () => {
  const access = read("desktop/src/services/access-authorization-service.ts");
  const ownerBlock = access.match(
    /buildSupabaseVerifiedOwnerContext[\s\S]*?return null;\s*\}/,
  )?.[0];
  assert.ok(ownerBlock);
  assert.doesNotMatch(ownerBlock, /profileSyncedAt/);
});

test("activity sync writes safe diagnostics log entries", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  const log = read("desktop/src/services/runtime-diagnostics-log.ts");
  assert.match(service, /appendActivitySyncLog/);
  assert.match(log, /activity-sync\.log/);
});

test("activity sync service still implements push and pull", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /pushPending/);
  assert.match(service, /pullRemote/);
});
