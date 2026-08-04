import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDisplayRegistry,
  getEnabledDisplayCount,
  getRegisteredDisplayCount,
  LOWER_TICKER_V5_DISPLAY_ID,
  LOWER_TICKER_V5_DISPLAY_SLUG,
  LOWER_TICKER_V5_ENABLED_SETTING_KEY,
  PYLON_DISPLAY_ID,
  PYLON_DISPLAY_SLUG,
  PYLON_ENABLED_SETTING_KEY,
} from "../dist/displays/registry.js";
import {
  mapSnapshotToPylonFeed,
  sanitizePylonFeedPayload,
} from "../dist/displays/pylon-data.js";
import { mapSnapshotToLowerTickerFeed } from "../dist/displays/lower-ticker-data.js";
import {
  DEFAULT_PROJECT_CREATOR,
  resolveProjectCreator,
} from "../dist/displays/creator.js";
import { parsePollIntervalMs } from "../dist/displays/poll-params.js";
import { PylonDisplayService } from "../dist/services/pylon-display-service.js";
import { LowerTickerDisplayService } from "../dist/services/lower-ticker-display-service.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
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

function seedProject(db, { projectId, projectType }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, project_number, name, slug, project_type, status,
      settings_json, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
  ).run(projectId, 1, "Test Project", "test-project", projectType, "active", now, now);
}

test("overview metadata shows creator and hides owner, icon, theme", () => {
  const overview = readSrc("src/components/projects/ProjectOverview.tsx");

  assert.ok(!overview.includes("Owner"));
  assert.ok(!overview.includes("Icon"));
  assert.ok(!overview.includes("Theme"));
  assert.ok(!overview.includes("Manager"));
  assert.ok(overview.includes("Creator"));
  assert.ok(overview.includes("creator.name"));
  assert.ok(overview.includes("creator.email"));
  assert.ok(overview.includes("Webpage Scraper"));
});

test("creator resolves from authenticated Trevor account without duplication", () => {
  const creator = resolveProjectCreator({
    email: "trevorneuenswander@gmail.com",
    displayName: "Trevor Neuenswander",
  });

  assert.equal(creator.name, "Trevor Neuenswander");
  assert.equal(creator.email, "trevorneuenswander@gmail.com");
});

test("creator falls back to default Trevor metadata", () => {
  const creator = resolveProjectCreator({ email: "other@example.com" });
  assert.deepEqual(creator, DEFAULT_PROJECT_CREATOR);
});

test("registry registers Pylon v5 and Lower Ticker v5 with stable slugs", () => {
  const registry = buildDisplayRegistry({
    baseUrl: "http://127.0.0.1:3000",
    pylonEnabled: true,
    lowerTickerV5Enabled: true,
  });

  assert.equal(registry.length, 4);
  assert.equal(registry[0].id, PYLON_DISPLAY_ID);
  assert.equal(registry[0].slug, PYLON_DISPLAY_SLUG);
  assert.equal(registry[0].name, "Pylon v5");
  assert.equal(
    registry[0].description,
    "Semi-transparent Pylon with Lot Photos and Bidding Data.",
  );
  assert.equal(registry[1].id, LOWER_TICKER_V5_DISPLAY_ID);
  assert.equal(registry[1].slug, LOWER_TICKER_V5_DISPLAY_SLUG);
  assert.equal(registry[1].name, "Lower Ticker v5");
  assert.equal(registry[1].description, "Lists the three Up Next Lots");
  assert.equal(registry[2].id, "new-bid-display-v1");
  assert.equal(registry[3].id, "new-ticker-v1");
  assert.equal(getRegisteredDisplayCount(registry), 4);
  assert.equal(getEnabledDisplayCount(registry), 2);
});

test("enabled display count derives from registry enabled states", () => {
  const registry = buildDisplayRegistry({
    baseUrl: "http://127.0.0.1:3000",
    pylonEnabled: true,
    lowerTickerV5Enabled: false,
  });

  assert.equal(getEnabledDisplayCount(registry), 1);
});

test("new auction displays default to disabled in registry", () => {
  const registry = buildDisplayRegistry({
    baseUrl: "http://127.0.0.1:3000",
    pylonEnabled: true,
    lowerTickerV5Enabled: true,
    newBidDisplayV1Enabled: false,
    newTickerV1Enabled: false,
  });

  const bid = registry.find((entry) => entry.id === "new-bid-display-v1");
  const ticker = registry.find((entry) => entry.id === "new-ticker-v1");
  assert.equal(bid?.enabled, false);
  assert.equal(ticker?.enabled, false);
});

test("pylon data adapter maps snapshot fields with safe defaults", () => {
  const payload = mapSnapshotToPylonFeed({
    auctionDisplay: {
      lot: "Lot 12",
      title: "1967 Shelby GT500",
      year: "1967",
      reserveStatus: "Offered Without Reserve",
      biddingPrice: "$125,000",
      currencies: ["€115,000", "£98,000"],
      photos: ["https://example.com/photo.jpg"],
      password: "secret",
    },
  });

  assert.equal(payload.auctionDisplay.lot, "Lot 12");
  assert.equal(payload.auctionDisplay.title, "1967 Shelby GT500");
  assert.equal(payload.auctionDisplay.currencies.length, 2);
  assert.equal(payload.auctionDisplay.photos.length, 1);
  assert.ok(!JSON.stringify(payload).includes("secret"));
});

test("pylon data adapter returns safe defaults without snapshot", () => {
  const payload = mapSnapshotToPylonFeed(null);
  assert.equal(payload.auctionDisplay.lot, "Lot —");
  assert.deepEqual(payload.auctionDisplay.currencies, []);
  assert.deepEqual(payload.auctionDisplay.photos, []);
});

test("lower ticker data adapter uses trusted next array first", () => {
  const payload = mapSnapshotToLowerTickerFeed({
    next: [
      { lot: "102", title: "1967 Shelby GT500" },
      { lot: "103", title: "1970 Plymouth Barracuda" },
      { lot: "104", title: "1969 Camaro SS" },
      { lot: "105", title: "Extra lot should be trimmed" },
    ],
    lots: [{ lot: "101", status: "active" }],
  });

  assert.deepEqual(payload.next, [
    { lot: "102", title: "1967 Shelby GT500" },
    { lot: "103", title: "1970 Plymouth Barracuda" },
    { lot: "104", title: "1969 Camaro SS" },
  ]);
});

test("lower ticker data adapter derives next lots after active lot", () => {
  const payload = mapSnapshotToLowerTickerFeed({
    lots: [
      { lot: "100", title: "Previous" },
      { lot: "101", title: "Active Lot", status: "active" },
      { lot: "102", title: "Next One" },
      { lot: "103", title: "Next Two" },
      { lot: "104", title: "Next Three" },
      { lot: "105", title: "Should not wrap" },
    ],
  });

  assert.deepEqual(payload.next, [
    { lot: "102", title: "Next One" },
    { lot: "103", title: "Next Two" },
    { lot: "104", title: "Next Three" },
  ]);
});

test("lower ticker data adapter falls back when no active lot", () => {
  const payload = mapSnapshotToLowerTickerFeed({
    lots: [
      { lot: "100", title: "First" },
      { lot: "101", title: "Second" },
      { lot: "102", title: "Third" },
    ],
  });

  assert.deepEqual(payload.next, [
    { lot: "101", title: "Second" },
    { lot: "102", title: "Third" },
  ]);
});

test("lower ticker data adapter returns empty next without snapshot", () => {
  const payload = mapSnapshotToLowerTickerFeed(null);
  assert.deepEqual(payload.next, []);
});

test("pylon feed sanitizer strips credential-like payloads", () => {
  const sanitized = sanitizePylonFeedPayload({
    auctionDisplay: {
      lot: "Lot 1",
      title: "",
      year: "",
      reserveStatus: "",
      biddingPrice: "",
      currencies: [],
      photos: [],
      email: "trevorneuenswander@gmail.com",
    },
  });

  assert.equal(sanitized.auctionDisplay.lot, "Lot —");
});

test("poll interval enforces 1000ms minimum", () => {
  assert.equal(parsePollIntervalMs("500"), 1000);
  assert.equal(parsePollIntervalMs("1500"), 1500);
  assert.equal(parsePollIntervalMs(undefined), 1000);
});

test("pylon enabled setting key is stable and defaults enabled", async () => {
  assert.equal(PYLON_ENABLED_SETTING_KEY, "displays.pylon.enabled");

  const paths = createTestPaths("pylon-enabled-default");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const service = new PylonDisplayService(projects, displays, settings);

    assert.equal(service.isPylonEnabled(), true);
    service.setPylonEnabled(false);
    assert.equal(service.isPylonEnabled(), false);
    assert.equal(settings.get(PYLON_ENABLED_SETTING_KEY, true), false);
  } finally {
    closeLocalDatabase(db);
  }
});

test("lower ticker enabled setting key defaults enabled", async () => {
  assert.equal(LOWER_TICKER_V5_ENABLED_SETTING_KEY, "displays.lowerTickerV5.enabled");

  const paths = createTestPaths("lower-ticker-enabled-default");
  const db = await openLocalDatabase(paths);

  try {
    const settings = new AppSettingsRepository(db);
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const service = new LowerTickerDisplayService(projects, displays, settings);

    assert.equal(service.isLowerTickerEnabled(), true);
    service.setLowerTickerEnabled(false);
    assert.equal(service.isLowerTickerEnabled(), false);
    assert.equal(settings.get(LOWER_TICKER_V5_ENABLED_SETTING_KEY, true), false);
  } finally {
    closeLocalDatabase(db);
  }
});

test("bag-graphics project receives idempotent pylon and lower ticker rows", async () => {
  const paths = createTestPaths("display-rows");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const pylonService = new PylonDisplayService(projects, displays, settings);
    const lowerTickerService = new LowerTickerDisplayService(projects, displays, settings);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "bag-graphics" });

    const pylonFirst = pylonService.ensurePylonDisplay(projectId, "http://127.0.0.1:3000");
    const pylonSecond = pylonService.ensurePylonDisplay(projectId, "http://127.0.0.1:3000");
    const lowerFirst = lowerTickerService.ensureLowerTickerDisplay(
      projectId,
      "http://127.0.0.1:3000",
    );
    const lowerSecond = lowerTickerService.ensureLowerTickerDisplay(
      projectId,
      "http://127.0.0.1:3000",
    );

    assert.ok(pylonFirst);
    assert.equal(pylonFirst?.displayKey, "pylon");
    assert.equal(pylonFirst?.name, "Pylon v5");
    assert.equal(pylonFirst?.id, pylonSecond?.id);
    assert.ok(lowerFirst);
    assert.equal(lowerFirst?.displayKey, "lower-ticker-v5");
    assert.equal(lowerFirst?.name, "Lower Ticker v5");
    assert.equal(lowerFirst?.id, lowerSecond?.id);
    assert.equal(
      displays.listByProject(projectId).filter((row) => row.displayKey === "pylon").length,
      1,
    );
    assert.equal(
      displays
        .listByProject(projectId)
        .filter((row) => row.displayKey === "lower-ticker-v5").length,
      1,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("2.5 second poll interval persists as 2500ms end to end", () => {
  const constants = readSrc("src/lib/data-engines/constants.ts");
  const pollInterval = readSrc("src/lib/data-engines/poll-interval.ts");
  const format = readSrc("src/lib/data-engines/format.ts");
  const runtime = readSrc("workers/data-engine/src/engine-runtime.js");

  assert.ok(constants.includes("2500"));
  assert.ok(pollInterval.includes("POLL_PRESETS_MS"));

  const formatSource = format.match(/function formatPollInterval[\s\S]*?^}/m)?.[0] ?? "";
  assert.ok(!formatSource.includes("Math.round(ms / 1000)"));

  const totalSeconds = 2500 / 1000;
  const label = Number.isInteger(totalSeconds) ? String(totalSeconds) : String(totalSeconds);
  assert.equal(`Polling interval changed to ${label} seconds`, "Polling interval changed to 2.5 seconds");
  assert.ok(runtime.includes("Number.isInteger(totalSeconds)"));
});

test("formatPollInterval renders fractional seconds", () => {
  function formatSubMinuteSecondsLabel(totalSeconds) {
    if (totalSeconds === 1) return "1 second";
    const label = Number.isInteger(totalSeconds) ? String(totalSeconds) : String(totalSeconds);
    return `${label} seconds`;
  }

  assert.equal(formatSubMinuteSecondsLabel(2.5), "2.5 seconds");
  assert.equal(formatSubMinuteSecondsLabel(2), "2 seconds");
  assert.equal(formatSubMinuteSecondsLabel(1.5), "1.5 seconds");
});

test("shared display card includes preview disclosure, switch, and status text", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  const preview = readSrc("src/components/displays/DisplayPreviewPanel.tsx");

  assert.ok(card.includes("Switch"));
  assert.ok(card.includes("DisclosureSection"));
  assert.ok(card.includes("lazyMount"));
  assert.ok(card.includes("Data Disconnected"));
  assert.ok(card.includes("Data Connected"));
  assert.ok(card.includes("Connection Error"));
  assert.ok(!card.includes("Live Data Connected"));
  assert.ok(!card.includes("Live Data Disconnected"));
  assert.ok(!card.includes("Waiting for Data"));
  assert.ok(preview.includes("Display data is disconnected"));
  assert.ok(card.includes("Copy Local URL"));
  assert.ok(card.includes("View Fullscreen"));
  assert.ok(!card.includes("OBS"));
  assert.ok(!card.includes('type="checkbox"'));
});

test("overview keeps active displays stat and removes display cards", () => {
  const stats = readSrc("src/components/data-engines/webpage-scraper/EngineStatistics.tsx");
  const overview = readSrc("src/components/projects/OverviewEngineStatistics.tsx");

  assert.ok(stats.includes("enabledDisplayCount"));
  assert.ok(stats.includes("Active Displays"));
  assert.ok(overview.includes("buildDisplayRegistry"));
  assert.ok(overview.includes("getEnabledDisplayCount"));
  assert.ok(overview.includes("lowerTickerV5Enabled"));
  assert.ok(!overview.includes("PylonDisplayCard"));
  assert.ok(!overview.includes("Displays"));
  assert.ok(!stats.includes('value="—"'));
});

test("displays page uses shared display cards from registry", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  const canvas = readSrc("src/components/displays/DisplayCanvasPreview.tsx");
  const displaysPage = readSrc("src/app/(portal)/projects/[slug]/displays/page.tsx");

  assert.ok(card.includes("display.name"));
  assert.ok(card.includes("display.description"));
  assert.ok(card.includes("Copy Local URL"));
  assert.ok(card.includes("View Fullscreen"));
  assert.ok(!card.includes("Use this local URL in a compatible browser-based graphics input."));
  assert.ok(!card.includes("Keep the desktop app open while using this local display URL."));
  assert.ok(canvas.includes("ResizeObserver"));
  assert.ok(card.includes("clearTimeout"));
  assert.ok(!card.includes("OBS"));
  assert.ok(!displaysPage.includes("OBS"));
  assert.ok(displaysPage.includes("DisplayCard"));
  assert.ok(displaysPage.includes("buildDisplayRegistry"));
});

test("bag auction display is removed from project displays UI", () => {
  const displaysPage = readSrc("src/app/(portal)/projects/[slug]/displays/page.tsx");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const bagRoutes = readSrc("desktop/src/bag/live-state/bag-live-state-routes.ts");

  assert.ok(!displaysPage.includes("BagDisplaysClient"));
  assert.ok(!localData.includes("BagDisplayService"));
  assert.ok(!localData.includes("bag-auction"));
  assert.ok(!bagRoutes.includes("renderBagDisplayPage"));
  assert.ok(!bagRoutes.includes('subpath === "display"'));
});

test("disabled display data endpoints return display_disabled payload", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const pylonHtml = readSrc("public/displays/pylon/index.html");
  const lowerTickerHtml = readSrc("public/displays/lower-ticker-v5/index.html");
  const pylonViewerRoute = readSrc("src/app/displays/pylon/route.ts");
  const lowerTickerViewerRoute = readSrc("src/app/displays/lower-ticker-v5/route.ts");

  assert.ok(localData.includes('status: "display_disabled"'));
  assert.ok(localData.includes("enabled: false"));
  assert.ok(localData.includes("next: []"));
  assert.ok(pylonHtml.includes("display_disabled"));
  assert.ok(pylonHtml.includes("showDisplayOff"));
  assert.ok(lowerTickerHtml.includes("display_disabled"));
  assert.ok(lowerTickerHtml.includes("showDisplayOff"));
  assert.ok(pylonViewerRoute.includes("Display Off"));
  assert.ok(lowerTickerViewerRoute.includes("Display Off"));
});

test("last error clears on app shutdown and startup session init", () => {
  const engineManager = readSrc("desktop/src/services/engine-manager.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const main = readSrc("desktop/src/main.ts");

  assert.ok(engineManager.includes("clearSessionFacingLastErrors"));
  assert.ok(engineManager.includes("clearAllExecutionLogSessions"));
  assert.ok(localData.includes("clearSessionFacingLastErrors"));
  assert.ok(localData.includes("initializeSessionDiagnostics"));
  assert.ok(main.includes("initializeSessionDiagnostics"));
});

test("pylon viewer disconnects on display_disabled without manual refresh", () => {
  const pylonHtml = readSrc("public/displays/pylon/index.html");

  assert.ok(pylonHtml.includes("json.enabled === false || json.status === 'display_disabled'"));
  assert.ok(pylonHtml.includes("showDisplayOff()"));
  assert.ok(pylonHtml.includes("stopLiveConnection"));
});

test("lower ticker viewer disconnects on display_disabled without manual refresh", () => {
  const lowerTickerHtml = readSrc("public/displays/lower-ticker-v5/index.html");

  assert.ok(
    lowerTickerHtml.includes("json.enabled === false || json.status === 'display_disabled'"),
  );
  assert.ok(lowerTickerHtml.includes("showDisplayOff()"));
  assert.ok(lowerTickerHtml.includes("stopLiveConnection"));
});

test("display card stops preview iframe when display is disabled", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  const preview = readSrc("src/components/displays/DisplayPreviewPanel.tsx");

  assert.ok(preview.includes("if (!enabled)"));
  assert.ok(preview.includes("Display data is disconnected"));
  assert.ok(card.includes("enabled={enabled}"));
  assert.ok(card.includes("lazyMount"));
});

test("lower ticker html defaults src and cleans up timers", () => {
  const lowerTickerHtml = readSrc("public/displays/lower-ticker-v5/index.html");

  assert.ok(lowerTickerHtml.includes("const DEFAULT_ENDPOINT = '/api/displays/lower-ticker-v5/data'"));
  assert.ok(lowerTickerHtml.includes("params.get('src') || DEFAULT_ENDPOINT"));
  assert.ok(lowerTickerHtml.includes("stopLiveConnection"));
  assert.ok(lowerTickerHtml.includes("pagehide"));
  assert.ok(lowerTickerHtml.includes("beforeunload"));
  assert.ok(lowerTickerHtml.includes("clearTrackedTimeouts"));
  assert.ok(lowerTickerHtml.includes("dissolveHidePill"));
});

test("viewer and data routes exist with no-store behavior", () => {
  const pylonViewerRoute = readSrc("src/app/displays/pylon/route.ts");
  const lowerTickerViewerRoute = readSrc("src/app/displays/lower-ticker-v5/route.ts");
  const pylonDataRoute = readSrc("src/app/api/displays/pylon/data/route.ts");
  const lowerTickerDataRoute = readSrc("src/app/api/displays/lower-ticker-v5/data/route.ts");

  assert.ok(pylonViewerRoute.includes("Display Off"));
  assert.ok(lowerTickerViewerRoute.includes("Display Off"));
  assert.ok(pylonViewerRoute.includes('Cache-Control": "no-store"'));
  assert.ok(lowerTickerViewerRoute.includes('Cache-Control": "no-store"'));
  assert.ok(pylonDataRoute.includes('Cache-Control": "no-store"'));
  assert.ok(lowerTickerDataRoute.includes('Cache-Control": "no-store"'));
  assert.ok(pylonDataRoute.includes("/api/displays/pylon/data"));
  assert.ok(lowerTickerDataRoute.includes("/api/displays/lower-ticker-v5/data"));
});

test("lower ticker copied url stays path-only", () => {
  const registry = buildDisplayRegistry({
    baseUrl: "http://127.0.0.1:3000",
    pylonEnabled: true,
    lowerTickerV5Enabled: true,
  });
  const lowerTicker = registry.find((entry) => entry.id === LOWER_TICKER_V5_DISPLAY_ID);

  assert.equal(lowerTicker?.outputUrl, "http://127.0.0.1:3000/displays/lower-ticker-v5");
});
