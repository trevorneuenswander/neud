import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/services");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function importDist(moduleName) {
  return import(pathToFileURL(path.join(distRoot, `${moduleName}.js`)).href);
}

const BAG_ORIGIN = "https://bagauction-jumbotron.auctionaccelerate.com";

test("export service routes through worker bridge instead of dedicated runner", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const bridge = readSrc("desktop/src/services/worker-auction-export-bridge.ts");

  assert.match(exportService, /exportCurrentAuction\(/);
  assert.match(exportService, /attachEngineManager/);
  assert.match(bridge, /buildWorkerExportTasks/);
  assert.doesNotMatch(exportService, /runBroadArrowOfflineExport\(/);
  assert.doesNotMatch(exportService, /discoverLotPhotoUrls/);
  assert.doesNotMatch(exportService, /waitForAuctionSessionReady/);
  assert.doesNotMatch(exportService, /waiting-for-session/);
});

test("export loads latest scraper snapshot and requires running worker", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.match(exportService, /getLatestScraperSnapshot/);
  assert.match(
    exportService,
    /WORKER_EXPORT_ERRORS\.NO_SNAPSHOT/,
  );
  assert.match(exportService, /canExportCurrentWebpage\(/);
  assert.match(exportService, /hasValidScraperSnapshot/);
  assert.match(exportService, /isEngineRunning/);
});

test("worker export uses temporary page in shared browser", () => {
  const legacy = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(legacy, /tempPage = await browser\.newPage\(\)/);
  assert.match(legacy, /await tempPage\.close\(\)/);
  assert.match(legacy, /downloadLotPhotos\(\s*tempPage/);
});

test("export JSON merge includes relative local photo paths and diagnostics", () => {
  const bridge = readSrc("desktop/src/services/worker-auction-export-bridge.ts");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.match(bridge, /localPath: photo\.relativePath/);
  assert.match(bridge, /remoteUrl:/);
  assert.match(bridge, /exportDiagnostics:/);
  assert.match(bridge, /comprehensiveDiagnostics:/);
  assert.match(exportService, /auction-data\.json/);
});

test("authentication reuses shared performBagLogin helper with secure credentials", () => {
  const auth = readSrc("desktop/src/services/broad-arrow-export-auth.ts");
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");

  assert.match(auth, /performBagLogin/);
  assert.match(auth, /bag-login-flow\.js/);
  assert.match(auth, /getProjectWebpageScraperCredentials/);
  assert.match(auth, /BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE/);
  assert.match(auth, /NEUD could not sign in to the auction website/);
  assert.match(auth, /\/users\/sign_in/);
  assert.match(runner, /authenticateBroadArrowExportBrowser/);
  assert.doesNotMatch(auth, /console\.log\(.*password/i);
});

test("Edit URLs are derived and validated per lot", async () => {
  const { resolveLotEditUrlFromLot } = await importDist("bag-edit-url-resolution");

  const resolved = resolveLotEditUrlFromLot(
    { lotNumber: "101", editHref: "/vehicles/6041/edit" },
    BAG_ORIGIN,
  );
  assert.equal(resolved.editUrl, `${BAG_ORIGIN}/vehicles/6041/edit`);
  assert.equal(resolved.vehicleId, "6041");

  const normalized = resolveLotEditUrlFromLot(
    { lotNumber: "102", detailUrl: "/vehicles/6042" },
    BAG_ORIGIN,
  );
  assert.equal(normalized.editUrl, `${BAG_ORIGIN}/vehicles/6042/edit`);

  const blocked = resolveLotEditUrlFromLot(
    { lotNumber: "103", editHref: "/vehicles/6043/edit" },
    "http://127.0.0.1:3000",
  );
  assert.equal(blocked.editUrl, null);
});

test("reserve status derivation preserves raw edit-page fields", async () => {
  const { deriveBroadArrowReserveStatusLabel, readReserveDetailsFromDetail } =
    await importDist("broad-arrow-export-reserve");

  assert.equal(
    deriveBroadArrowReserveStatusLabel({
      noReserve: true,
      reservesOff: false,
      reservePrice: 0,
    }),
    "No Reserve",
  );
  assert.equal(
    deriveBroadArrowReserveStatusLabel({
      noReserve: false,
      reservesOff: true,
      reservePrice: 1000,
    }),
    "Reserve Off",
  );
  assert.equal(
    deriveBroadArrowReserveStatusLabel({
      noReserve: false,
      reservesOff: false,
      reservePrice: 5000,
    }),
    "Reserve",
  );

  const details = readReserveDetailsFromDetail({
    noReserve: true,
    reservesOff: false,
    reservePriceRaw: "0.0",
    reservePrice: 0,
  });
  assert.equal(details.noReserve, true);
  assert.equal(details.reservePriceRaw, "0.0");
});

test("photo URLs use #photos-list img via lot detail adapter", () => {
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
  assert.match(detailPage, /#photos-list img/);
  assert.match(detailPage, /data-src/);
  assert.match(detailPage, /data-original/);
  assert.doesNotMatch(detailPage, /#images img/);
});

test("photo download writes raw bytes with content-type extension", async () => {
  const { downloadExportPhotoBytes, sanitizeLotPhotoFolder } =
    await importDist("broad-arrow-export-photo-download");

  assert.equal(sanitizeLotPhotoFolder("101"), "lot-101");

  const tempDir = path.join(process.cwd(), `.tmp-photo-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const destination = path.join(tempDir, "photos", "lot-101", "01");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => "image/png" },
    arrayBuffer: async () =>
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
  });

  try {
    const result = await downloadExportPhotoBytes({
      photoUrl: "https://cdn.example.com/no-extension",
      destinationPath: destination,
    });
    assert.ok(fs.existsSync(result.finalPath));
    assert.match(result.finalPath, /\.png$/);
    assert.ok(result.sizeBytes > 0);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runner awaits photo downloads sequentially", () => {
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  assert.match(runner, /for \(let photoIndex = 0; photoIndex < photoUrls\.length; photoIndex \+= 1\)/);
  assert.match(runner, /await downloadExportPhotoBytes/);
  assert.doesNotMatch(runner, /forEach\(async/);
});

test("partial package folder is removed on failure and renamed on success", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const paths = readSrc("desktop/src/services/auction-data-paths.ts");
  assert.match(paths, /PARTIAL_DOWNLOAD_SUFFIX/);
  assert.match(paths, /finalizeDownloadPackage/);
  assert.match(exportService, /finalizeDownloadPackage\(packageDir\)/);
  assert.match(exportService, /fs\.rmSync\(packageDir/);
});

test("export JSON includes relative local photo paths via worker bridge", () => {
  const bridge = readSrc("desktop/src/services/worker-auction-export-bridge.ts");
  assert.match(bridge, /localPath: photo\.relativePath/);
  assert.match(bridge, /remoteUrl:/);
  assert.match(bridge, /exportDiagnostics:/);
  assert.match(bridge, /comprehensiveDiagnostics:/);
});

test("progress phases map from snapshot load through package completion", async () => {
  const { createAuctionExportProgress } = await importDist("auction-export-progress");
  const preparing = createAuctionExportProgress("id", {
    phase: "preparing",
    message: "Preparing export…",
    completed: 0,
    total: 10,
  });
  const loading = createAuctionExportProgress("id", {
    phase: "loading-scraper-data",
    message: "Loaded lots",
    completed: 0,
    total: 10,
  });
  const signingIn = createAuctionExportProgress("id", {
    phase: "signing-in",
    message: "Signing in",
    completed: 0,
    total: 10,
  });
  const processing = createAuctionExportProgress("id", {
    phase: "processing-lots",
    message: "Processing lot 1 of 10",
    completed: 1,
    total: 10,
  });
  const writing = createAuctionExportProgress("id", {
    phase: "writing-package",
    message: "Writing package…",
    completed: 10,
    total: 10,
  });
  const complete = createAuctionExportProgress("id", {
    phase: "complete",
    message: "Complete",
    completed: 10,
    total: 10,
  });

  assert.ok(preparing.percent <= 3);
  assert.ok(loading.percent >= 3 && loading.percent <= 8);
  assert.ok(signingIn.percent >= 8 && signingIn.percent <= 15);
  assert.ok(processing.percent >= 15 && processing.percent <= 95);
  assert.ok(writing.percent >= 95);
  assert.equal(complete.percent, 100);
});

test("local controller prefers downloaded local photos", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const thumbnails = readSrc("src/components/bag-graphics/LotPhotoThumbnails.tsx");
  assert.match(exportService, /buildAssetUrl\(packageId, relativePath\)/);
  assert.match(exportService, /displayUrl/);
  assert.match(thumbnails, /displayUrl|photoUrls|photos/);
});

test("broken worker export discovery module was removed", () => {
  assert.equal(
    fs.existsSync(path.join(repoRoot, "desktop/src/services/bag-export-photo-discovery.ts")),
    false,
  );
});
