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

test("display connection runtime is event-driven with recovery watchdog", () => {
  const runtime = read("public/displays/shared/display-connection.js");
  assert.match(runtime, /displayUpdateMode: "event-driven"/);
  assert.match(runtime, /RECOVERY_POLL_MS = 60000/);
  assert.match(runtime, /pendingDataRefresh/);
  assert.match(runtime, /scheduleDataRefresh/);
  assert.match(runtime, /diagnostics\.pollTimerActive = false/);
});

test("neud display runtime uses change events and coalescing", () => {
  const runtime = read("public/neud-display-runtime.js");
  assert.match(runtime, /displayUpdateMode: "event-driven"/);
  assert.match(runtime, /neud-display-data-changed/);
  assert.match(runtime, /pendingFetch/);
  assert.match(runtime, /RECOVERY_POLL_MS = 60000/);
  assert.doesNotMatch(runtime, /setInterval\(fetchLatest, pollIntervalMs\)/);
});

test("desktop relays canonical changes to display bridge", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /tryNotifyProjectDisplayDataChanged/);
  assert.match(service, /neud:displayData:changed/);
  assert.match(service, /displayBridgeEvents\?\.publishDisplayDataChanged/);
  const preload = read("desktop/src/preload.ts");
  assert.match(preload, /neud:displayData:changed/);
  assert.match(preload, /neud-display-data-changed/);
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /handleDisplayBridgeRoute/);
});

test("display cards no longer expose refresh rate controls", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const devCard = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const streamCard = read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx");
  assert.doesNotMatch(card, /DisplayRefreshRateSelect/);
  assert.doesNotMatch(devCard, /DisplayRefreshRateSelect/);
  assert.doesNotMatch(streamCard, /DisplayRefreshRateSelect/);
  assert.doesNotMatch(card, /setInterval\(\(\) => \{\s*void pollDataEndpoint/);
});

test("html display document paths omit default poll query", () => {
  const paths = read("src/lib/displays/display-view-mode.ts");
  assert.match(paths, /refreshRateMs\?: number/);
  assert.doesNotMatch(
    paths,
    /new URLSearchParams\(\{ poll: String\(input\.refreshRateMs\) \}\)/,
  );
});

test("developer display runtime template avoids steady-state poll interval", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /RECOVERY_POLL_MS = 60000/);
  assert.doesNotMatch(templates, /setInterval\(publishLatest, pollIntervalMs\)/);
});
