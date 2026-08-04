import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAG_DEFAULT_MAX_DETAIL_CHECKS,
  BAG_DEFAULT_POLL_INTERVAL_MS,
  BAG_DEFAULT_SCRAPER_SOURCES,
  BAG_LOGIN_CONFIG,
  validateScraperSourceUrl,
  urlContainsEmbeddedCredentials,
} from "../dist/bag/default-sources.js";
import {
  BAG_EXTRACTION_MANIFEST_GROUPS,
  BAG_LOGIN_SELECTOR_DEFINITIONS,
} from "../dist/bag/config/bag-extraction-manifest.js";
import { BagProjectRepairService } from "../dist/services/bag-project-repair-service.js";
import { BagSourceService } from "../dist/services/bag-source-service.js";
import { CredentialStore } from "../dist/services/credential-store.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    repoRoot: path.resolve(__dirname, "../.."),
  };

  for (const dir of [paths.data, paths.backups, paths.config, paths.logs, paths.engineLogs, paths.credentialsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  return paths;
}

function createBagProject(projects, name = "Broad Arrow Auctions", slug = "broad-arrow-auctions") {
  return projects.create({
    name,
    slug,
    projectType: "bag-graphics",
  });
}

test("Broad Arrow repair adds all standard sources", async () => {
  const paths = createTestPaths("broad-arrow-repair");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const settings = new AppSettingsRepository(db);
    const credentials = new CredentialStore(paths);
    const repair = new BagProjectRepairService(
      projects,
      dataSources,
      bagSources,
      credentials,
      settings,
    );

    createBagProject(projects);
    const result = repair.repairBroadArrowConfiguration();
    assert.equal(result.found, true);

    const project = projects.getBySlug("broad-arrow-auctions");
    assert.ok(project);
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    const keys = dataSources.listSources(engine.id).map((source) => source.sourceKey);
    assert.ok(keys.includes("vehicles"));
    assert.ok(keys.includes("login"));
    assert.ok(keys.includes("auction-display"));
    assert.ok(keys.includes("detail-template"));
  } finally {
    closeLocalDatabase(db);
  }
});

test("repair is idempotent and preserves customized URLs", async () => {
  const paths = createTestPaths("broad-arrow-custom-url");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const settings = new AppSettingsRepository(db);
    const credentials = new CredentialStore(paths);
    const repair = new BagProjectRepairService(
      projects,
      dataSources,
      bagSources,
      credentials,
      settings,
    );

    createBagProject(projects);
    repair.repairBroadArrowConfiguration();
    const project = projects.getBySlug("broad-arrow-auctions");
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    const customUrl = "https://example.test/custom-vehicles";
    bagSources.saveBagSource(engine.id, {
      sourceKey: "vehicles",
      name: "Vehicles Listing URL",
      url: customUrl,
      pageType: "page",
    });

    repair.repairBroadArrowConfiguration();
    const vehicles = dataSources.getSourceByKey(engine.id, "vehicles");
    assert.equal(vehicles?.url, customUrl);

    const second = repair.repairBroadArrowConfiguration();
    assert.equal(second.sourcesCreated.length, 0);
  } finally {
    closeLocalDatabase(db);
  }
});

test("generic projects do not receive Broad Arrow sources from ensure", async () => {
  const paths = createTestPaths("generic-no-bag-sources");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = projects.create({
      name: "Generic",
      slug: "generic-web",
      projectType: "webpage-scraper",
    });
    const engine = dataSources.ensureWebpageScraper(project.id, "webpage-scraper");
    const result = bagSources.ensureBagScraperSources(engine.id);
    assert.deepEqual(result.created, []);
    assert.equal(dataSources.listSources(engine.id).length, 0);
  } finally {
    closeLocalDatabase(db);
  }
});

test("required URL removal is rejected", async () => {
  const paths = createTestPaths("required-source-delete");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = createBagProject(projects);
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    bagSources.ensureBagScraperSources(engine.id);
    const vehicles = dataSources.getSourceByKey(engine.id, "vehicles");
    assert.throws(
      () => bagSources.removeSource(engine.id, vehicles.id),
      /required-source/,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("embedded URL credentials and unsupported schemes are rejected", () => {
  assert.equal(
    validateScraperSourceUrl("javascript:alert(1)").ok,
    false,
  );
  assert.equal(
    validateScraperSourceUrl("https://user:pass@example.com/page").ok,
    false,
  );
  assert.equal(urlContainsEmbeddedCredentials("https://user:pass@example.com/page"), true);
  assert.equal(
    validateScraperSourceUrl("/vehicles/{vehicleId}/edit", "detail-template").ok,
    true,
  );
});

test("extraction manifest and login selectors are populated", () => {
  assert.ok(BAG_EXTRACTION_MANIFEST_GROUPS.length >= 4);
  const listing = BAG_EXTRACTION_MANIFEST_GROUPS.find((group) => group.id === "vehicles-listing");
  assert.ok(listing?.entries.some((entry) => entry.key === "lot"));
  assert.ok(listing?.entries.some((entry) => entry.key === "editHref"));

  const detail = BAG_EXTRACTION_MANIFEST_GROUPS.find((group) => group.id === "vehicle-detail");
  assert.ok(detail?.entries.some((entry) => entry.key === "sold"));

  const display = BAG_EXTRACTION_MANIFEST_GROUPS.find((group) => group.id === "auction-display");
  assert.ok(display?.entries.some((entry) => entry.key === "auctionDisplay.photos"));

  const derived = BAG_EXTRACTION_MANIFEST_GROUPS.find((group) => group.id === "derived-state");
  assert.ok(derived?.entries.some((entry) => entry.key === "lastSold"));

  assert.equal(BAG_LOGIN_SELECTOR_DEFINITIONS[0]?.value, BAG_LOGIN_CONFIG.usernameSelectors);
});

test("Broad Arrow default poll and detail settings", async () => {
  const paths = createTestPaths("bag-default-settings");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const project = createBagProject(projects);
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    const settings = dataSources.getSettings(engine.id);
    assert.equal(settings?.pollIntervalMs, BAG_DEFAULT_POLL_INTERVAL_MS);
    assert.equal(settings?.maxDetailChecksPerPoll, BAG_DEFAULT_MAX_DETAIL_CHECKS);
  } finally {
    closeLocalDatabase(db);
  }
});

test("credential meta never includes password values", () => {
  const paths = createTestPaths("credential-meta");
  const credentials = new CredentialStore(paths);
  const engineId = crypto.randomUUID();
  const meta = credentials.getCredentialMeta(engineId);
  assert.equal(meta.hasCredentials, false);
  assert.equal(meta.email, null);
  assert.equal(Object.prototype.hasOwnProperty.call(meta, "password"), false);
});

test("renderer credentials include decrypted password for local desktop", async (t) => {
  let encryptionAvailable = false;
  try {
    const electron = await import("electron");
    encryptionAvailable = electron.safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    encryptionAvailable = false;
  }

  if (!encryptionAvailable) {
    t.skip("Electron secure storage is unavailable in this test runtime.");
    return;
  }

  const paths = createTestPaths("credential-renderer");
  const credentials = new CredentialStore(paths);
  const engineId = crypto.randomUUID();
  credentials.saveCredentials(engineId, {
    email: "auction@example.com",
    password: "visible-test-password",
  });

  const rendererCreds = credentials.getCredentialsForRenderer(engineId);
  const workerCreds = credentials.getCredentialsForWorker(engineId);
  assert.deepEqual(rendererCreds, workerCreds);
  assert.equal(rendererCreds?.password, "visible-test-password");
});

test("custom URLs can be added and removed", async () => {
  const paths = createTestPaths("custom-url-crud");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const project = createBagProject(projects);
    const engine = dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    bagSources.ensureBagScraperSources(engine.id);

    const created = bagSources.addCustomSource(engine.id, {
      name: "Reference page",
      url: "https://example.test/reference",
      pageType: "custom",
    });
    assert.equal(created.config.adapterConsumed, false);

    bagSources.removeSource(engine.id, created.id);
    assert.equal(
      dataSources.listSources(engine.id).some((source) => source.id === created.id),
      false,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("standard sources use stable sort order", () => {
  const positions = BAG_DEFAULT_SCRAPER_SOURCES.map((source) => source.position);
  assert.deepEqual(positions, [10, 20, 30, 40]);
});
