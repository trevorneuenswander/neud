#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("display sync pulls revision metadata before selective HTML bodies", () => {
  const client = read("desktop/src/services/display-sync/cloud-display-client.ts");
  const pull = read("desktop/src/services/display-sync/display-sync-pull.ts");
  assert.match(client, /DISPLAY_REVISION_METADATA_COLUMNS/);
  assert.match(client, /fetchRevisionMetadataForDisplays/);
  assert.match(client, /fetchRevisionBodiesByIds/);
  assert.match(pull, /fetchRevisionMetadataForDisplays/);
  assert.match(pull, /bodiesFetched=/);
  assert.match(pull, /needBodies/);
});

test("hosted project register RPC is session-cached after success", () => {
  const reconcile = read(
    "desktop/src/services/display-sync/hosted-identity-reconciliation.ts",
  );
  assert.match(reconcile, /registeredHostedProjectIds/);
  assert.match(reconcile, /code: "cached"/);
});

test("display sync periodic interval is 180s", () => {
  const service = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(service, /180_000/);
});

test("activity sync skips idle periodic pulls", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /skipIdlePull/);
  assert.match(service, /pull=skipped-idle/);
});
