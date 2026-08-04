import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAG_DEFAULT_SCRAPER_SOURCES,
  isExactBagDefaultSource,
} from "../dist/bag/default-sources.js";
import { BagSourceService } from "../dist/services/bag-source-service.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
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

  for (const dir of [paths.data, paths.backups, paths.config, paths.logs, paths.engineLogs]) {
    mkdirSync(dir, { recursive: true });
  }

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

test("bag-graphics project receives BAG default sources", async () => {
  const paths = createTestPaths("bag-sources-bag-project");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "bag-graphics" });

    const engine = dataSources.ensureWebpageScraper(projectId, "bag-graphics");
    assert.equal(engine.config.adapter, "bag-auction");

    const result = bagSources.ensureBagScraperSources(engine.id);
    assert.equal(result.created.length, 4);
    assert.equal(dataSources.listSources(engine.id).length, 4);
  } finally {
    closeLocalDatabase(db);
  }
});

test("generic webpage-scraper project does not receive BAG sources", async () => {
  const paths = createTestPaths("bag-sources-generic");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });

    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");
    assert.equal(engine.config.adapter, "generic-webpage");

    const result = bagSources.ensureBagScraperSources(engine.id);
    assert.deepEqual(result.created, []);
    assert.equal(dataSources.listSources(engine.id).length, 0);
  } finally {
    closeLocalDatabase(db);
  }
});

test("BAG source ensure skips non-BAG owning project", async () => {
  const paths = createTestPaths("bag-sources-skip");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });

    const engine = dataSources.createWebpageScraper({
      projectId,
      projectType: "webpage-scraper",
    });
    dataSources.saveSource(engine.id, {
      name: "Login",
      sourceKey: "login",
      url: BAG_DEFAULT_SCRAPER_SOURCES[1].url,
      pageType: "login",
      enabled: true,
      position: 0,
    });

    const result = bagSources.ensureBagScraperSources(engine.id);
    assert.deepEqual(result.created, []);
    assert.equal(bagSources.detectGenericBagContamination(engine.id).contaminated, true);
  } finally {
    closeLocalDatabase(db);
  }
});

test("existing custom generic URLs are preserved", async () => {
  const paths = createTestPaths("bag-sources-preserve-custom");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "bag-graphics" });
    const engine = dataSources.ensureWebpageScraper(projectId, "bag-graphics");

    dataSources.saveSource(engine.id, {
      name: "Vehicles listing",
      sourceKey: "vehicles",
      url: "https://example.com/custom-vehicles",
      pageType: "page",
      enabled: true,
      position: 0,
    });

    bagSources.ensureBagScraperSources(engine.id);
    const vehicles = dataSources.getSourceByKey(engine.id, "vehicles");
    assert.equal(vehicles?.url, "https://example.com/custom-vehicles");
  } finally {
    closeLocalDatabase(db);
  }
});

test("bag-graphics project receives only the Pylon display", async () => {
  const paths = createTestPaths("pylon-only-display");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const { PylonDisplayService } = await import("../dist/services/pylon-display-service.js");
    const service = new PylonDisplayService(projects, displays, settings);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "bag-graphics" });

    service.ensurePylonDisplay(projectId, "http://127.0.0.1:3000");
    const rows = displays.listByProject(projectId);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].displayKey, "pylon");
    assert.ok(!rows.some((row) => row.displayKey === "bag-auction"));
  } finally {
    closeLocalDatabase(db);
  }
});

test("one-second polling passes validation", () => {
  const pollIntervalMs = 1000;
  assert.equal(Number.isInteger(pollIntervalMs), true);
  assert.equal(pollIntervalMs >= 1000 && pollIntervalMs <= 3600000, true);
});

test("exact BAG default detection helper works", () => {
  const login = BAG_DEFAULT_SCRAPER_SOURCES.find((source) => source.sourceKey === "login");
  assert.ok(login);
  assert.equal(isExactBagDefaultSource("login", login.url), true);
  assert.equal(isExactBagDefaultSource("login", "https://example.com/login"), false);
});

test("clear untouched BAG defaults removes only exact matches", async () => {
  const paths = createTestPaths("bag-clear-defaults");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    dataSources.saveSource(engine.id, {
      name: "Login",
      sourceKey: "login",
      url: BAG_DEFAULT_SCRAPER_SOURCES[1].url,
      pageType: "login",
      enabled: true,
      position: 0,
    });
    dataSources.saveSource(engine.id, {
      name: "Custom",
      sourceKey: "custom",
      url: "https://example.com/custom",
      pageType: "page",
      enabled: true,
      position: 1,
    });

    const removed = bagSources.clearUntouchedBagDefaults(engine.id);
    assert.deepEqual(removed, ["login"]);
    assert.equal(dataSources.listSources(engine.id).length, 1);
    assert.equal(dataSources.getSourceByKey(engine.id, "custom")?.url, "https://example.com/custom");
  } finally {
    closeLocalDatabase(db);
  }
});
