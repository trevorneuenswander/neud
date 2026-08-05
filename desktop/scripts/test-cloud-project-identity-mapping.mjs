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

test("cloud identity diagnostic maps local and hosted project ids", () => {
  const service = read("desktop/src/services/cloud-identity-diagnostic-service.ts");
  assert.match(service, /hostedProjectsBySlug/);
  assert.match(service, /localProjectId/);
  assert.match(service, /cloud-identity-diagnostic\.json/);
});

test("hosted identity reconciliation realigns local project ids", () => {
  const reconcile = read("desktop/src/services/display-sync/hosted-identity-reconciliation.ts");
  assert.match(reconcile, /register_hosted_project_for_desktop/);
  assert.match(reconcile, /realignProjectId/);
});

test("activity sync registers hosted project before upload", () => {
  const activity = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(activity, /ensureHostedProjectForSync/);
  assert.match(activity, /push\.registration_failed/);
  assert.match(activity, /push\.project_realigned/);
});

test("local data service exposes hosted project registration for sync", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /ensureHostedProjectRegisteredForSync/);
  assert.match(localData, /reconcileHostedProjectAndDisplayIdentity/);
});
