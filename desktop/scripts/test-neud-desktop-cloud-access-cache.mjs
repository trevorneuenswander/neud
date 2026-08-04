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

test("cloud access cache migration is registered in desktop migrate.ts", () => {
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(migrate, /035_cloud_access_cache\.sql/);
});

test("local data service attempts live directory before cache fallback", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /getDirectory\(\{ forceRefresh/);
  assert.match(service, /if \(!hasCloudSession\)/);
  assert.match(service, /cache_write_failed/);
  assert.doesNotMatch(service, /Unable to load cloud access.*offline/s);
});

test("cloud access bridge classifies RPC failures without offline label", () => {
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  const helpers = read("desktop/src/services/cloud-access-directory.ts");
  assert.match(bridge, /classifyCloudAccessDirectoryFailure/);
  assert.match(helpers, /directory_permission_denied/);
  assert.match(helpers, /directory_rpc_missing/);
});

test("empty cache is not classified as offline in desktop users client", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  assert.match(client, /case "cache_empty":[\s\S]*return null/);
  assert.match(client, /showOfflineReadOnlyBanner[\s\S]*fallbackReason === "offline"/);
  assert.doesNotMatch(client, /showOfflineReadOnlyBanner[\s\S]*cache_empty/);
  assert.match(client, /hasCloudSession/);
  assert.match(client, /Retry/);
});

test("distinct UI messages exist for offline, session, failure, and cache write", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  const tabs = read("src/components/access-management/AccessManagementTabs.tsx");
  assert.match(client, /Sign in to load and manage cloud access/);
  assert.match(client, /Cached access data is shown read-only/);
  assert.match(client, /Access management service could not be reached/);
  assert.match(client, /Cloud access service could not be initialized/);
  assert.match(client, /offline cache could not be updated/);
  assert.match(client, /Cloud access could not be restored/);
  assert.match(client, /Restoring cloud access/);
  assert.match(client, /showOfflineConnectionMessage=\{fallbackReason === "offline"\}/);
  assert.match(tabs, /showOfflineConnectionMessage/);
});

test("access management uses unified local API origin on port 8070", () => {
  const env = read("src/lib/env/neud-env.ts");
  const origin = read("src/lib/local/normalize-local-api-origin.ts");
  const diagnosticLib = read("scripts/live-validation/lib/shared-local-api-origin.mjs");
  const diagnosticScript = read("scripts/live-validation/diagnose-desktop-cloud-access-cache.mjs");
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(env, /DEFAULT_LOCAL_API_ORIGIN/);
  assert.match(origin, /8070/);
  assert.match(diagnosticLib, /parseAppSettingValue/);
  assert.match(diagnosticScript, /shared-local-api-origin.mjs/);
  assert.match(server, /DEFAULT_PORT = 8070/);
  assert.doesNotMatch(diagnosticScript, /4310/);
});

test("local API health and directory routes are registered", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /directoryRouteRegistered: true/);
  assert.match(server, /\/api\/access\/cloud\/directory\/diagnostics/);
  assert.match(server, /isCloudAccessBridgeAvailable/);
  assert.match(server, /cloud_access_bridge_not_initialized/);
});

test("CloudAccessBridge is required before directory RPC", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /cloud_access_bridge_not_initialized/);
  assert.match(service, /isCloudAccessBridgeAvailable/);
  assert.match(service, /setCloudAccessBridge/);
});

test("diagnostic probes health, diagnostics, and directory routes", () => {
  const script = read("scripts/live-validation/diagnose-desktop-cloud-access-cache.mjs");
  const probe = read("scripts/live-validation/lib/shared-local-api-origin.mjs");
  assert.match(script, /localApiReachable/);
  assert.match(script, /resolvedLocalApiOrigin/);
  assert.match(script, /directoryRouteRegistered/);
  assert.match(probe, /\/api\/health/);
  assert.match(probe, /connection_refused/);
  assert.match(probe, /route_not_found/);
});

test("desktop renderer resolves local API config through preload IPC", () => {
  const preload = read("desktop/src/preload.ts");
  const origin = read("src/lib/local/local-api-origin.ts");
  const ipc = read("desktop/src/ipc/local-data.ts");
  assert.match(preload, /getApiConfig/);
  assert.match(origin, /getApiConfig/);
  assert.match(ipc, /neud:local:getApiConfig/);
});

test("packaged Next server receives local API URL from desktop main", () => {
  const nextServer = read("desktop/src/services/next-server.ts");
  const main = read("desktop/src/main.ts");
  assert.match(nextServer, /NEXT_PUBLIC_NEUD_LOCAL_API_URL/);
  assert.match(main, /localApiUrl: canonicalLocalApiOrigin/);
  assert.match(main, /LOCAL_API_URL_SETTING_KEY/);
});

test("local API returns structured directory payload on HTTP 200", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /\/api\/access\/cloud\/directory\/diagnostics/);
  assert.match(server, /return sendJson\(response, 200, result\)/);
});

test("successful live directory persists cache in background", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /replaceDirectory/);
  assert.match(service, /warning:/);
  assert.match(service, /actualFallbackReason = "none"/);
});

test("directory parser accepts RPC payload shape", () => {
  const helpers = read("desktop/src/services/cloud-access-directory.ts");
  assert.match(helpers, /teamMemberships/);
  assert.match(helpers, /parseCloudAccessDirectoryResponse/);
});

test("diagnostic reports actualFallbackReason and entity counts", () => {
  const script = read("scripts/live-validation/diagnose-desktop-cloud-access-cache.mjs");
  assert.match(script, /actualFallbackReason/);
  assert.match(script, /cloudDirectoryEntityCounts/);
  assert.match(script, /authenticatedCloudSessionAvailable/);
});

test("publishing manager path is separate from access directory load", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /publishingManager\?\.ensureStarted/);
  assert.doesNotMatch(main, /publishingManager[\s\S]{0,200}getCloudAccessDirectory/);
});

test("duplicate offline banners are not rendered for service failures", () => {
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  const tabs = read("src/components/access-management/AccessManagementTabs.tsx");
  const offlineBannerMatches = client.match(/requires an internet connection/g) ?? [];
  const tabsOfflineMatches = tabs.match(/requires an internet connection/g) ?? [];
  assert.ok(offlineBannerMatches.length <= 1);
  assert.ok(tabsOfflineMatches.length <= 1);
  assert.match(client, /showOfflineConnectionMessage=\{fallbackReason === "offline"\}/);
});

test("cloud access bridge records directory RPC safe diagnostics", () => {
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  const diagnostics = read("desktop/src/services/cloud-access-bridge-diagnostics.ts");
  const rpc = read("desktop/src/services/cloud-access-directory-rpc.ts");
  assert.match(bridge, /buildDirectoryRpcDiagnosticsFromError/);
  assert.match(diagnostics, /DirectoryRpcDiagnostics/);
  assert.match(rpc, /directoryRpcPostgrestCode/);
});

test("diagnose access directory RPC script is registered", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:access-directory-rpc/);
});
