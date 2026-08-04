#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("publishing backoff helper stays bounded with jitter", async () => {
  const { computePublishingBackoffMs, PUBLISHING_BACKOFF_MS } = await import(
    pathToFileURL(path.join(desktopRoot, "dist/services/publishing/types.js")).href
  );

  const first = computePublishingBackoffMs(0, PUBLISHING_BACKOFF_MS);
  const last = computePublishingBackoffMs(99, PUBLISHING_BACKOFF_MS);
  assert.ok(first >= PUBLISHING_BACKOFF_MS[0]);
  assert.ok(first <= PUBLISHING_BACKOFF_MS[0] * 1.2 + 1);
  assert.ok(last >= PUBLISHING_BACKOFF_MS[PUBLISHING_BACKOFF_MS.length - 1]);
});

test("recoverable publishing errors exclude authorization and payload failures", async () => {
  const { isRecoverablePublishingError } = await import(
    pathToFileURL(path.join(desktopRoot, "dist/services/publishing/types.js")).href
  );

  assert.equal(isRecoverablePublishingError("network"), true);
  assert.equal(isRecoverablePublishingError("lease_conflict"), true);
  assert.equal(isRecoverablePublishingError("publishing_disabled"), false);
  assert.equal(isRecoverablePublishingError("stale_revision"), false);
  assert.equal(isRecoverablePublishingError("payload_too_large"), false);
});

test("PublishingManager implements lease, duplicate suppression, and diagnostics", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const client = read("desktop/src/services/publishing/cloud-publishing-client.ts");

  assert.match(manager, /class PublishingManager/);
  assert.match(manager, /notifyProjectCanonicalMayHaveChanged/);
  assert.match(manager, /setProjectPublishingEnabled/);
  assert.match(manager, /ensureProjectPublishingForOnlineViewer/);
  assert.match(manager, /ensurePublisherLease/);
  assert.match(manager, /getProjectDiagnostics/);
  assert.match(manager, /hashCanonicalProjectData/);
  assert.match(manager, /validatePublishedProjectPayload/);
  assert.match(manager, /resyncAfterInFlight/);
  assert.match(manager, /PUBLISHING_MAX_PAYLOAD_BYTES/);
  assert.match(client, /acquire_project_publisher_lease/);
  assert.match(client, /publish_project_canonical_snapshot/);
});

test("desktop main process wires PublishingManager lifecycle and canonical hooks", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /new PublishingManager/);
  assert.match(main, /setPublishingManager/);
  assert.match(main, /publishingManager\?\.ensureStarted/);
  assert.match(main, /await publishingManager\?\.stop/);
  assert.match(main, /observeScraperCanonicalUpdate/);
  assert.match(main, /bagLiveStateEvents\.on\("update"/);
  const routes = read("desktop/src/bag/live-state/bag-live-state-routes.ts");
  assert.match(routes, /notifyLocalControllerCanonicalChanged/);
});

test("local API exposes publishing diagnostics and developer enable route", () => {
  const localApi = read("desktop/src/services/local-api-server.ts");
  assert.match(localApi, /projectPublishingStatusMatch/);
  assert.match(localApi, /projectPublishingEnableMatch/);
  assert.match(localApi, /\/api\/publishing\/diagnostics/);
  assert.match(localApi, /getProjectPublishingDiagnostics/);
  assert.match(localApi, /setProjectPublishingEnabled/);
});

test("instance identity reuses persistent neud.instanceId setting", () => {
  const instanceId = read("desktop/src/services/neud-instance-id.ts");
  assert.match(instanceId, /NEUD_INSTANCE_ID_SETTING_KEY = "neud\.instanceId"/);
  assert.match(instanceId, /randomUUID/);
});
