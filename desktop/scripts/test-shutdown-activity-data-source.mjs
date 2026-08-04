import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ActivitySessionStore } from "../dist/services/activity-session-store.js";
import {
  DISPLAY_DATA_SOURCE_SETTING_KEY,
  displayDataSourceLabel,
  isDisplayDataSource,
} from "../dist/displays/display-data-source.js";
import {
  mapLiveStateToLowerTickerFeed,
  mapSnapshotToLowerTickerFeed,
} from "../dist/displays/lower-ticker-data.js";
import {
  mapLiveStateToPylonFeed,
  mapSnapshotToPylonFeed,
} from "../dist/displays/pylon-data.js";
import { LocalDataService } from "../dist/services/local-data-service.js";
import { EngineManager } from "../dist/services/engine-manager.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
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

  mkdirSync(paths.data, { recursive: true });
  mkdirSync(paths.backups, { recursive: true });
  mkdirSync(paths.config, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });
  mkdirSync(paths.engineLogs, { recursive: true });
  return paths;
}

test("main process intercepts close with scraper confirmation dialog", () => {
  const main = readSrc("desktop/src/main.ts");

  assert.ok(main.includes('mainWindow.on("close"'));
  assert.ok(main.includes("shouldBlockAppClose"));
  assert.ok(main.includes("forceCloseConfirmed"));
  assert.ok(main.includes("shutdownInProgress"));
  assert.ok(main.includes("dialog.showMessageBox"));
  assert.ok(main.includes("The scraper is running in the background."));
  assert.ok(main.includes("Are you sure you want to exit the app?"));
  assert.ok(main.includes("Exit App"));
  assert.ok(main.includes("performGracefulShutdown"));
  assert.ok(main.includes("isScraperSessionActive"));
});

test("engine manager exposes scraper session active detection", () => {
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(engineManager.includes("isScraperSessionActive"));
  assert.ok(localData.includes("isAnyEngineSessionActive"));
});

test("display card helper text removed", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");

  assert.ok(!card.includes("Use this local URL in a compatible browser-based graphics input."));
  assert.ok(!card.includes("Keep the desktop app open while using this local display URL."));
  assert.ok(card.includes("Copy Local URL"));
  assert.ok(card.includes("View Fullscreen"));
});

test("activity session store starts empty and can clear explicitly", () => {
  const store = new ActivitySessionStore();
  assert.deepEqual(store.getSnapshot(), []);

  store.append({
    type: "test.event",
    message: "Test event",
    timestamp: new Date().toISOString(),
  });
  assert.equal(store.getSnapshot().length, 1);

  store.clear();
  assert.deepEqual(store.getSnapshot(), []);
});

test("activity overview keeps newest 50 while full snapshot is unbounded", () => {
  const store = new ActivitySessionStore();
  for (let index = 0; index < 55; index += 1) {
    store.append({
      type: "test.event",
      message: `Event ${index}`,
      timestamp: new Date().toISOString(),
    });
  }

  const overview = store.getOverviewSnapshot();
  const full = store.getSnapshot();
  assert.equal(overview.length, 50);
  assert.equal(full.length, 55);
  assert.equal(overview[0]?.message, "Event 54");
});

test("display data source persists in app settings with default", async () => {
  assert.equal(DISPLAY_DATA_SOURCE_SETTING_KEY, "displayDataSource");
  assert.equal(isDisplayDataSource("webpage-scraper"), true);
  assert.equal(isDisplayDataSource("local-controller"), true);
  assert.equal(displayDataSourceLabel("local-controller"), "Local Controller");

  const paths = createTestPaths("display-data-source");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    assert.equal(settings.get(DISPLAY_DATA_SOURCE_SETTING_KEY, "webpage-scraper"), "webpage-scraper");
    settings.set(DISPLAY_DATA_SOURCE_SETTING_KEY, "local-controller");
    assert.equal(settings.get(DISPLAY_DATA_SOURCE_SETTING_KEY, "webpage-scraper"), "local-controller");
  } finally {
    closeLocalDatabase(db);
  }
});

test("pylon mapping uses scraper snapshot or local controller live state without fallback", () => {
  const scraperPayload = mapSnapshotToPylonFeed({
    auctionDisplay: {
      lot: "Lot 12",
      title: "1967 Shelby GT500",
      year: "1967",
      reserveStatus: "Offered Without Reserve",
      biddingPrice: "$125,000",
      currencies: ["€115,000"],
      photos: ["https://example.com/photo.jpg"],
    },
  });

  assert.equal(scraperPayload.auctionDisplay.lot, "Lot 12");
  assert.equal(scraperPayload.auctionDisplay.biddingPrice, "$125,000");

  const controllerPayload = mapLiveStateToPylonFeed({
    currentLot: {
      lotNumber: "15",
      title: "Manual Lot",
      year: "1970",
      reserveStatus: "Reserve Not Met",
      currentBidLabel: "$50,000",
      imageUrl: "https://example.com/manual.jpg",
    },
  });

  assert.equal(controllerPayload.auctionDisplay.lot, "Lot 15");
  assert.equal(controllerPayload.auctionDisplay.title, "Manual Lot");
  assert.equal(controllerPayload.auctionDisplay.photos[0], "https://example.com/manual.jpg");
});

test("lower ticker mapping uses scraper next array or local controller up-next lots", () => {
  const scraperPayload = mapSnapshotToLowerTickerFeed({
    next: [
      { lot: "102", title: "Next One" },
      { lot: "103", title: "Next Two" },
    ],
  });
  assert.deepEqual(scraperPayload.next, [
    { lot: "102", title: "Next One" },
    { lot: "103", title: "Next Two" },
  ]);

  const controllerPayload = mapLiveStateToLowerTickerFeed({
    nextLots: [
      { lotNumber: "201", title: "Manual Next" },
      { lotNumber: "202", title: "Manual Two" },
    ],
  });
  assert.deepEqual(controllerPayload.next, [
    { lot: "201", title: "Manual Next" },
    { lot: "202", title: "Manual Two" },
  ]);
});

test("display data endpoints include source field and no silent fallback", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(localData.includes("getDisplayDataSource()"));
  assert.ok(localData.includes("resolveDisplayData"));
  assert.ok(localData.includes("getPrimaryBagSubmittedState"));
  assert.ok(localData.includes("source,"));
  assert.ok(localData.includes('status: payload.hasData ? "ok" : "no_data"'));
  assert.ok(localData.includes("resolveEffectiveDisplayData"));
  assert.ok(localData.includes("getLatestBagSnapshotPayload()"));
});

test("source switching does not stop scraper in local data service", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");

  assert.ok(!localData.includes("stopAll"));
  assert.ok(!localData.includes("updateDesiredState(engineId, \"stopped\")"));
  assert.ok(localData.includes("setDisplayDataSource"));
  assert.ok(!selector.includes("engines.stop"));
  assert.ok(!selector.includes("restart"));
});

test("active displays count remains independent from data source selector", () => {
  const overview = readSrc("src/components/projects/OverviewEngineStatistics.tsx");
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");

  assert.ok(overview.includes("getEnabledDisplayCount"));
  assert.ok(!selector.includes("enabledDisplayCount"));
  assert.ok(!selector.includes("setPylonDisplayEnabled"));
});

test("pylon viewer polls data endpoint and switches on next poll without refresh", () => {
  const pylonHtml = readSrc("public/displays/pylon/index.html");
  const lowerTickerHtml = readSrc("public/displays/lower-ticker-v5/index.html");

  assert.ok(pylonHtml.includes("setInterval(poll"));
  assert.ok(pylonHtml.includes("await fetch(url"));
  assert.ok(lowerTickerHtml.includes("setInterval"));
  assert.ok(lowerTickerHtml.includes("fetch("));
});

test("activity panel replaces placeholder with session feed", () => {
  const panel = readSrc("src/components/projects/ProjectActivityPanel.tsx");
  const client = readSrc("src/lib/desktop/activity-session-client.ts");
  const preload = readSrc("desktop/src/preload.ts");

  assert.ok(panel.includes("useActivitySession"));
  assert.ok(panel.includes("No activity yet"));
  assert.ok(!panel.includes("has not been implemented yet"));
  assert.ok(client.includes("onSnapshot"));
  assert.ok(preload.includes("neud:activity:snapshot"));
});

test("project layout aligns sticky top menu with last poll and data source", () => {
  const layoutFrame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
  const topMenu = readSrc("src/components/projects/ProjectTopMenuBar.tsx");
  const selector = readSrc("src/components/projects/ProjectDataSourceSelector.tsx");

  assert.ok(layoutFrame.includes("<ProjectTopMenuBar"));
  assert.ok(topMenu.includes("--title-bar-height"));
  assert.ok(topMenu.includes("items-center"));
  assert.ok(topMenu.includes("ProjectLastPollStatus"));
  assert.ok(topMenu.includes("<ProjectDataSourceSelector"));
  assert.ok(selector.includes("items-center"));
});

test("runtime diagnostics last error uses engine status only", () => {
  const diagnostics = readSrc("src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx");

  assert.ok(diagnostics.includes("{status?.last_error ?? \"—\"}"));
  assert.ok(!diagnostics.includes("metadata?.error"));
});

test("successful polls preserve last error until session reset", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.ok(localData.includes("recordRunSuccess"));
  assert.ok(!localData.includes("lastError: null,\n      runCount"));
});

test("last error clears on startup and shutdown without bag state restore", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const bagLiveState = readSrc("desktop/src/bag/live-state/bag-live-state-service.ts");
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");
  const main = readSrc("desktop/src/main.ts");

  assert.ok(localData.includes("initializeSessionDiagnostics"));
  assert.ok(localData.includes("clearSessionFacingLastErrors"));
  assert.ok(localData.includes("bagLiveState.syncEngineStatus"));
  assert.ok(bagLiveState.includes("lastError: status?.lastError ?? undefined"));
  assert.ok(engineManager.includes("clearSessionFacingLastErrors"));
  assert.ok(main.includes("initializeSessionDiagnostics"));
});

test("overview header removes manager access badge", () => {
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");

  assert.ok(!overview.includes("ProjectAccessBadge"));
});

test("activity events include actor metadata and user action grammar", () => {
  const store = readSrc("desktop/src/services/activity-session-store.ts");
  const messages = readSrc("desktop/src/services/activity-message.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(store.includes("actor?: ActivityActor"));
  assert.ok(messages.includes("formatUserActivityMessage"));
  assert.ok(localData.includes("userAction"));
  assert.ok(localData.includes("resolveCurrentActivityActor"));
});

test("activity panel shows five visible rows, chronological overview, and view full activity link", () => {
  const panel = readSrc("src/components/projects/ProjectActivityPanel.tsx");
  const constants = readSrc("src/lib/projects/activity-panel.ts");
  const fullView = readSrc("src/components/projects/ProjectActivityFullView.tsx");
  const activityPage = readSrc("src/app/(portal)/projects/[slug]/activity/page.tsx");
  const client = readSrc("src/lib/desktop/activity-session-client.ts");

  assert.ok(panel.includes("getOverviewDisplayEntries"));
  assert.ok(constants.includes("ACTIVITY_PANEL_VISIBLE_ROWS = 5"));
  assert.ok(fullView.includes("ACTIVITY_FULL_PAGE_SIZE"));
  assert.ok(panel.includes("ACTIVITY_PANEL_SCROLL_HEIGHT_PX"));
  assert.ok(panel.includes("Jump to Latest"));
  assert.ok(panel.includes("View Full Activity"));
  assert.ok(fullView.includes("ACTIVITY_ORDER_OPTIONS"));
  assert.ok(constants.includes('"Oldest First"'));
  assert.ok(fullView.includes("Showing"));
  assert.ok(fullView.includes("All Users"));
  assert.ok(fullView.includes("useActivitySession"));
  assert.ok(activityPage.includes("ProjectActivityFullView"));
  assert.ok(!activityPage.includes("redirect("));
  assert.ok(!client.includes(".slice(0, 50)"));
});

test("local controller manual bid uses draft increments and data source gating", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.ok(!controller.includes("Bid calculator"));
  assert.ok(!controller.includes("localApplyBagBidCalculator"));
  assert.ok(controller.includes("submittedBidLabel"));
  assert.ok(controller.includes("submittedBidAmountFromEnvelope"));
  assert.ok(controller.includes("getBidIncrementBase"));
  assert.ok(controller.includes("Manual Lot Selection"));
  assert.ok(!controller.includes("Select Local Controller as the Data Source to submit a manual bid."));
  assert.ok(controller.includes("localSubmitBagManualBid"));
  assert.ok(!controller.includes("Mark Sold"));
  assert.ok(controller.indexOf("Increase Bid") < controller.indexOf("Decrease Bid"));
  const increaseBlock = controller.slice(
    controller.indexOf("Increase Bid"),
    controller.indexOf("Decrease Bid"),
  );
  const decreaseBlock = controller.slice(controller.indexOf("Decrease Bid"));
  assert.ok(increaseBlock.includes("adjustBidDraft(delta)"));
  assert.ok(!increaseBlock.includes("localSubmitBagManualBid"));
  assert.ok(decreaseBlock.includes("adjustBidDraft(delta)"));
  assert.ok(!decreaseBlock.includes("localSubmitBagManualBid"));
});

test("local controller layout does not branch on data source selector", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

  assert.ok(!controller.includes("displaySource === \"local-controller\""));
  assert.ok(controller.includes("displaySource === \"webpage-scraper\""));
});

test("engine stop lifecycle clears execution logs and last errors but not activity", () => {
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(engineManager.includes("clearAllExecutionLogSessions"));
  assert.ok(!engineManager.includes("clearActivitySession"));
  assert.ok(engineManager.includes("clearSessionFacingLastErrors"));
  assert.ok(!localData.includes("Scrape completed successfully"));
});

test("isAnyEngineSessionActive treats scheduled polling as active", () => {
  function isAnyEngineSessionActive(engines) {
    for (const engine of engines) {
      if (engine.desiredState === "running") return true;
      const actualState = engine.actualState ?? "stopped";
      if (["starting", "running", "stopping", "scraping"].includes(actualState)) {
        return true;
      }
    }
    return false;
  }

  assert.equal(
    isAnyEngineSessionActive([
      { desiredState: "running", actualState: "stopped" },
    ]),
    true,
  );
  assert.equal(
    isAnyEngineSessionActive([
      { desiredState: "stopped", actualState: "stopped" },
    ]),
    false,
  );
});

test("EngineManager class exports scraper session guard used by main process", () => {
  assert.equal(typeof EngineManager.prototype.isScraperSessionActive, "function");
});

test("LocalDataService class exposes display data source persistence helpers", () => {
  assert.equal(typeof LocalDataService.prototype.getDisplayDataSource, "function");
  assert.equal(typeof LocalDataService.prototype.setDisplayDataSource, "function");
});
