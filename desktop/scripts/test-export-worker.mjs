import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("offline export uses running worker queue instead of dedicated desktop runner", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const bridge = readSrc("desktop/src/services/worker-auction-export-bridge.ts");
  const runtime = readSrc("workers/data-engine/src/engine-runtime.js");
  const legacy = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");

  assert.match(exportService, /exportCurrentAuction/);
  assert.match(exportService, /attachEngineManager/);
  assert.match(bridge, /buildWorkerExportTasks/);
  assert.match(bridge, /mergeWorkerExportIntoExportPayload/);
  assert.doesNotMatch(exportService, /runBroadArrowOfflineExport/);
  assert.doesNotMatch(exportService, /BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE/);
  assert.match(engineManager, /queueExportCurrentAuction/);
  assert.match(legacy, /exportLotDetails/);
  assert.match(legacy, /tempPage = await browser\.newPage\(\)/);
  assert.match(runtime, /processPendingExportCommand/);
});

test("offline export availability depends on scraper snapshot and running worker", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.match(exportService, /hasValidScraperSnapshot/);
  assert.match(exportService, /canExportCurrentWebpage\(projectId: string\)/);
  assert.match(exportService, /isEngineRunning\(engineId\)/);
  assert.match(exportService, /WORKER_EXPORT_ERRORS\.SCRAPER_STOPPED/);
});
