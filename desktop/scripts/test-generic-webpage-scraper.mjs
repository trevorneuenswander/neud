import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAG_DEFAULT_SCRAPER_SOURCES,
} from "../dist/bag/default-sources.js";
import { BagLiveStateService } from "../dist/bag/live-state/bag-live-state-service.js";
import { BagLiveStateRepository } from "../dist/bag/live-state/bag-live-state-repository.js";
import { BagLiveStateEvents } from "../dist/bag/live-state/bag-live-state-events.js";
import { BagManualEventsRepository } from "../dist/bag/live-state/bag-manual-events-repository.js";
import { GenericScraperService } from "../dist/services/generic-scraper-service.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import {
  SCRAPER_ADAPTERS,
  validateAdapterCompatibility,
} from "../dist/scraper/adapters.js";
import { validateGenericScraperForStart } from "../dist/scraper/generic-scraper-validation.js";

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

function seedProject(db, { projectId, projectType, slug = "test-project" }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, project_number, name, slug, project_type, status,
      settings_json, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
  ).run(projectId, 1, "Test Project", slug, projectType, "active", now, now);
}

test("new generic engine receives generic-webpage adapter", async () => {
  const paths = createTestPaths("generic-adapter-new");
  const db = await openLocalDatabase(paths);

  try {
    const dataSources = new DataSourcesRepository(db);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });

    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");
    assert.equal(engine.config.adapter, SCRAPER_ADAPTERS.GENERIC_WEBPAGE);
    assert.deepEqual(engine.config.fields, []);
  } finally {
    closeLocalDatabase(db);
  }
});

test("new BAG engine receives bag-auction adapter", async () => {
  const paths = createTestPaths("bag-adapter-new");
  const db = await openLocalDatabase(paths);

  try {
    const dataSources = new DataSourcesRepository(db);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "bag-graphics" });

    const engine = dataSources.ensureWebpageScraper(projectId, "bag-graphics");
    assert.equal(engine.config.adapter, SCRAPER_ADAPTERS.BAG_AUCTION);
  } finally {
    closeLocalDatabase(db);
  }
});

test("incompatible project type and adapter is rejected", () => {
  const bagOnGeneric = validateAdapterCompatibility(
    "webpage-scraper",
    SCRAPER_ADAPTERS.BAG_AUCTION,
  );
  assert.equal(bagOnGeneric.ok, false);
  assert.equal(bagOnGeneric.code, "incompatible-adapter");

  const genericOnBag = validateAdapterCompatibility(
    "bag-graphics",
    SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
  );
  assert.equal(genericOnBag.ok, false);
  assert.equal(genericOnBag.code, "incompatible-adapter");
});

test("generic engine requires page url before start", async () => {
  const paths = createTestPaths("generic-page-url");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const generic = new GenericScraperService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    const result = generic.validateForStart(engine.id, false);
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing-page-url");
    assert.match(result.message, /Page URL is not configured/);
  } finally {
    closeLocalDatabase(db);
  }
});

test("optional login url can remain blank", () => {
  const result = validateGenericScraperForStart({
    projectType: "webpage-scraper",
    adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
    pageUrl: "https://example.com/page",
    loginUrl: "",
    engineConfig: {
      adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
      fields: [{ key: "title", label: "Title", selector: "h1", extraction: "text" }],
    },
    hasCredentials: false,
  });
  assert.equal(result.ok, true);
});

test("login-enabled configuration requires selectors and credentials", () => {
  const missingSelectors = validateGenericScraperForStart({
    projectType: "webpage-scraper",
    adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
    pageUrl: "https://example.com/page",
    loginUrl: "https://example.com/login",
    engineConfig: {
      adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
      fields: [{ key: "title", label: "Title", selector: "h1", extraction: "text" }],
    },
    hasCredentials: false,
  });
  assert.equal(missingSelectors.ok, false);
  assert.equal(missingSelectors.code, "missing-login-selectors");

  const missingCredentials = validateGenericScraperForStart({
    projectType: "webpage-scraper",
    adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
    pageUrl: "https://example.com/page",
    loginUrl: "https://example.com/login",
    engineConfig: {
      adapter: SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
      fields: [{ key: "title", label: "Title", selector: "h1", extraction: "text" }],
      login: {
        usernameSelector: "#user",
        passwordSelector: "#pass",
        submitSelector: "button",
      },
    },
    hasCredentials: false,
  });
  assert.equal(missingCredentials.ok, false);
  assert.equal(missingCredentials.code, "missing-credentials");
});

test("conversion preserves customized urls and does not affect bag projects", async () => {
  const paths = createTestPaths("generic-convert");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const generic = new GenericScraperService(dataSources, projects);
    const genericProjectId = crypto.randomUUID();
    seedProject(db, { projectId: genericProjectId, projectType: "webpage-scraper" });
    const genericEngine = dataSources.createWebpageScraper({
      projectId: genericProjectId,
      projectType: "webpage-scraper",
    });
    dataSources.updateConfig(genericEngine.id, {
      adapter: SCRAPER_ADAPTERS.BAG_AUCTION,
      execution_mode: "local-desktop",
    });
    dataSources.saveSource(genericEngine.id, {
      name: "Custom vehicles",
      sourceKey: "vehicles",
      url: "https://custom.example.com/vehicles",
      pageType: "page",
      enabled: true,
      position: 0,
    });
    dataSources.saveSource(genericEngine.id, {
      name: "Login",
      sourceKey: "login",
      url: BAG_DEFAULT_SCRAPER_SOURCES[1].url,
      pageType: "login",
      enabled: true,
      position: 1,
    });

    const result = generic.convertBagAdapterToGeneric(genericEngine.id, {
      removeUntouchedBagUrls: true,
    });
    assert.equal(result.converted, true);
    assert.deepEqual(result.removedBagSources, ["login"]);
    assert.equal(
      dataSources.getById(genericEngine.id)?.config.adapter,
      SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
    );
    assert.equal(
      dataSources.getSourceByKey(genericEngine.id, "vehicles")?.url,
      "https://custom.example.com/vehicles",
    );

    const bagProjectId = crypto.randomUUID();
    seedProject(db, {
      projectId: bagProjectId,
      projectType: "bag-graphics",
      slug: `bag-project-${crypto.randomUUID().slice(0, 8)}`,
    });
    const bagEngine = dataSources.ensureWebpageScraper(bagProjectId, "bag-graphics");
    assert.throws(
      () => generic.convertBagAdapterToGeneric(bagEngine.id),
      /Only generic webpage-scraper projects can be converted/,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("generic snapshot is not processed as BAG live state", async () => {
  const paths = createTestPaths("generic-live-state");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const repository = new BagLiveStateRepository(db);
    const events = new BagLiveStateEvents();
    const manualEvents = new BagManualEventsRepository(db);
    const bagLiveState = new BagLiveStateService(
      projects,
      dataSources,
      repository,
      events,
      manualEvents,
    );

    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    const snapshot = dataSources.insertSnapshot(engine.id, {
      data: {
        schemaVersion: 1,
        adapter: "generic-webpage",
        sourceUrl: "https://example.com",
        capturedAt: new Date().toISOString(),
        page: { finalUrl: "https://example.com" },
        values: {},
      },
    });

    const processed = bagLiveState.processSnapshot(engine.id, snapshot);
    assert.equal(processed, null);
    assert.equal(repository.get(projectId), null);
  } finally {
    closeLocalDatabase(db);
  }
});

test("adapter contamination is detected on generic projects", async () => {
  const paths = createTestPaths("generic-contamination");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const generic = new GenericScraperService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.createWebpageScraper({ projectId, projectType: "webpage-scraper" });
    dataSources.updateConfig(engine.id, {
      adapter: SCRAPER_ADAPTERS.BAG_AUCTION,
      execution_mode: "local-desktop",
    });

    const detection = generic.detectGenericAdapterContamination(engine.id);
    assert.equal(detection.contaminated, true);
    assert.equal(detection.adapter, SCRAPER_ADAPTERS.BAG_AUCTION);
  } finally {
    closeLocalDatabase(db);
  }
});

test("one-second polling is accepted in settings", async () => {
  const paths = createTestPaths("generic-poll-rate");
  const db = await openLocalDatabase(paths);

  try {
    const dataSources = new DataSourcesRepository(db);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");
    const current = dataSources.getSettings(engine.id);
    dataSources.updateSettings(engine.id, {
      pollIntervalMs: 1000,
      detailsTtlMs: current?.detailsTtlMs ?? 300000,
      maxDetailChecksPerPoll: current?.maxDetailChecksPerPoll ?? 3,
      headless: current?.headless ?? true,
    });
    assert.equal(dataSources.getSettings(engine.id)?.pollIntervalMs, 1000);
  } finally {
    closeLocalDatabase(db);
  }
});

test("save generic config stores fields in engine config not credentials", async () => {
  const paths = createTestPaths("generic-save-config");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const generic = new GenericScraperService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    generic.saveGenericConfig(engine.id, {
      pageUrl: "https://example.com/products",
      fields: [
        { key: "title", label: "Title", selector: "h1", extraction: "text" },
      ],
    });

    const saved = dataSources.getById(engine.id);
    assert.equal(saved?.config.fields?.length, 1);
    assert.equal(JSON.stringify(saved?.config).includes("password"), false);
    assert.equal(
      dataSources.getSourceByKey(engine.id, "page")?.url,
      "https://example.com/products",
    );
  } finally {
    closeLocalDatabase(db);
  }
});
