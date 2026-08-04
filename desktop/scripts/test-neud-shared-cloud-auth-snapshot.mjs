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

test("shared cloud auth snapshot resolves authenticated session from client readiness only", async () => {
  const {
    buildSharedCloudAuthSnapshot,
    resolveAuthenticatedCloudSessionAvailable,
  } = await import(
    pathToFileURL(path.join(desktopRoot, "dist/services/shared-cloud-auth-snapshot.js")).href
  );

  assert.equal(
    resolveAuthenticatedCloudSessionAvailable({
      authenticatedClientReady: true,
      reauthenticationRequired: false,
    }),
    true,
  );
  assert.equal(
    resolveAuthenticatedCloudSessionAvailable({
      authenticatedClientReady: false,
      reauthenticationRequired: false,
    }),
    false,
  );
  assert.equal(
    resolveAuthenticatedCloudSessionAvailable({
      authenticatedClientReady: true,
      reauthenticationRequired: true,
    }),
    false,
  );

  const snapshot = buildSharedCloudAuthSnapshot({
    diagnostics: {
      authenticatedClientReady: true,
      reauthenticationRequired: false,
      tokenExpired: false,
      refreshResult: "success",
      lastRefreshErrorCode: null,
      sessionGeneration: 3,
      sessionServiceInstanceIdHash: "abc123",
    },
    hasCloudSession: true,
    hasRestorableCloudSession: true,
  });
  assert.equal(snapshot.authenticatedCloudSessionAvailable, true);
  assert.equal(snapshot.hasCloudSession, true);
});

test("AuthenticatedCloudCoordinator exposes unified auth snapshot API", () => {
  const coordinator = read("desktop/src/services/authenticated-cloud-coordinator.ts");
  assert.match(coordinator, /getAuthSnapshot\(\): SharedCloudAuthSnapshot/);
  assert.match(coordinator, /isAuthenticatedCloudSessionAvailable\(\): boolean/);
  assert.match(coordinator, /buildSharedCloudAuthSnapshot/);
});

test("PublishingManager uses coordinator auth snapshot instead of local session wrappers", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /getAuthSnapshot\(\)/);
  assert.match(manager, /isAuthenticatedCloudSessionAvailable/);
  assert.doesNotMatch(manager, /private hasAuthenticatedCloudSession/);
  assert.doesNotMatch(manager, /private hasRestorableCloudSession/);
});

test("DisplaySyncService reports explicit unavailable reasons from auth snapshot", () => {
  const service = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(service, /resolveSyncUnavailableReason/);
  assert.match(service, /missing_authenticated_client/);
  assert.match(service, /refresh_failed/);
  assert.match(service, /isAuthenticatedCloudSessionAvailable/);
});

test("diagnostics scripts resolve auth from sharedCloudAuth snapshot only", () => {
  const publishing = read("scripts/live-validation/diagnose-broad-arrow-publishing.mjs");
  const online = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  const session = read("scripts/live-validation/diagnose-desktop-cloud-session.mjs");

  assert.match(publishing, /sharedAuthSnapshot/);
  assert.match(online, /sharedAuthSnapshot/);
  assert.match(session, /sharedAuthSnapshot/);
  assert.doesNotMatch(
    publishing,
    /publishingRuntime\.authenticatedSessionAvailable[\s\S]{0,80}authenticatedCloudSessionAvailable/,
  );
});
