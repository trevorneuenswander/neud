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

test("PublishingManager renews lease on heartbeat when canonical data is unchanged", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /ensurePublisherLease/);
  assert.match(manager, /shouldMaintainPublisherLease/);
  assert.match(manager, /if \(unchanged\)/);
  assert.match(manager, /"heartbeat"/);
  assert.match(manager, /await this\.syncProject\(project\.id, "heartbeat"\)/);
});

test("PublishingManager separates snapshot publication from lease heartbeat", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /renewLease/);
  assert.match(manager, /publishSnapshot/);
  assert.doesNotMatch(
    manager,
    /payloadHash === state\.latestPublishedHash[\s\S]{0,120}return;\s*\}\s*state\.pending = \{[\s\S]{0,400}publishSnapshot/,
  );
});

test("Online Viewer enable reconciles effective project publishing", () => {
  const developerTools = read("desktop/src/services/developer-tools-service.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  const main = read("desktop/src/main.ts");

  assert.match(developerTools, /reconcileProjectPublishing/);
  assert.match(localData, /hasEligibleOnlineViewerDisplay/);
  assert.match(localData, /reconcileProjectPublishingForOnlineViewer/);
  assert.match(main, /reconcileProjectPublishing:/);
});

test("effective publishing auto-enables cloud project publishing for online displays", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /ensureProjectPublishingEnabled/);
  assert.match(manager, /reconcileEffectivePublishing/);
  assert.match(manager, /PUBLISHING_DISABLE_GRACE_MS/);
  assert.match(manager, /disableProjectPublishingWhenIdle/);
});

test("last online display disable waits for grace period before stopping publishing", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /onlineViewerGraceTimer/);
  assert.match(manager, /disableProjectPublishingWhenIdle/);
});

test("local controller mode counts as connected source in canonical publishing", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /local-controller/);
  assert.match(localData, /return true;/);
});
