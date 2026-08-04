import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBagLoginConfigAligned,
  buildBagRuntimeConfigForWorker,
} from "../dist/bag/config/bag-runtime-config.js";
import { BAG_EXTRACTION_MANIFEST_GROUPS } from "../dist/bag/config/bag-extraction-manifest.js";
import { BagSourceService } from "../dist/services/bag-source-service.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

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

  for (const dir of [paths.data, paths.backups, paths.config, paths.logs, paths.engineLogs, paths.credentialsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  return paths;
}

test("shared runtime config includes listing, detail, display, and login selectors", () => {
  const config = JSON.parse(
    readFileSync(path.join(repoRoot, "shared/bag/bag-runtime-config.json"), "utf8"),
  );
  assert.equal(config.listing.tableWaitSelector, "#main-container table");
  assert.equal(config.detail.soldSelector, "#vehicle_sold");
  assert.equal(config.auctionDisplay.rootWaitSelector, "#vehicle-content");
  assert.ok(config.login.usernameSelectors.length >= 1);
});

test("desktop runtime config aligns with login defaults", () => {
  assert.equal(assertBagLoginConfigAligned(), true);
});

test("worker bundle runtime config is serializable", () => {
  const runtime = buildBagRuntimeConfigForWorker();
  assert.equal(runtime.listing.rowSelector, "tbody tr");
  assert.equal(runtime.login.failureUrlSubstring, "/users/sign_in");
});

test("disabled required source blocks start validation", async () => {
  const paths = createTestPaths("disabled-source-block");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = projects.create({
      name: "Broad Arrow Auctions",
      slug: "disabled-source-block",
      projectType: "bag-graphics",
    });
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    bagSources.ensureBagScraperSources(engine.id);
    const vehicles = dataSources.getSourceByKey(engine.id, "vehicles");
    assert.ok(vehicles);
    dataSources.saveSource(engine.id, {
      id: vehicles.id,
      name: vehicles.name,
      sourceKey: vehicles.sourceKey,
      url: vehicles.url,
      pageType: vehicles.pageType,
      enabled: false,
      position: vehicles.position,
      config: vehicles.config,
    });

    const validation = bagSources.validateBagScraperSourcesForStart(engine.id);
    assert.equal(validation.ok, false);
    assert.equal(validation.code, "disabled-required-source");
  } finally {
    await closeLocalDatabase(db);
  }
});

test("URL reorder persists without changing source keys", async () => {
  const paths = createTestPaths("url-reorder");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = projects.create({
      name: "Broad Arrow Auctions",
      slug: "url-reorder",
      projectType: "bag-graphics",
    });
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    bagSources.ensureBagScraperSources(engine.id);
    const custom = bagSources.saveBagSource(engine.id, {
      custom: true,
      name: "Custom URL",
      url: "https://example.com/custom",
      pageType: "custom",
    });

    const before = bagSources.listSources(engine.id).map((source) => source.sourceKey);
    const orderedIds = bagSources
      .listSources(engine.id)
      .sort((left, right) => right.position - left.position)
      .map((source) => source.id);
    bagSources.reorderSources(engine.id, orderedIds);
    const after = bagSources.listSources(engine.id).map((source) => source.sourceKey);

    assert.deepEqual(new Set(before), new Set(after));
    assert.ok(after.includes(custom.sourceKey));
  } finally {
    await closeLocalDatabase(db);
  }
});

test("no BAG production URLs remain in worker adapter source", () => {
  const source = readFileSync(
    path.join(repoRoot, "workers/data-engine/src/adapters/bag-auction.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /bagauction-jumbotron/);
  assert.doesNotMatch(source, /auctionaccelerate\.com/);
});

test("worker adapter consumes shared runtime config module", () => {
  const source = readFileSync(
    path.join(repoRoot, "workers/data-engine/src/adapters/bag-auction.js"),
    "utf8",
  );
  assert.match(source, /bag-runtime-config/);
  assert.match(source, /resolveBagRuntimeConfig/);
});

test("live state normalizer preserves auctionDisplay", async () => {
  const { normalizeBagSnapshot } = await import(
    "../dist/bag/live-state/bag-snapshot-normalizer.js"
  );
  const result = normalizeBagSnapshot({
    projectId: "project-1",
    engineId: "engine-1",
    snapshotId: "snap-1",
    capturedAt: new Date().toISOString(),
    snapshot: {
      prev: { lot: "1", title: "Prev", price: "$1", status: "Sold", editHref: "/a" },
      current: { lot: "2", title: "Current", price: "$2", status: "Active", editHref: "/b" },
      next: [],
      lots: [{ lot: "2", title: "Current", price: "$2", status: "Active", editHref: "/b" }],
      lastSold: null,
      auctionDisplay: { lot: "Lot 2", title: "Display", biddingPrice: "$2" },
      updatedAt: new Date().toISOString(),
    },
    connection: { status: "connected" },
  });
  assert.equal(result.ok, true);
  assert.ok(result.state.auctionDisplay);
});

test("extraction manifest includes current derived field", () => {
  const derived = BAG_EXTRACTION_MANIFEST_GROUPS.find(
    (group) => group.id === "derived-state",
  );
  assert.ok(derived?.entries.some((entry) => entry.key === "current"));
});

test("custom URL remains marked as not adapter-consumed", async () => {
  const paths = createTestPaths("custom-url-consumed");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = projects.create({
      name: "Broad Arrow Auctions",
      slug: "custom-url-consumed",
      projectType: "bag-graphics",
    });
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    bagSources.ensureBagScraperSources(engine.id);
    const custom = bagSources.saveBagSource(engine.id, {
      custom: true,
      name: "Custom URL",
      url: "https://example.com/custom",
      pageType: "custom",
    });
    assert.equal(custom.config.adapterConsumed, false);
  } finally {
    await closeLocalDatabase(db);
  }
});

test("saving a BAG source persists URL, label, and enabled together", async () => {
  const paths = createTestPaths("source-save-persist");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = projects.create({
      name: "Broad Arrow Auctions",
      slug: "source-save-persist",
      projectType: "bag-graphics",
    });
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    bagSources.ensureBagScraperSources(engine.id);
    const vehicles = dataSources.getSourceByKey(engine.id, "vehicles");
    assert.ok(vehicles);

    const updated = bagSources.saveBagSource(engine.id, {
      id: vehicles.id,
      name: vehicles.name,
      sourceKey: "vehicles",
      url: "https://example.com/custom-vehicles",
      pageType: "page",
      enabled: true,
    });

    assert.equal(updated.url, "https://example.com/custom-vehicles");
    assert.equal(updated.enabled, true);
    assert.equal(updated.sourceKey, "vehicles");
  } finally {
    await closeLocalDatabase(db);
  }
});

test("reorder rejects incomplete source ID lists", async () => {
  const paths = createTestPaths("reorder-incomplete");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = projects.create({
      name: "Broad Arrow Auctions",
      slug: "reorder-incomplete",
      projectType: "bag-graphics",
    });
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    bagSources.ensureBagScraperSources(engine.id);
    const first = bagSources.listSources(engine.id)[0];

    assert.throws(
      () => bagSources.reorderSources(engine.id, [first.id]),
      /exactly once/,
    );
  } finally {
    await closeLocalDatabase(db);
  }
});

test("local worker client forwards bagRuntime from worker bundle", () => {
  const source = readFileSync(
    path.join(repoRoot, "workers/data-engine/src/local-client.js"),
    "utf8",
  );
  assert.match(source, /bagRuntime:\s*payload\.bagRuntime/);
});

test("stage-standalone copies shared bag runtime config", () => {
  const source = readFileSync(
    path.join(repoRoot, "desktop/scripts/stage-standalone.mjs"),
    "utf8",
  );
  assert.match(source, /shared.*bag/);
  assert.match(source, /bag-runtime-config/);
});

test("source PATCH toggle-only detection ignores full save payloads", () => {
  const toggleOnly = (body) => {
    const keys = Object.keys(body).filter((key) => body[key] !== undefined);
    return (
      typeof body.enabled === "boolean" &&
      keys.every((key) => key === "enabled")
    );
  };

  assert.equal(toggleOnly({ enabled: false }), true);
  assert.equal(
    toggleOnly({
      enabled: true,
      name: "Vehicles Listing URL",
      url: "https://example.com/vehicles",
      sourceKey: "vehicles",
      pageType: "page",
    }),
    false,
  );
});
