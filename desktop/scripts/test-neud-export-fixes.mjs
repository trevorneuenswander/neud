import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  advanceAuctionExportWorkProgress,
  createAuctionExportWorkProgress,
} from "../dist/services/auction-export-work-progress.js";
import {
  normalizeDownloadedLots,
  orderedLotsFromDataset,
} from "../dist/bag/live-state/bag-manual-lot-navigation.js";
import { dedupePhotoUrls } from "../../workers/data-engine/src/adapters/bag-photo-url-normalize.js";
import { resolveAuctionJsonPathInPackage } from "../dist/services/auction-data-paths.js";
import { resolveLotPreviewPhotos } from "../dist/services/lot-thumbnail-service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("refresh keeps readable text with compact button box", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /!h-5 !w-auto !min-w-0 shrink-0 whitespace-nowrap !px-1\.5 !py-0\.5 text-xs leading-none/);
  assert.match(controller, /"Refresh Rates"/);
  assert.match(controller, /"Refreshing Rates…"/);
  assert.doesNotMatch(controller, /RefreshRatesIcon/);
});

test("manual-only currency refresh remains", () => {
  const ratesHook = readSrc("src/lib/desktop/use-currency-rates.ts");
  assert.match(ratesHook, /refreshRatesManually/);
  assert.doesNotMatch(ratesHook, /setInterval/);
});

test("cancel aligns with progress bar row", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /flex items-center gap-3[\s\S]*self-center/);
  assert.match(controller, /cancelCurrentWebpageDownload\(activeExportOperation\.operationId\)/);
});

test("percentage appears left of detail text with stable width", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /w-10 shrink-0 tabular-nums/);
  assert.match(controller, /min-w-0 flex-1 truncate/);
  assert.doesNotMatch(controller, /justify-between gap-2 text-xs[\s\S]*%\}<\/span>/);
});

test("load opens broad arrow package folder picker via ipc", () => {
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  const client = readSrc("src/lib/desktop/offline-auction-client.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(ipc, /properties: \["openDirectory"\]/);
  assert.match(ipc, /getProjectAuctionDataDirectory/);
  assert.match(client, /loadOfflineAuction/);
  assert.match(controller, /loadOfflineAuction\(projectId\)/);
  assert.doesNotMatch(controller, /openOfflineDownloadRoot\(projectId\)/);
});

test("stop during export opens warning and cancels first", () => {
  const controls = readSrc("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.match(controls, /getWebpageExportOperation\(projectId\)/);
  assert.match(controls, /Keep Running/);
  assert.match(controls, /Stop Scraper/);
  assert.match(controls, /Restart Scraper/);
  assert.match(controls, /cancelCurrentWebpageDownload\(operationId\)/);
  assert.match(controls, /waitForExportCancellation/);
});

test("metadata discovery progresses from 10 toward 35", () => {
  let state = createAuctionExportWorkProgress(10);
  state = advanceAuctionExportWorkProgress(state, { phase: "metadata", completedMetadataLots: 0, totalLots: 10 });
  assert.equal(state.displayedPercent, 10);
  state = advanceAuctionExportWorkProgress(state, { phase: "metadata", completedMetadataLots: 5, totalLots: 10 });
  assert.equal(state.displayedPercent, 22);
  state = advanceAuctionExportWorkProgress(state, { phase: "metadata", completedMetadataLots: 10, totalLots: 10 });
  assert.equal(state.displayedPercent, 35);
});

test("photo downloading occupies 35-95 and advances per photo", () => {
  let state = createAuctionExportWorkProgress(2);
  state = advanceAuctionExportWorkProgress(state, { phase: "photos", totalPhotos: 10, completedPhotos: 0 });
  assert.equal(state.displayedPercent, 35);
  state = advanceAuctionExportWorkProgress(state, { phase: "photos", totalPhotos: 10, completedPhotos: 5 });
  assert.equal(state.displayedPercent, 65);
  state = advanceAuctionExportWorkProgress(state, { phase: "photos", totalPhotos: 10, completedPhotos: 10 });
  assert.equal(state.displayedPercent, 95);
});

test("progress moves beyond 17 during photo phase and stays monotonic", () => {
  let state = createAuctionExportWorkProgress(20);
  let previous = -1;
  const steps = [
    { phase: "preparing" },
    { phase: "loading-scraper-data" },
    { phase: "connecting-worker" },
    { phase: "metadata", completedMetadataLots: 20, totalLots: 20 },
    { phase: "photos", totalPhotos: 100, completedPhotos: 1 },
    { phase: "photos", totalPhotos: 100, completedPhotos: 50 },
    { phase: "photos", totalPhotos: 100, completedPhotos: 100 },
    { phase: "writing-package" },
    { terminal: "complete" },
  ];
  for (const step of steps) {
    state = advanceAuctionExportWorkProgress(state, step);
    assert.ok(state.displayedPercent >= previous);
    previous = state.displayedPercent;
  }
  assert.ok(previous > 17);
  assert.equal(state.displayedPercent, 100);
});

test("worker emits two-pass metadata and photo progress", () => {
  const runtime = readSrc("workers/data-engine/src/engine-runtime.js");
  const legacy = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(runtime, /progressPhase: "metadata"/);
  assert.match(runtime, /onMetadataComplete/);
  assert.match(runtime, /progressPhase: "photos"/);
  assert.match(legacy, /onMetadataComplete/);
  assert.match(legacy, /dedupePhotoUrls/);
  assert.match(legacy, /completedPhotos/);
});

test("timestamped json filename matches package folder token", () => {
  const paths = readSrc("desktop/src/services/auction-data-paths.ts");
  assert.match(paths, /jsonPath: path\.join\(packageDir, `\$\{folderBase\}\.json`\)/);
});

test("loader resolves manifest, timestamped, and legacy json", () => {
  const root = fs.mkdtempSync(path.join(repoRoot, "desktop", ".tmp-json-resolve-"));
  try {
    const manifestDir = path.join(root, "manifest-package");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, "manifest.json"),
      JSON.stringify({ jsonFileName: "Broad-Arrow-Auctions-2026-07-20_14-30-45.json" }),
    );
    fs.writeFileSync(
      path.join(manifestDir, "Broad-Arrow-Auctions-2026-07-20_14-30-45.json"),
      "{}",
    );
    assert.equal(
      path.basename(resolveAuctionJsonPathInPackage(manifestDir) ?? ""),
      "Broad-Arrow-Auctions-2026-07-20_14-30-45.json",
    );

    const legacyDir = path.join(root, "legacy-package");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "auction-data.json"), "{}");
    assert.equal(path.basename(resolveAuctionJsonPathInPackage(legacyDir) ?? ""), "auction-data.json");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("export and preview dedupe duplicate photo urls", () => {
  const url = "https://cdn.example.com/a.jpg";
  const duped = dedupePhotoUrls([url, ` ${url} `, `${url}#fragment`]);
  assert.equal(duped.length, 1);

  const preview = resolveLotPreviewPhotos({
    lotNumber: "132",
    photos: [url, ` ${url} `],
  });
  assert.equal(preview.length, 1);
});

test("downloaded lots drive canonical navigation array", () => {
  const dataset = {
    lots: [
      { lotNumber: "20", title: "Lot 20" },
      { lotNumber: "100", title: "Lot 100" },
      { lotNumber: "101A", title: "Lot 101A" },
    ],
  };
  const lots = normalizeDownloadedLots(dataset);
  assert.deepEqual(lots.map((lot) => lot.lotNumber), ["20", "100", "101A"]);
  const ordered = orderedLotsFromDataset([], dataset, true);
  assert.equal(ordered.length, 3);
  assert.equal(ordered[0]?.lotNumber, "20");
});

test("downloaded lots drive client navigation hook", () => {
  const hook = readSrc("src/components/bag-graphics/useDownloadedLotNavigation.ts");
  const navigation = readSrc("src/lib/bag/downloaded-lot-navigation.ts");
  assert.match(hook, /selectedDownloadedLotIndex/);
  assert.match(hook, /handlePreviousLot/);
  assert.match(hook, /handleNextLot/);
  assert.match(hook, /loadedLots\[selectedDownloadedLotIndex\]/);
  assert.match(hook, /previewLotNumber/);
  assert.match(navigation, /buildManualDraftFromDownloadedLot/);
  assert.match(navigation, /resolveDownloadedLotReserveStatus/);
});

test("local controller blocks envelope sync during downloaded navigation", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /lotEditingSourceRef\.current !== "manual-entry"/);
  assert.match(controller, /selectDownloadedLotByIndex/);
  assert.match(controller, /isSubmittingLot/);
  assert.match(controller, /handlePreviousLot/);
  assert.match(controller, /handleNextLot/);
  assert.doesNotMatch(controller, /localSelectBagPreviousLot/);
  assert.doesNotMatch(controller, /localSelectBagNextLot/);
});

test("download complete auto-dismisses presentation after five seconds", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const exportClient = readSrc("src/lib/desktop/webpage-export-client.ts");
  assert.match(controller, /scheduleExportDismiss/);
  assert.match(controller, /dismissCurrentWebpageExportOperation/);
  assert.match(exportService, /dismissAfter = new Date\(Date\.now\(\) \+ 5000\)/);
  assert.match(exportService, /dismissCurrentWebpageExportOperation/);
  assert.match(exportClient, /dismissAfter/);
  assert.match(controller, /isActiveWebpageExportStatus/);
  assert.doesNotMatch(controller, /showCompletionStatus/);
});

test("stale session timeout guards remain in export wait loop", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(localData, /EXPORT_STARTUP_TIMEOUT_MS/);
  assert.match(localData, /EXPORT_INACTIVITY_TIMEOUT_MS/);
  assert.doesNotMatch(localData, /300_000/);
});

test("global top progress banner remains removed", () => {
  const shell = readSrc("src/components/portal/DesktopAppShell.tsx");
  assert.doesNotMatch(shell, /GlobalWebpageExportBanner/);
});
