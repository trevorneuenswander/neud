#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE,
} from "../../scripts/live-validation/lib/directory-rpc-params.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("desktop bridge calls migration 044 directory RPC with p_include_fixtures false", () => {
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  const rpc = read("desktop/src/services/cloud-access-directory-rpc.ts");
  assert.match(bridge, /ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME/);
  assert.match(bridge, /ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS/);
  assert.match(rpc, /p_include_fixtures: false/);
  assert.match(rpc, /ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE/);
});

test("portal directory client uses migration 044 RPC params", () => {
  const client = read("src/lib/access-management/directory-client.ts");
  const rpc = read("src/lib/access-management/directory-rpc.ts");
  assert.match(client, /ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS/);
  assert.match(rpc, /p_include_fixtures: false/);
});

test("default p_include_fixtures false excludes validation fixtures in migration 044", () => {
  const migration = read("supabase/migrations/044_exclude_validation_fixtures_from_directory.sql");
  assert.match(migration, /p_include_fixtures boolean default false/);
  assert.match(migration, /p_include_fixtures or not public\.is_validation_fixture_project/);
});

test("desktop Users client retries with forceRefresh and refreshes on focus", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  assert.match(client, /forceRefresh: true/);
  assert.match(client, /visibilitychange/);
  assert.match(client, /DIRECTORY_POLL_INTERVAL_MS/);
  assert.match(client, /handleRetry/);
});

test("desktop access actions refresh live directory after mutations", () => {
  const actions = read("src/lib/access-management/desktop-actions.ts");
  assert.match(actions, /localGetCloudAccessDirectory\(\{ forceRefresh: true \}\)/);
});

test("successful live directory replaces sqlite cache transactionally", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /replaceDirectory/);
  assert.match(service, /cacheWriteSucceeded = true/);
});

test("directory RPC failure serves stale cache instead of clearing it", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  const helpers = read("desktop/src/services/cloud-access-directory.ts");
  assert.match(helpers, /shouldServeStaleCloudAccessCache/);
  assert.match(service, /shouldServeStaleCloudAccessCache/);
  assert.match(service, /stale: true/);
});

test("RPC failures use access-management load message not cloud-restore message", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  const rpc = read("desktop/src/services/cloud-access-directory-rpc.ts");
  assert.match(client, /Access management data could not be loaded\. Retry\./);
  assert.match(rpc, /Access management data could not be loaded\. Retry\./);
});

test("local API unreachable uses service could not be reached message", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  assert.match(client, /Access management service could not be reached\. Retry\./);
});

test("RPC schema probe recognizes migration 044 signature", () => {
  const probe = read("scripts/live-validation/lib/rpc-schema-probe.mjs");
  assert.match(probe, /expectedArgumentNames: \["p_include_fixtures"\]/);
  assert.equal(ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS.p_include_fixtures, false);
  assert.match(ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE, /p_include_fixtures boolean default false/);
});

test("publishing manager remains on shared authenticated cloud coordinator", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /AuthenticatedCloudCoordinator/);
  assert.doesNotMatch(manager, /get_access_management_directory/);
});

test("directory forceRefresh bypasses in-flight cache without forcing session refresh", () => {
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  assert.match(bridge, /directoryRequestInFlight && !options\?\.forceRefresh/);
  const internalMatch = bridge.match(
    /private async getDirectoryInternal[\s\S]*?const client = await this\.requireClient\([\s\S]*?\);/,
  );
  assert.ok(internalMatch, "getDirectoryInternal requireClient call should exist");
  assert.doesNotMatch(internalMatch[0], /forceRefresh:/);
});

test("directory diagnostics record migration 044 function signature", () => {
  const diagnose = read("scripts/live-validation/diagnose-access-directory-rpc.mjs");
  assert.match(diagnose, /ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS/);
  assert.match(diagnose, /migration044Applied/);
});
