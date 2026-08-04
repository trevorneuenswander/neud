import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distRoot = path.resolve(__dirname, "../dist/services");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function importDist(moduleName) {
  return import(pathToFileURL(path.join(distRoot, `${moduleName}.js`)).href);
}

function createTempDir(name) {
  const dir = path.join(process.cwd(), `.tmp-auction-${name}-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("warning text matches Downloading Current Webpage requirement", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.match(
    controller,
    /A successful Webpage Scraper snapshot is required before Downloading Current Webpage\./,
  );
  assert.match(
    exportService,
    /WORKER_EXPORT_ERRORS\.NO_SNAPSHOT/,
  );
  assert.doesNotMatch(controller, /exporting auction JSON/i);
});

test("refresh downloads button is absent from local controller", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(controller, /Refresh Downloads/);
  assert.doesNotMatch(controller, /handleRefreshDownloads/);
  assert.doesNotMatch(controller, /refreshOfflineDownloads/);
});

test("clear all downloads uses destructive styling and NEUD modal", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /variant="destructive"/);
  assert.match(controller, /ConfirmDialog/);
  assert.match(controller, /Clear All Downloads\?/);
  assert.doesNotMatch(controller, /window\.confirm/);
});

test("photo download worker uses puppeteer page.goto and nested lot folders", () => {
  const worker = readSrc("workers/data-engine/src/adapters/bag-photo-download.js");
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(worker, /page\.goto\(url/);
  assert.match(worker, /photos", lotFolder/);
  assert.match(runtime, /downloadLotPhotos\(\s*tempPage/);
});

test("export stores reserve status through worker bridge merge", () => {
  const bridge = readSrc("desktop/src/services/worker-auction-export-bridge.ts");
  const types = readSrc("desktop/src/services/offline-auction-types.ts");
  assert.match(bridge, /lot\.editPage/);
  assert.match(bridge, /reserveDetails/);
  assert.match(types, /editPage\?:/);
});

test("manual upload uses local api display url and skips duplicate override append", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const importModule = readSrc("desktop/src/services/lot-manual-photo-import.ts");
  assert.match(localData, /buildAssetUrl\(packageId, relativePath\)/);
  assert.doesNotMatch(localData, /addDraftLotPhotos/);
  assert.match(importModule, /buildDisplayUrl/);
});

test("thumbnail normalization dedupes canonical photo identity", () => {
  const thumbnails = readSrc("desktop/src/services/lot-thumbnail-service.ts");
  const overrides = readSrc("desktop/src/bag/live-state/lot-photo-overrides.ts");
  assert.match(thumbnails, /photoCanonicalKey/);
  assert.match(thumbnails, /resolveLotPreviewPhotos/);
  assert.match(thumbnails, /Array\.isArray\(lot\.photos\)/);
  assert.match(overrides, /photoUrlKey/);
});

test("downloaded PNG converts to valid JPEG", async () => {
  const { convertImageBufferToJpeg, validateJpegBuffer } = await importDist("image-jpeg-conversion");
  const pngBuffer = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const converted = await convertImageBufferToJpeg(pngBuffer, "image/png");
  assert.equal(converted.mimeType, "image/jpeg");
  assert.ok(await validateJpegBuffer(converted.buffer));
});

test("download size formatting handles bytes, KB, MB, and GB", async () => {
  const { formatDownloadSize } = await importDist("auction-download-size");
  assert.equal(formatDownloadSize(824), "824 B");
  assert.match(formatDownloadSize(824 * 1024), /KB$/);
  assert.match(formatDownloadSize(12.4 * 1024 * 1024), /MB$/);
  assert.match(formatDownloadSize(1.08 * 1024 * 1024 * 1024), /GB$/);
});

test("button component includes destructive variant", () => {
  const button = readSrc("src/components/ui/Button.tsx");
  assert.match(button, /destructive:/);
  assert.match(button, /bg-danger text-white/);
});

test("clear downloads resets dataset source to none and local controller lots", () => {
  const dataset = readSrc("desktop/src/services/auction-dataset-service.ts");
  const controller = readSrc("desktop/src/bag/live-state/bag-local-controller-service.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(dataset, /source: "none"/);
  assert.match(dataset, /clearDownloadReference/);
  assert.match(controller, /clearDownloadedDatasetState/);
  assert.match(controller, /hasFileDataset/);
  assert.match(localData, /clearDownloadedDatasetState/);
});

test("manual lot navigation requires a local file dataset", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const hook = readSrc("src/components/bag-graphics/useDownloadedLotNavigation.ts");
  assert.match(controller, /useDownloadedLotNavigation/);
  assert.match(hook, /isDownloadedDatasetSource/);
  assert.match(hook, /getActiveDownloadedLots/);
  assert.doesNotMatch(
    controller,
    /No local downloads available\. Download the Current Webpage or enter local lot data to begin\./,
  );
});

test("current download notifications render inside card below actions", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /currentDownloadNotice/);
  assert.doesNotMatch(controller, /min-h-16/);
  assert.doesNotMatch(controller, /exportNotice/);
  assert.doesNotMatch(controller, /activeExportOperationRef/);
});

test("authenticated app shell locks body scroll below title bar", () => {
  const globals = readSrc("src/app/globals.css");
  const shell = readSrc("src/components/portal/DesktopAppShell.tsx");
  assert.match(globals, /overflow: hidden/);
  assert.match(shell, /h-dvh/);
  assert.match(shell, /app-body/);
});

test("photo export preserves raw downloaded files without sharp normalization", () => {
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  const photoDownload = readSrc("desktop/src/services/broad-arrow-export-photo-download.ts");
  const storage = readSrc("desktop/src/services/auction-photo-storage.ts");
  assert.match(runner, /downloadExportPhotoBytes/);
  assert.doesNotMatch(runner, /sharp/);
  assert.doesNotMatch(photoDownload, /sharp/);
  assert.match(photoDownload, /fs\.writeFileSync\(finalPath, buffer\)/);
  assert.match(storage, /mapWorkerPhotoReferences/);
});

test("reserve status is enriched from each lot detail page", () => {
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
  assert.match(runner, /deriveBroadArrowReserveStatusLabel/);
  assert.match(runner, /lot\.editPage/);
  assert.match(detailPage, /reserveStatus/);
  assert.match(detailPage, /reservePriceRaw/);
});

test("default team uses Hildreth Media Group within NEUD", () => {
  const accessMigration = readSrc("desktop/src/services/access-data-migration.ts");
  const settingsMigration = readSrc("desktop/src/services/legacy-settings-migration.ts");
  assert.match(accessMigration, /Hildreth Media Group/);
  assert.match(settingsMigration, /Hildreth Media Group/);
});

test("exit while scraper runs uses NEUD-branded renderer modal", () => {
  const main = readSrc("desktop/src/main.ts");
  const host = readSrc("src/components/portal/NeudAppDialogHost.tsx");
  const preload = readSrc("desktop/src/preload.ts");
  assert.match(main, /neud:app:closeRequested/);
  assert.doesNotMatch(main, /dialog\.showMessageBox\(mainWindow, EXIT_CONFIRM_DIALOG\)/);
  assert.match(host, /Exit NEUD\?/);
  assert.match(host, /Keep NEUD Open/);
  assert.match(host, /Stop Scraper and Exit/);
  assert.match(preload, /onCloseRequested/);
  assert.match(preload, /respondCloseRequest/);
});

test("product UI does not use native browser dialogs", () => {
  const productRoots = [
    "src/components/bag-graphics",
    "src/components/projects",
    "src/components/data-engines",
    "src/components/developer-tools",
  ];
  for (const root of productRoots) {
    const files = fs
      .readdirSync(path.join(repoRoot, root), { recursive: true })
      .filter((entry) => typeof entry === "string" && entry.endsWith(".tsx"));
    for (const file of files) {
      const source = readSrc(path.join(root, file).replace(/\\/g, "/"));
      assert.doesNotMatch(source, /window\.alert\(/);
      assert.doesNotMatch(source, /window\.confirm\(/);
      assert.doesNotMatch(source, /window\.prompt\(/);
    }
  }
});

test("restored export reports photo discovery without newer summary machinery", () => {
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  assert.match(runner, /photoDiscovery:/);
  assert.doesNotMatch(runner, /partialPhotoFailure/);
  assert.doesNotMatch(runner, /buildPhotoAggregate/);
});

test("lot detail page waits for lazy-loaded gallery images", () => {
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
  assert.match(detailPage, /waitForSelector/);
  assert.match(detailPage, /#photos-list/);
  assert.match(detailPage, /#vehicle_no_reserve/);
  assert.doesNotMatch(detailPage, /scrollBy/);
  assert.doesNotMatch(detailPage, /#images img/);
});

test("live scraper polls auction table and display without comprehensive enrichment", () => {
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  const engineRuntime = readSrc("workers/data-engine/src/engine-runtime.js");
  assert.match(runtime, /fetchVehicleDetails/);
  assert.match(runtime, /d\?\.sold/);
  assert.match(runtime, /fetchLotDetailData/);
  assert.doesNotMatch(runtime, /needCheck/);
  assert.doesNotMatch(runtime, /WINDOW_BEHIND/);
  assert.doesNotMatch(runtime, /\/sold\/i/);
  assert.match(runtime, /pollTiming/);
  assert.match(engineRuntime, /processPendingExportCommand/);
  assert.match(engineRuntime, /void processPendingExportCommand\(\)/);
  assert.doesNotMatch(engineRuntime, /await processPendingExportCommand\(\)/);
  assert.doesNotMatch(engineRuntime, /startPendingExportIfIdle/);
});

test("last sold uses detail-page sold cache rather than table status parsing", () => {
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  const staging = fs.readFileSync(
    path.join(repoRoot, "desktop/staging/worker/dist/adapters/bag-auction-legacy-runtime.js"),
    "utf8",
  );
  assert.match(runtime, /detailsCache\.get\(u\)/);
  assert.match(runtime, /currentPrice\s*\?\s*`\$\s*\$\{Number\(d\.currentPrice\)/);
  assert.match(staging, /d\?\.sold/);
  assert.doesNotMatch(runtime, /\/sold\/i\.test\(lotRow\.status\)/);
});

test("restored export routes through running worker without credential gate", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const bridge = readSrc("desktop/src/services/worker-auction-export-bridge.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.match(exportService, /exportCurrentAuction/);
  assert.match(exportService, /attachEngineManager/);
  assert.match(bridge, /buildWorkerExportTasks/);
  assert.doesNotMatch(exportService, /runBroadArrowOfflineExport/);
  assert.doesNotMatch(exportService, /BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE/);
  assert.doesNotMatch(exportService, /waitForAuctionSessionReady/);
  assert.doesNotMatch(controller, /activeExportOperationRef/);
});

test("active photo downloader module is referenced from worker runtime", () => {
  const workerPhoto = readSrc("workers/data-engine/src/adapters/bag-photo-download.js");
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(workerPhoto, /PHOTO_DOWNLOADER_MODULE/);
  assert.match(workerPhoto, /page\.goto\(url/);
  assert.match(runtime, /PHOTO_DOWNLOADER_MODULE/);
  assert.match(runtime, /comprehensiveDiagnostics/);
});

test("open folder does not show success notification", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(controller, /Opened download folder/);
  assert.match(controller, /Unable to open download folder/);
});

test("application exit uses canonical engine stop and export cancellation", () => {
  const main = readSrc("desktop/src/main.ts");
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(main, /stopAllForApplicationExit/);
  assert.match(main, /cancelActiveExportsForShutdown/);
  assert.match(engineManager, /stopAllForApplicationExit/);
  assert.match(engineManager, /reason: "application-exit"/);
  assert.match(localData, /cancelPendingExportsForShutdown/);
});

test("worker shutdown races active scrape and export instead of waiting indefinitely", () => {
  const engineRuntime = readSrc("workers/data-engine/src/engine-runtime.js");
  assert.match(engineRuntime, /SHUTDOWN_SCRAPE_WAIT_MS/);
  assert.match(engineRuntime, /SHUTDOWN_EXPORT_WAIT_MS/);
  assert.match(engineRuntime, /Promise\.race\(\[\s*activeScrapePromise/);
  assert.match(engineRuntime, /exportAbortRequested/);
});
