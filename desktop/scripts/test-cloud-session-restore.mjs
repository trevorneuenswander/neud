import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("authenticated cloud coordinator exposes session restore wait helper", () => {
  const coordinator = readRepo("desktop/src/services/authenticated-cloud-coordinator.ts");
  assert.match(coordinator, /waitForSessionRestore/);
  assert.match(coordinator, /ensureAuthenticatedClient/);
});

test("activity sync waits for authenticated client before skipping", () => {
  const activitySync = readRepo("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(activitySync, /ensureAuthenticatedClient\(`activity-sync:\$\{reason\}`\)/);
  assert.doesNotMatch(
    activitySync,
    /isAuthenticatedCloudSessionAvailable\(\)[\s\S]*stage=no-cloud-session/,
  );
});

test("user directory sync waits for authenticated client", () => {
  const usersSync = readRepo(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(usersSync, /ensureAuthenticatedClient/);
});

test("display sync waits for authenticated client and pulls remote history", () => {
  const displaySync = readRepo("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(displaySync, /ensureAuthenticatedClient\(`display-sync:\$\{reason\}`\)/);
  assert.match(displaySync, /pullRemoteDisplayHistory/);
});
