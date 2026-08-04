import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAuctionExportFileName,
  resolveUniqueAuctionExportPath,
} from "../dist/services/auction-data-paths.js";
import { AuctionDatasetService } from "../dist/services/auction-dataset-service.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { resolveLocalControllerDisplayData } from "../dist/displays/resolve-local-controller-display-data.js";
import { resolveEffectiveDisplayData } from "../dist/displays/resolve-effective-display-data.js";
import { mapLiveStateToPylonFeed } from "../dist/displays/pylon-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-${name}-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot,
  };
  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.backups, { recursive: true });
  return paths;
}

test("title bar places menus left and custom window controls right", () => {
  const titleBar = readSrc("src/components/portal/AppTitleBar.tsx");
  const appShell = readSrc("src/components/portal/AppShell.tsx");
  const appIpc = readSrc("desktop/src/ipc/app.ts");
  const preload = readSrc("desktop/src/preload.ts");

  assert.ok(!titleBar.includes("HMG Graphics Server"));
  assert.ok(titleBar.includes("getMenuLabels"));
  assert.ok(titleBar.includes("WebkitAppRegion"));
  assert.ok(titleBar.includes("no-drag"));
  assert.ok(titleBar.includes("windowControl"));
  assert.ok(titleBar.includes("Minimize"));
  assert.ok(appShell.includes("<AppTitleBar"));
  assert.ok(appIpc.includes("neud:app:popupMenu"));
  assert.ok(appIpc.includes("neud:app:windowControl"));
  assert.ok(preload.includes("neud:app:windowControl"));
});

test("project navigation uses spacing variables below fixed title bar", () => {
  const topMenu = readSrc("src/components/projects/ProjectTopMenuBar.tsx");
  const layoutFrame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
  const globals = readSrc("src/app/globals.css");

  assert.ok(topMenu.includes("--title-bar-height"));
  assert.ok(topMenu.includes("min-h-[52px]"));
  assert.ok(layoutFrame.includes("--navigation-bar-height"));
  assert.ok(layoutFrame.includes("--page-content-gap"));
  assert.ok(globals.includes("--title-bar-height"));
  assert.ok(globals.includes("--navigation-bar-height"));
  assert.ok(globals.includes("--page-content-gap"));
});

test("dedicated export runner resolves puppeteer and authenticates in desktop process", () => {
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  const auth = readSrc("desktop/src/services/broad-arrow-export-auth.ts");
  const resolver = readSrc("desktop/src/services/resolve-puppeteer-module.ts");
  const importHelper = readSrc("desktop/src/services/import-esm-module.ts");
  const adapterPath = readSrc("desktop/src/services/bag-detail-adapter-path.ts");

  assert.ok(importHelper.includes("new Function"));
  assert.ok(runner.includes("resolvePuppeteerModule"));
  assert.ok(runner.includes("authenticateBroadArrowExportBrowser"));
  assert.ok(auth.includes("performBagLogin"));
  assert.ok(resolver.includes("importPuppeteerFromDir"));
  assert.ok(runner.includes("resolveBagLotDetailAdapterPath"));
  assert.ok(adapterPath.includes("dist"));
  assert.ok(!runner.includes('workers", "data-engine", "src"'));
});

test("bag lot-detail adapter resolves to data-engine dist path in dev", () => {
  const adapterPath = path.join(
    repoRoot,
    "workers",
    "data-engine",
    "dist",
    "adapters",
    "bag-lot-detail-page.js",
  );
  const adapterResolver = readSrc("desktop/src/services/bag-detail-adapter-path.ts");
  assert.ok(fs.existsSync(adapterPath), `Expected adapter at ${adapterPath}`);
  assert.ok(adapterResolver.includes("dist"));
  assert.ok(adapterResolver.includes("bag-lot-detail-page.js"));
});

test("offline export auto-saves into auction-data without save dialog", () => {
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  const paths = readSrc("desktop/src/services/auction-data-paths.ts");

  assert.ok(!ipc.includes("showSaveDialog"));
  assert.ok(ipc.includes("getAuctionDataDirectory"));
  assert.ok(ipc.includes("resolveUniqueAuctionExportPath"));
  assert.ok(ipc.includes("offline.export.adapter-resolved"));
  assert.ok(paths.includes("auction-data"));
  assert.match(buildAuctionExportFileName(), /^broad-arrow-auction-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
});

test("auction export filenames are unique", () => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-auction-names-"));
  try {
    const first = resolveUniqueAuctionExportPath(dir);
    fs.writeFileSync(first, "{}", "utf8");
    const second = resolveUniqueAuctionExportPath(dir);
    assert.notEqual(first, second);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("dataset priority prefers loaded override over downloaded default", async () => {
  const paths = createTestPaths("dataset-priority");
  const db = await openLocalDatabase(paths);
  try {
    const settings = new AppSettingsRepository(db);
    const service = new AuctionDatasetService(settings);
    const projectId = "project-1";
    const downloaded = path.join(paths.root, "downloaded.json");
    const loaded = path.join(paths.root, "loaded.json");
    fs.writeFileSync(downloaded, "{}", "utf8");
    fs.writeFileSync(loaded, "{}", "utf8");

    service.setDownloaded(projectId, downloaded);
    service.setLoaded(projectId, loaded);
    const active = service.resolveActiveReference(projectId);
    assert.equal(active?.source, "loaded");
    assert.equal(active?.filePath, loaded);
    assert.equal(active?.manualOverride, true);
  } finally {
    closeLocalDatabase(db);
  }
});

test("controller UI keeps guidance visible and removes draft autofill", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const localControllerState = readSrc("desktop/src/bag/live-state/bag-local-controller-state.ts");

  assert.ok(controller.includes("Manual controller values are editable and preserved here"));
  assert.ok(!controller.includes('displaySource === "webpage-scraper" ? (\n        <p className="text-sm text-muted">\n          Manual controller'));
  assert.ok(controller.includes("emptyLotDraft()"));
  assert.ok(controller.includes("lotDirty"));
  assert.ok(controller.includes("bidDirty"));
  assert.ok(controller.includes("submittedBidAmountFromEnvelope"));
  assert.ok(controller.includes("getBidIncrementBase"));
  assert.ok(!controller.includes("baselineBid"));
  assert.ok(!controller.includes("lotFieldsFromEnvelope"));
  assert.ok(localControllerState.includes("createEmptyDraft"));
  assert.ok(localControllerState.includes("currentBid: null"));
  assert.ok(localControllerState.includes("return draft"));
});

test("local controller JSON enriches submitted lot for pylon feed", () => {
  const dataset = {
    lots: [
      {
        lot: "101",
        year: "1969",
        reserveStatus: "No Reserve",
        photos: ["https://example.com/101.jpg"],
      },
    ],
  };
  const resolved = resolveLocalControllerDisplayData({
    submitted: {
      currentLot: {
        lotNumber: "101",
        title: "Manual Title",
        currentBidLabel: "$25,000",
        currentBid: 25000,
      },
    },
    dataset,
  });

  assert.ok(resolved?.currentLot);
  assert.equal(resolved.currentLot.title, "Manual Title");
  assert.equal(resolved.currentLot.year, "1969");
  assert.equal(resolved.currentLot.reserveStatus, "No Reserve");
  assert.deepEqual(resolved.currentLot.photos, ["https://example.com/101.jpg"]);

  const pylon = mapLiveStateToPylonFeed(resolved);
  assert.equal(pylon.auctionDisplay.biddingPrice, "$25,000");
  assert.equal(pylon.auctionDisplay.year, "1969");

  const effective = resolveEffectiveDisplayData({
    source: "local-controller",
    scraperSnapshot: null,
    localControllerState: null,
    submittedState: {
      currentLot: {
        lotNumber: "101",
        title: "Manual Title",
        currentBidLabel: "$25,000",
      },
    },
    dataset,
  });
  assert.equal(effective.pylonFeed.auctionDisplay.biddingPrice, "$25,000");
});

test("json preview labels omit manual and automatic parentheticals", () => {
  const resolver = readSrc("src/lib/displays/resolve-effective-display-data.ts");
  const localResolver = readSrc("src/lib/displays/resolve-local-controller-display-data.ts");
  assert.ok(resolver.includes('"Local Controller"'));
  assert.ok(resolver.includes('"Webpage Scraper"'));
  assert.ok(localResolver.includes("waiting-for-manual-input"));
  assert.ok(!resolver.includes("(manual)"));
  assert.ok(!resolver.includes("(automatic)"));
});
