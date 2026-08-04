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

test("SupabaseUserSessionService exposes a stable instance id hash", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /instanceIdHash/);
  assert.match(session, /nextInstanceSerial/);
});

test("only one SupabaseUserSessionService is constructed in main", () => {
  const main = read("desktop/src/main.ts");
  const matches = main.match(/new SupabaseUserSessionService/g) ?? [];
  assert.equal(matches.length, 1);
});

test("AuthenticatedCloudCoordinator resolves client at request time", () => {
  const coordinator = read("desktop/src/services/authenticated-cloud-coordinator.ts");
  assert.match(coordinator, /acquireAuthenticatedClient/);
  assert.match(coordinator, /setSessionRestorePromise/);
  assert.doesNotMatch(coordinator, /private client: SupabaseClient/);
});

test("CloudAccessBridge uses shared coordinator and does not store a client", () => {
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  assert.match(bridge, /acquireAuthenticatedClient/);
  assert.match(bridge, /bridge_constructed/);
  assert.match(bridge, /directoryRequestInFlight/);
  assert.doesNotMatch(bridge, /private client: SupabaseClient/);
  assert.doesNotMatch(bridge, /Authenticated cloud client is unavailable/);
});

test("main restores persisted cloud session before local API starts", () => {
  const main = read("desktop/src/main.ts");
  const restoreIndex = main.indexOf("restorePersistedCloudSessionEarly");
  const localApiIndex = main.indexOf("localApiServer = new LocalApiServer");
  assert.ok(restoreIndex >= 0);
  assert.ok(localApiIndex >= 0);
  assert.ok(restoreIndex < localApiIndex);
  assert.match(main, /setSessionRestorePromise/);
  assert.match(main, /await Promise\.race/);
});

test("PublishingManager and CloudAccessBridge share the same session service instance", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /new CloudAccessBridge\(authenticatedCloud\)/);
  assert.match(main, /new PublishingManager\(\s*\n\s*authenticatedCloud,/);
  assert.match(main, /new AuthenticatedCloudCoordinator\(\s*\n\s*supabaseUserSessionService,/);
});

test("directory retry uses force refresh through local API", () => {
  const api = read("src/lib/local/cloud-access-api.ts");
  const server = read("desktop/src/services/local-api-server.ts");
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  assert.match(api, /forceRefresh/);
  assert.match(server, /forceRefresh/);
  assert.match(client, /reload\(\{ forceRefresh: true \}\)/);
  assert.match(client, /retryInFlightRef/);
});

test("client failure states are distinct from offline", () => {
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  const directory = read("desktop/src/services/cloud-access-directory.ts");
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  assert.match(bridge, /session_refresh_failed_transient/);
  assert.match(bridge, /client_initialization_failed/);
  assert.match(directory, /session_restoring/);
  assert.match(client, /Cloud access could not be restored/);
  assert.match(client, /Restoring cloud access/);
});

test("diagnostic reports client acquisition lifecycle fields", () => {
  const script = read("scripts/live-validation/diagnose-desktop-cloud-access-cache.mjs");
  const probe = read("scripts/live-validation/lib/shared-local-api-origin.mjs");
  assert.match(script, /sessionServiceInstanceIdHash/);
  assert.match(script, /authenticatedClientCreationAttempted/);
  assert.match(script, /firstCloudAccessFailureStage/);
  assert.match(probe, /forceRefresh=1/);
});

test("local data service merges bridge diagnostics after directory requests", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /mergeBridgeDiagnostics/);
  assert.match(service, /getDirectory\(\{ forceRefresh/);
  assert.match(service, /cloud_config_missing/);
});

test("publishing manager remains independent from access directory client acquisition", () => {
  const main = read("desktop/src/main.ts");
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.doesNotMatch(manager, /getCloudAccessDirectory/);
  assert.match(manager, /acquireAuthenticatedClient/);
  assert.match(main, /publishingManager\?\.ensureStarted/);
});
