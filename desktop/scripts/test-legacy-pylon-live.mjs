#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { BroadArrowLegacyDisplaysImportService } from "../dist/services/broad-arrow-legacy-displays-import-service.js";
import { BROAD_ARROW_CANONICAL_PROJECT } from "../dist/bag/broad-arrow-phase.js";
import {
  LEGACY_PYLON_SPEC,
  RETIRED_AUCTION_PYLON_IMPORT_KEY,
  RETIRED_AUCTION_PYLON_SLUG,
} from "../dist/displays/broad-arrow-legacy-display-specs.js";
import {
  applyHtmlDisplayRuntimeAdapters,
  LEGACY_PYLON_RUNTIME_ADAPTER_KEY,
} from "../dist/displays/html-display-runtime-adapters.js";
import {
  isLegacySrcPollingPylonHtml,
  transformLegacyPylonHtmlForServing,
} from "../dist/displays/legacy-display-v2-transform.js";
import { hasEmbeddedNeudDisplayRuntime } from "../dist/developer-tools/templates.js";
import { hashSource } from "../dist/repositories/project-scraper-code-repository.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const STORED_V1_HASH = "1C5B432B945CC213419A3584CA7142660443668AF27716CFCD53BDE5A127C5F5";

const FIXTURE_PAYLOAD = {
  broadArrowDisplay: {
    pylon: {
      lot: "Lot 111",
      title: "Alfa Romeo 6C 2500 Super Sport Coupé Aerlux by Touring",
      year: "1947",
      reserveStatus: "Offered Without Reserve",
      biddingPrice: "$125,000",
      currencies: ["€115,000", "£98,000", "CHF 110,000", "A$190,000"],
      photos: ["https://example.com/lot-111-a.jpg", "https://example.com/lot-111-b.jpg"],
    },
    ticker: { next: [] },
    updatedAt: "2026-07-26T00:00:00.000Z",
    dataSource: "webpage-scraper",
  },
};

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-legacy-pylon-${name}-${suffix}`);
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

test("legacy pylon bundled v1 preserves uploaded HTML bytes", () => {
  const bundled = readSrc(LEGACY_PYLON_SPEC.bundledV1RelativePath);
  assert.match(bundled, /Pylon HTML v1\.24/);
  assert.equal(isLegacySrcPollingPylonHtml(bundled), true);
  const hash = crypto.createHash("sha256").update(bundled, "utf8").digest("hex").toUpperCase();
  assert.equal(hash, STORED_V1_HASH);
});

test("serve-time adapter injects bridge and poll guard without modifying stored hash", () => {
  const stored = readSrc(LEGACY_PYLON_SPEC.bundledV1RelativePath);
  const storedHash = hashSource(stored);
  const served = applyHtmlDisplayRuntimeAdapters(stored, {
    projectId: "project",
    projectSlug: BROAD_ARROW_CANONICAL_PROJECT.slug,
    displayId: "display",
    slug: LEGACY_PYLON_SPEC.slug,
    displayKey: LEGACY_PYLON_SPEC.slug,
    settings: { runtimeAdapterKey: LEGACY_PYLON_RUNTIME_ADAPTER_KEY },
    runtimeAdapterKey: LEGACY_PYLON_RUNTIME_ADAPTER_KEY,
  });

  assert.notEqual(served, stored);
  assert.equal(hashSource(stored), storedHash);
  assert.match(served, /initializeNeudPylonBridge/);
  assert.match(served, /__NEUD_RUNTIME_MANAGED_DISPLAY__/);
  assert.match(served, /if \(!window\.__NEUD_RUNTIME_MANAGED_DISPLAY__\)/);
  assert.equal(hasEmbeddedNeudDisplayRuntime(stored), false);
  assert.equal(
    hasEmbeddedNeudDisplayRuntime(
      `<html><body>${readSrc("desktop/src/displays/legacy-pylon-live-bridge.js")}</body></html>`,
    ),
    false,
  );
});

test("wrapped served HTML still injects shared NEUD display runtime", async () => {
  const { wrapStandaloneDisplayHtml } = await import("../dist/developer-tools/templates.js");
  const stored = readSrc(LEGACY_PYLON_SPEC.bundledV1RelativePath);
  const adapted = applyHtmlDisplayRuntimeAdapters(stored, {
    projectId: "project",
    projectSlug: BROAD_ARROW_CANONICAL_PROJECT.slug,
    displayId: "display",
    slug: LEGACY_PYLON_SPEC.slug,
    displayKey: LEGACY_PYLON_SPEC.slug,
    settings: { runtimeAdapterKey: LEGACY_PYLON_RUNTIME_ADAPTER_KEY },
    runtimeAdapterKey: LEGACY_PYLON_RUNTIME_ADAPTER_KEY,
  });
  const wrapped = wrapStandaloneDisplayHtml({
    html: adapted,
    dataUrl: "/api/display/project/legacy-pylon/data?mode=output",
    displayInfo: { projectId: "project", displayId: "display", slug: LEGACY_PYLON_SPEC.slug },
  });

  assert.match(wrapped, /\/neud-display-runtime\.js/);
  assert.match(wrapped, /window\.__NEUD_DISPLAY_CONFIG__/);
});

test("legacy pylon bridge maps canonical payload into render()", () => {
  const bridgeSource = readSrc("desktop/src/displays/legacy-pylon-live-bridge.js");
  const renderCalls = [];
  const sandbox = {
    renderCalls,
    render(feed) {
      renderCalls.push(feed);
    },
    statusEl: { textContent: "Feed unavailable" },
    ENDPOINT: null,
    POLL: 1000,
    poll() {},
    console,
    setTimeout,
    setInterval,
    clearInterval,
    window: {},
  };

  sandbox.window = {
    addEventListener() {},
    postMessage() {},
    location: { origin: "http://127.0.0.1:3000", href: "http://127.0.0.1:3000" },
    parent: { postMessage() {} },
    render(feed) {
      renderCalls.push(feed);
    },
    NEUDDisplay: {
      getSnapshot: () => FIXTURE_PAYLOAD,
      subscribe(callback) {
        callback(FIXTURE_PAYLOAD);
        return () => {};
      },
      signalReady() {},
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(bridgeSource, sandbox);

  assert.equal(renderCalls.length >= 1, true);
  const auctionDisplay = renderCalls[0].auctionDisplay;
  assert.equal(auctionDisplay.lot, "Lot 111");
  assert.equal(auctionDisplay.year, "1947");
  assert.equal(auctionDisplay.title, "Alfa Romeo 6C 2500 Super Sport Coupé Aerlux by Touring");
  assert.equal(auctionDisplay.biddingPrice, "$ 125,000");
  assert.equal(auctionDisplay.reserveStatus, "Offered Without Reserve");
  assert.equal(auctionDisplay.currencies.length, 4);
  assert.equal(auctionDisplay.photos.length, 2);
  assert.equal(sandbox.window.__NEUD_LEGACY_PYLON_ADAPTER_INSTALLED__, true);
});

test("legacy import creates v1-only HTML display and removes retired auction pylon", async () => {
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

  const legacyTickerDisplayId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO displays (
      id, project_id, name, display_key, enabled, refresh_rate_ms, display_width, display_height,
      sort_order, settings_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, 5000, 1920, 1080, 1, '{}', ?, ?)`,
  ).run(legacyTickerDisplayId, projectId, "Legacy Ticker", "legacy-ticker", now, now);
  db.prepare(
    `INSERT INTO project_display_code (
      display_id, project_id, slug, source_type, published_revision_id, archived, updated_at
    ) VALUES (?, ?, ?, 'project-html', ?, 0, ?)`,
  ).run(legacyTickerDisplayId, projectId, "legacy-ticker", crypto.randomUUID(), now);

  const retiredDisplayId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO displays (
      id, project_id, name, display_key, enabled, refresh_rate_ms, display_width, display_height,
      sort_order, settings_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, 5000, 1920, 1080, 2, ?, ?, ?)`,
  ).run(
    retiredDisplayId,
    projectId,
    "Auction Pylon Display",
    RETIRED_AUCTION_PYLON_SLUG,
    JSON.stringify({
      importKey: RETIRED_AUCTION_PYLON_IMPORT_KEY,
      rendererKey: "broad-arrow-pylon",
      activeRenderer: "typescript",
    }),
    now,
    now,
  );
  db.prepare(
    `INSERT INTO project_display_code (
      display_id, project_id, slug, source_type, published_revision_id, archived, updated_at
    ) VALUES (?, ?, ?, 'project-html', ?, 0, ?)`,
  ).run(retiredDisplayId, projectId, RETIRED_AUCTION_PYLON_SLUG, crypto.randomUUID(), now);

  const storage = new ProjectCodeStorageService(paths);
  const service = new BroadArrowLegacyDisplaysImportService(
    new AppSettingsRepository(db),
    new ProjectsRepository(db),
    new DisplaysRepository(db),
    new ProjectDisplayCodeRepository(db),
    new ProjectCodeRevisionsRepository(db),
    storage,
    repoRoot,
  );

  const first = service.ensureImported("test-user");
  assert.equal(first.createdCount, 1);
  assert.equal(first.retiredAuctionPylonRemoved, true);

  const displays = new DisplaysRepository(db).listByProject(projectId);
  assert.equal(displays.some((row) => row.displayKey === RETIRED_AUCTION_PYLON_SLUG), false);
  assert.equal(displays.some((row) => row.displayKey === "legacy-ticker"), true);

  const legacyPylon = displays.find((row) => row.displayKey === LEGACY_PYLON_SPEC.slug);
  assert.ok(legacyPylon);
  assert.equal(legacyPylon.name, "Legacy Pylon");
  assert.equal(legacyPylon.displayWidth, 1920);
  assert.equal(legacyPylon.displayHeight, 1080);
  assert.equal(legacyPylon.sortOrder, 2);

  const settings = legacyPylon.settings ?? {};
  assert.equal(settings.runtimeAdapterKey, LEGACY_PYLON_RUNTIME_ADAPTER_KEY);
  assert.equal(settings.importKey, LEGACY_PYLON_SPEC.importKey);
  assert.equal(settings.rendererKey, undefined);
  assert.equal(settings.activeRenderer, undefined);

  const revisions = new ProjectCodeRevisionsRepository(db).listForResource({
    projectId,
    resourceType: "display",
    resourceId: legacyPylon.id,
  });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].revisionName, "v1");
  assert.equal(revisions[0].changeNote, "Initial uploaded HTML");

  const published = storage.readDisplayPublished(projectId, legacyPylon.id);
  assert.doesNotMatch(published.html, /initializeNeudPylonBridge/);
  assert.match(published.html, /poll\(\);\s*setInterval\(poll,\s*POLL\);/);

  const second = service.ensureImported("test-user");
  assert.equal(second.createdCount, 0);
  assert.equal(new DisplaysRepository(db).listByProject(projectId).length, 2);

  await closeLocalDatabase(db);
  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("next config disables dev indicator", () => {
  const config = readSrc("next.config.ts");
  assert.match(config, /devIndicators:\s*false/);
});

test("startup wires legacy display import", () => {
  const main = readSrc("desktop/src/main.ts");
  assert.match(main, /BroadArrowLegacyDisplaysImportService/);
  assert.match(main, /legacyDisplaysImportResult/);
});

test("stored legacy pylon HTML keeps original logo reference", () => {
  const bundled = readSrc(LEGACY_PYLON_SPEC.bundledV1RelativePath);
  assert.match(bundled, /26-Broad-Arrow-Auctions-Logo-H-DrivenByHagerty_Website_PNG-WhiteBlue\[13\]\.png/);
  const served = transformLegacyPylonHtmlForServing(bundled);
  assert.match(served, /src="\/displays\/pylon\/logo\.png"/);
});
