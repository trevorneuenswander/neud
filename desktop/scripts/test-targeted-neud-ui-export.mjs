import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("data source pills use shared display data source rather than engine health", () => {
  const hook = readSrc("src/lib/displays/use-data-source-page-status.ts");
  const pill = readSrc("src/components/ui/DataSourceStatusPill.tsx");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const engineDetail = readSrc("src/components/data-engines/EngineDetailClient.tsx");

  assert.match(hook, /subscribeToDesktopDisplayDataSource/);
  assert.match(hook, /selectedSource === pageSource/);
  assert.match(pill, /useDataSourcePageStatus/);
  assert.match(controller, /DataSourceStatusPill pageSource="local-controller"/);
  assert.match(engineDetail, /DataSourceStatusPill pageSource="webpage-scraper"/);
  assert.doesNotMatch(engineDetail, /scraperConnectionStatus/);
  assert.doesNotMatch(engineDetail, /ConnectionStatusPill status=\{scraperConnectionStatus\}/);
});

test("webpage scraper header uses shared PageHeader spacing", () => {
  const engineDetail = readSrc("src/components/data-engines/EngineDetailClient.tsx");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const pageHeader = readSrc("src/components/portal/PageHeader.tsx");

  assert.match(engineDetail, /PageHeader/);
  assert.match(engineDetail, /space-y-6/);
  assert.match(controller, /PageHeader/);
  assert.match(controller, /space-y-6/);
  assert.match(pageHeader, /text-xl font-semibold/);
  assert.match(engineDetail, /title="Webpage Scraper"/);
  assert.match(engineDetail, /DataSourceStatusPill pageSource="webpage-scraper"/);
  assert.match(engineDetail, /description="The scraper runs locally/);
});

test("manual lot controls order previous, next, then submit", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const previousIndex = controller.indexOf("Previous Lot");
  const nextIndex = controller.indexOf("Next Lot");
  const submitIndex = controller.indexOf(">\n                    Submit\n                  </Button>");
  assert.ok(previousIndex > -1 && nextIndex > previousIndex);
  assert.ok(submitIndex > nextIndex);
  assert.match(controller, /h-10 min-w-0 flex-1/);
});

test("background export uses persistent main-process operation registry without global banner", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  const channels = readSrc("desktop/src/ipc/channels.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const client = readSrc("src/lib/desktop/webpage-export-client.ts");
  const shell = readSrc("src/components/portal/DesktopAppShell.tsx");

  assert.match(exportService, /startExportCurrentWebpage/);
  assert.match(exportService, /getCurrentWebpageExportOperation/);
  assert.match(exportService, /setProgressBroadcaster/);
  assert.match(ipc, /startExportCurrentWebpage/);
  assert.match(ipc, /broadcastToAllRenderers/);
  assert.match(channels, /broadcastToAllRenderers/);
  assert.match(client, /subscribeToWebpageExportOperations/);
  assert.match(client, /getWebpageExportOperation/);
  assert.match(controller, /startWebpageExport/);
  assert.match(controller, /subscribeToWebpageExportOperations/);
  assert.match(controller, /Download in Progress/);
  assert.match(controller, /cancelCurrentWebpageDownload/);
  assert.doesNotMatch(shell, /GlobalWebpageExportBanner/);
});
