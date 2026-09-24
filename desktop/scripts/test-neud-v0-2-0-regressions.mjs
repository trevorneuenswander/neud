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

test("stream ticker runtime prefers filtered broadArrowDisplay ticker next", () => {
  const normalize = read("shared/display-runtime/normalize-display-snapshot.ts");
  assert.match(normalize, /overlayStreamTickerFeedNext/);
  assert.match(normalize, /streamTickerFeed/);
});

test("session-facing engine errors clear stale require on stopped engines", () => {
  const helper = read("desktop/src/services/engine-session-facing-errors.ts");
  assert.match(helper, /resolveSessionFacingEngineLastError/);
  assert.match(helper, /require is not defined/i);
  const shapes = read("desktop/src/mappers/portal-shapes.ts");
  assert.match(shapes, /resolveSessionFacingEngineLastError/);
});

test("auth status bundle exposes shared cloud snapshot fields", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /profileIndicatorState/);
  assert.match(service, /authenticatedCloudSessionAvailable/);
  assert.match(service, /sharedAuthSnapshot/);
});

test("cloud directory serves cached data for local session without sign-in banner stage", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /localSessionValid[\s\S]*fallbackReason: \(sessionRestorePending/);
});

test("day filter notifies live display data without reload-only path", () => {
  const control = read("src/components/displays/StreamTickerDayFilterControl.tsx");
  assert.match(control, /notifyDisplayBridgeDataChanged/);
  assert.doesNotMatch(control, /requestDisplayViewerReload/);
  const service = read("desktop/src/services/local-data-service.ts");
  const setFilterBlock = service.match(
    /setStreamTickerDayFilter[\s\S]*?^\  \}/m,
  )?.[0];
  assert.ok(setFilterBlock);
  assert.doesNotMatch(setFilterBlock, /notifyProjectCanonicalMayHaveChanged/);
  const connection = read("public/displays/shared/display-connection.js");
  assert.match(connection, /neud-display-data-changed/);
});

test("footer connectivity uses auth-aware profile indicator", () => {
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  assert.match(hook, /profileIndicatorLabel/);
  assert.match(hook, /localGetAuthStatus/);
});

test("dashboard network status is independent of user directory sync", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /getNetworkReachable/);
  assert.match(service, /probeInternetReachability/);
  assert.doesNotMatch(
    service,
    /networkReachable:\s*userDirectorySync\.connectionOnline/,
  );
});

test("cloud dashboard connection derives from shared auth snapshot", () => {
  const desktopState = read("desktop/src/services/account-connection-state.ts");
  assert.match(desktopState, /authenticatedCloudSessionAvailable/);
  const portalState = read("src/lib/auth/account-connection-state.ts");
  assert.match(portalState, /authenticatedCloudSessionAvailable/);
});

test("stream ticker display endpoint uses dedicated feed builder", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(service, /getStreamTickerDisplayBridgeData/);
  assert.match(api, /displaySlug === "stream-ticker"/);
});
