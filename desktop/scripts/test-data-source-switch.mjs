import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("display data source uses dedicated IPC channel", () => {
  const ipc = readSrc("desktop/src/ipc/display-data-source.ts");
  const preload = readSrc("desktop/src/preload.ts");
  assert.match(ipc, /neud:displayDataSource:get/);
  assert.match(ipc, /neud:displayDataSource:set/);
  assert.match(ipc, /neud:displayDataSource:subscribe/);
  assert.match(preload, /displayDataSource:/);
  assert.match(preload, /neud:displayDataSource:changed/);
  assert.doesNotMatch(preload, /neud:activity:setDisplayDataSource/);
});

test("display data source switch pushes changed event without activity round trip", () => {
  const service = readSrc("desktop/src/services/local-data-service.ts");
  const client = readSrc("src/lib/desktop/display-data-source-client.ts");
  assert.match(service, /pushDisplayDataSourceChanged/);
  assert.match(service, /neud:displayDataSource:changed/);
  assert.match(service, /setImmediate\(\(\) => \{\s*this\.recordActivity/);
  assert.match(client, /onChanged/);
  assert.doesNotMatch(client, /data-source\.changed/);
  assert.doesNotMatch(client, /onEntry/);
});

test("project data source selector updates optimistically", () => {
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");
  assert.match(selector, /setSource\(nextSource\)/);
  assert.doesNotMatch(selector, /setSaving/);
  assert.doesNotMatch(selector, /disabled=\{saving\}/);
});

test("source switching does not restart scraper or await activity sync", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const activitySession = readSrc("src/lib/desktop/activity-session-client.ts");
  const syncService = readSrc("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.doesNotMatch(localData, /stopAll/);
  assert.doesNotMatch(localData, /updateDesiredState\(engineId, "stopped"\)/);
  assert.doesNotMatch(activitySession, /syncNow/);
  assert.match(syncService, /uploadDebounceTimer/);
});

test("legacy display data source values normalize once", () => {
  const desktop = readSrc("desktop/src/displays/display-data-source.ts");
  const shared = readSrc("src/lib/displays/display-data-source.ts");
  assert.match(desktop, /normalizeDisplayDataSource/);
  assert.match(desktop, /manual: "local-controller"/);
  assert.match(shared, /automatic: "webpage-scraper"/);
  assert.match(readSrc("desktop/src/services/local-data-service.ts"), /normalizeDisplayDataSource/);
});

test("no legacy HMG IPC fallback on display data source path", () => {
  const preload = readSrc("desktop/src/preload.ts");
  const ipc = readSrc("desktop/src/ipc/display-data-source.ts");
  const legacyIpcPrefix = ["hmg", ":"].join("");
  const legacyDesktopGlobal = ["hmg", "Desktop"].join("");
  assert.doesNotMatch(preload, new RegExp(legacyIpcPrefix));
  assert.doesNotMatch(ipc, new RegExp(legacyIpcPrefix));
  assert.doesNotMatch(preload, new RegExp(legacyDesktopGlobal));
});
