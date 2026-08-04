import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { BroadArrowUploadedDisplaysImportService } from "../dist/services/broad-arrow-uploaded-displays-import-service.js";
import { BROAD_ARROW_CANONICAL_PROJECT } from "../dist/bag/broad-arrow-phase.js";
import {
  AUCTION_PYLON_DISPLAY_SPEC,
  AUCTION_TICKER_OVERLAY_SPEC,
  BROAD_ARROW_UPLOADED_DISPLAY_SPECS,
} from "../dist/displays/broad-arrow-uploaded-display-specs.js";
import {
  isLegacyPylonV2Html,
  isLegacyTickerLiveHtml,
  isLegacySrcPollingPylonHtml,
  isLegacySrcPollingTickerHtml,
  transformLegacySrcPollingPylonHtmlV1ToV2,
  transformLegacySrcPollingTickerHtmlToLiveBridge,
} from "../dist/displays/legacy-display-v2-transform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-uploaded-displays-${name}-${suffix}`);
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
  for (const dir of [paths.data, paths.backups, paths.projects, paths.config, paths.logs, paths.credentialsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

test("bundled v1 sources preserve uploaded HTML exactly", () => {
  const tickerBundled = read(AUCTION_TICKER_OVERLAY_SPEC.bundledV1RelativePath);
  const pylonBundled = read(AUCTION_PYLON_DISPLAY_SPEC.bundledV1RelativePath);
  assert.match(tickerBundled, /Auction Ticker Overlay/);
  assert.match(pylonBundled, /Auction Pylon Display/);
  assert.equal(isLegacySrcPollingTickerHtml(tickerBundled), true);
  assert.equal(isLegacySrcPollingPylonHtml(pylonBundled), true);
});

test("v2 transforms remove src polling and add NEUD runtime bridge", () => {
  const tickerV1 = read(AUCTION_TICKER_OVERLAY_SPEC.bundledV1RelativePath);
  const pylonV1 = read(AUCTION_PYLON_DISPLAY_SPEC.bundledV1RelativePath);
  const tickerV2 = transformLegacySrcPollingTickerHtmlToLiveBridge(tickerV1);
  const pylonV2 = transformLegacySrcPollingPylonHtmlV1ToV2(pylonV1);

  assert.equal(tickerV1, read(AUCTION_TICKER_OVERLAY_SPEC.bundledV1RelativePath));
  assert.equal(pylonV1, read(AUCTION_PYLON_DISPLAY_SPEC.bundledV1RelativePath));
  assert.doesNotMatch(tickerV2, /setInterval\(poll,\s*POLL\)/);
  assert.doesNotMatch(pylonV2, /setInterval\(poll,\s*POLL\)/);
  assert.match(tickerV2, /initializeNeudTickerBridge/);
  assert.match(pylonV2, /buildAuctionDisplayView/);
  assert.match(pylonV2, /src="\/displays\/pylon\/logo\.png"/);
  assert.equal(isLegacyTickerLiveHtml(tickerV2), true);
  assert.equal(isLegacyPylonV2Html(pylonV2), true);
});

test("ticker bridge maps broadArrowDisplay.ticker.next into placeNextLots", () => {
  const bridgeSource = read("desktop/src/displays/legacy-ticker-live-bridge.js");
  const placeCalls = [];
  const sandbox = {
    placeCalls,
    placeNextLots(next) {
      placeCalls.push(next);
    },
    normalize(d) {
      if (!d) return { next: [] };
      let next = d.next || [];
      if ((!next || !next.length) && Array.isArray(d.lots) && d.lots.length) {
        const idx = d.lots.findIndex((x) => x.status && /active/i.test(x.status));
        if (idx >= 0) next = d.lots.slice(idx + 1, idx + 4);
        else next = d.lots.slice(1, 4);
      }
      return { next: (next || []).slice(0, 3) };
    },
    statusEl: { textContent: "pending" },
    ENDPOINT: null,
    POLL: 1000,
    poll() {},
    console,
    messageHandler: null,
    neudDataHandler: null,
    setTimeout,
    setInterval,
    clearInterval,
    document: {
      getElementById() {
        return { textContent: "" };
      },
    },
    window: {},
  };

  sandbox.window = {
    addEventListener(type, handler) {
      if (type === "message") sandbox.messageHandler = handler;
      if (type === "neud:data") sandbox.neudDataHandler = handler;
    },
    postMessage() {},
    location: { origin: "http://127.0.0.1:3000" },
    parent: { postMessage() {} },
    placeNextLots(next) {
      placeCalls.push(next);
    },
    NEUDDisplay: {
      getSnapshot: () => null,
      subscribe() {},
      signalReady() {},
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(bridgeSource, sandbox);
  sandbox.messageHandler({
    origin: "http://127.0.0.1:3000",
    data: {
      source: "neud-runtime",
      type: "NEUD_DATA_UPDATE",
      version: 1,
      payload: {
        next: [
          { lot: "201", title: "Next Lot One" },
          { lot: "202", title: "Next Lot Two" },
        ],
        dataSource: "webpage-scraper",
      },
    },
  });

  assert.equal(placeCalls.length, 1);
  assert.equal(placeCalls[0].length, 2);
  assert.equal(placeCalls[0][0].lot, "201");
});

test("uploaded display specs no longer seed TypeScript auction pylon", () => {
  assert.equal(BROAD_ARROW_UPLOADED_DISPLAY_SPECS.length, 0);
});

test("legacy pylon bundled source uses uploaded HTML", () => {
  const legacyPylon = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  assert.match(legacyPylon, /Auction Pylon Display/);
  assert.equal(isLegacySrcPollingPylonHtml(legacyPylon), true);
});

test("uploaded import service is idempotent with empty seed list", async () => {
  const paths = createTestPaths("import");
  const db = await openLocalDatabase(paths);
  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO projects (
      id, name, slug, project_type, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    projectId,
    BROAD_ARROW_CANONICAL_PROJECT.name,
    BROAD_ARROW_CANONICAL_PROJECT.slug,
    BROAD_ARROW_CANONICAL_PROJECT.projectType,
    now,
    now,
  );

  const storage = new ProjectCodeStorageService(paths);
  const service = new BroadArrowUploadedDisplaysImportService(
    new AppSettingsRepository(db),
    new ProjectsRepository(db),
    new DisplaysRepository(db),
    new ProjectDisplayCodeRepository(db),
    new ProjectCodeRevisionsRepository(db),
    storage,
    repoRoot,
  );

  const first = service.ensureImported("test-user");
  assert.equal(first.createdCount, 0);
  assert.equal(first.imported.length, 0);

  const second = service.ensureImported("test-user");
  assert.equal(second.createdCount, 0);
  assert.equal(new DisplaysRepository(db).listByProject(projectId).length, 0);

  await closeLocalDatabase(db);
  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("pylon logo asset is referenced for serve-time rewrite even when file is absent", () => {
  const logoPath = path.join(repoRoot, "public", "displays", "pylon", "logo.png");
  const legacyPylon = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  assert.match(legacyPylon, /26-Broad-Arrow-Auctions-Logo/);
  if (!fs.existsSync(logoPath)) {
    console.warn("[test] Logo asset missing at public/displays/pylon/logo.png");
  }
});

test("startup wires idempotent Broad Arrow uploaded display import", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /BroadArrowUploadedDisplaysImportService/);
  assert.match(main, /ensureImported\(\)/);
});
