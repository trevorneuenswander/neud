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

test("local display bridge SSE exposes revision sync on connect", () => {
  const routes = read("desktop/src/displays/display-bridge-routes.ts");
  assert.match(routes, /display-bridge/);
  assert.match(routes, /subpath === "events"/);
  assert.match(routes, /neud-display-bridge\.sync/);
  assert.match(routes, /contentHash/);
  assert.match(routes, /revision/);
});

test("desktop canonical changes publish display-bridge events with revision and hash", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /displayBridgeEvents\?\.publishDisplayDataChanged/);
  assert.match(service, /getProjectDisplayBridgeSyncState/);
  assert.match(service, /contentHash/);
});

test("display connection uses local SSE for independent browsers", () => {
  const runtime = read("public/displays/shared/display-connection.js");
  assert.match(runtime, /deriveDisplayBridgeEventsUrl/);
  assert.match(runtime, /display-bridge\/events/);
  assert.match(runtime, /EventSource/);
  assert.match(runtime, /neud-display-bridge\.sync/);
  assert.match(runtime, /lastAppliedRevision/);
});

test("neud display runtime reconciles via display-bridge SSE", () => {
  const runtime = read("public/neud-display-runtime.js");
  assert.match(runtime, /displayBridgeEventsUrl/);
  assert.match(runtime, /startDisplayBridgeEvents/);
  assert.match(runtime, /neud-display-bridge\.sync/);
  assert.match(runtime, /shouldSkipBridgeNotification/);
});

test("display config injects display-bridge events URL from project id", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /displayBridgeEventsUrl/);
  const doc = read("src/lib/developer-tools/display-document.ts");
  assert.match(doc, /displayBridgeEventsUrl/);
});

test("webpage scraper live feed panel hides active source row", () => {
  const panel = read("src/components/data-engines/webpage-scraper/BagLiveFeedPanel.tsx");
  assert.doesNotMatch(panel, /Active source/i);
  assert.match(panel, /ScraperIntervalSliderControl/);
  assert.match(panel, /pt-4/);
});

test("hosted fullscreen output hides diagnostics and management chrome", () => {
  const viewer = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(viewer, /!isFullscreenOutput/);
  assert.match(viewer, /showDebugPanel/);
  const hostedDoc = read("src/lib/developer-tools/display-document.ts");
  assert.match(hostedDoc, /__NEUD_DISPLAY_DATA_DISCONNECTED__/);
});

test("all surfaces share authoritative revision on local display payloads", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /revision: this\.displayDataRevision/);
  const hosted = read("src/lib/hosted/hosted-viewer-delivery.ts");
  assert.match(hosted, /shouldDeliverCanonicalPayload/);
  assert.match(hosted, /targetFingerprint/);
});

test("sync validation scenarios are covered in transport tests", () => {
  const connection = read("public/displays/shared/display-connection.js");
  assert.match(connection, /RECOVERY_POLL_MS = 60000/);
  assert.match(connection, /scheduleDataRefresh/);
  const runtime = read("public/neud-display-runtime.js");
  assert.match(runtime, /scheduleFetch\(false\)/);
  const viewer = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(viewer, /setInterval\(\(\) => \{\s*void loadBundle/);
});
