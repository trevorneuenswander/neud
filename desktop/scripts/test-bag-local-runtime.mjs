import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAG_DEFAULT_SCRAPER_SOURCES,
  BAG_REQUIRED_SOURCE_KEYS,
  validateScraperSourceUrl,
} from "../dist/bag/default-sources.js";
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

  for (const dir of [
    paths.data,
    paths.backups,
    paths.config,
    paths.logs,
    paths.engineLogs,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  return paths;
}

test("projectSupportsDataEngines includes bag-graphics", () => {
  const constantsSource = readFileSync(
    path.join(repoRoot, "src/lib/data-engines/constants.ts"),
    "utf8",
  );

  assert.match(
    constantsSource,
    /PROJECT_DATA_TYPES_WITH_ENGINES\s*=\s*\[[\s\S]*"bag-graphics"/,
  );
  assert.doesNotMatch(
    constantsSource,
    /PROJECT_DATA_TYPES_WITH_ENGINES\s*=\s*\[[\s\S]*"json-ingest"/,
  );
});

test("BAG default sources define all required keys", () => {
  const keys = BAG_DEFAULT_SCRAPER_SOURCES.map((source) => source.sourceKey);
  assert.deepEqual(keys, [...BAG_REQUIRED_SOURCE_KEYS]);
  for (const source of BAG_DEFAULT_SCRAPER_SOURCES) {
    assert.equal(validateScraperSourceUrl(source.url, source.pageType).ok, true);
  }
});

test("ensureBagScraperSources is idempotent", async () => {
  const paths = createTestPaths("bag-sources-idempotent");
  const db = await openLocalDatabase(paths);

  try {
    const dataSources = new DataSourcesRepository(db);
    const projects = new ProjectsRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);

    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (
        id, project_number, name, slug, project_type, status,
        settings_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
    ).run(
      projectId,
      1,
      "BAG Test",
      "bag-test",
      "bag-graphics",
      "active",
      now,
      now,
    );

    const engine = dataSources.ensureWebpageScraper(projectId, "bag-graphics");
    const first = bagSources.ensureBagScraperSources(engine.id);
    assert.equal(first.created.length, 4);
    assert.equal(first.repaired.length, 0);

    const listed = dataSources.listSources(engine.id);
    assert.equal(listed.length, 4);

    const second = bagSources.ensureBagScraperSources(engine.id);
    assert.equal(second.created.length, 0);
    assert.equal(second.repaired.length, 0);
    assert.equal(dataSources.listSources(engine.id).length, 4);
  } finally {
    closeLocalDatabase(db);
  }
});

test("ensureBagScraperSources preserves customized URLs", async () => {
  const paths = createTestPaths("bag-sources-custom-url");
  const db = await openLocalDatabase(paths);

  try {
    const dataSources = new DataSourcesRepository(db);
    const projects = new ProjectsRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);

    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (
        id, project_number, name, slug, project_type, status,
        settings_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
    ).run(
      projectId,
      2,
      "BAG Custom",
      "bag-custom",
      "bag-graphics",
      "active",
      now,
      now,
    );

    const engine = dataSources.ensureWebpageScraper(projectId, "bag-graphics");
    const customUrl = "https://example.com/custom-vehicles";
    dataSources.saveSource(engine.id, {
      name: "Vehicles listing",
      sourceKey: "vehicles",
      url: customUrl,
      pageType: "page",
      enabled: true,
      position: 0,
    });

    const result = bagSources.ensureBagScraperSources(engine.id);
    assert.deepEqual(result.created, ["login", "auction-display", "detail-template"]);
    assert.equal(
      dataSources.getSourceByKey(engine.id, "vehicles")?.url,
      customUrl,
    );
  } finally {
    closeLocalDatabase(db);
  }
});
