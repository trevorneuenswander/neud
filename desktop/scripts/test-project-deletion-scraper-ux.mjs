import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BagLiveStateEvents } from "../dist/bag/live-state/bag-live-state-events.js";
import { BagLiveStateRepository } from "../dist/bag/live-state/bag-live-state-repository.js";
import { BagLiveStateService } from "../dist/bag/live-state/bag-live-state-service.js";
import { BagManualEventsRepository } from "../dist/bag/live-state/bag-manual-events-repository.js";
import { CredentialStore } from "../dist/services/credential-store.js";
import { BagDisplayService } from "../dist/services/bag-display-service.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { BagSourceService } from "../dist/services/bag-source-service.js";
import { GenericScraperService } from "../dist/services/generic-scraper-service.js";
import { ProjectDeletionService } from "../dist/services/project-deletion-service.js";
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

  for (const dir of [
    paths.data,
    paths.backups,
    paths.config,
    paths.logs,
    paths.engineLogs,
    paths.projects,
    paths.exports,
    paths.credentialsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return paths;
}

function seedProject(db, { projectId, projectType, slug = "test-project", name = "Test Project" }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, project_number, name, slug, project_type, status,
      settings_json, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
  ).run(projectId, 1, name, slug, projectType, "active", now, now);
}

function createAuthStub(role) {
  return {
    isAccessAllowed: () => Boolean(role),
    getAuthenticatedUser: () =>
      role
        ? {
            userId: crypto.randomUUID(),
            email: "user@example.com",
            role,
          }
        : null,
    getStatus: () => ({
      role,
      allowed: Boolean(role),
    }),
    isPlatformAdmin: () => role === "owner" || role === "admin",
    canCreateProject: () => role === "admin" || role === "owner",
    canDeleteProject: () => role === "admin" || role === "owner",
  };
}

test("admin can delete a project", async () => {
  const paths = createTestPaths("delete-admin");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const events = new BagLiveStateEvents();
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "Test Project",
    });
    assert.equal(result.ok, true);
    assert.equal(projects.getById(projectId), null);
    assert.equal(dataSources.listByProject(projectId).length, 0);
  } finally {
    closeLocalDatabase(db);
  }
});

test("non-admin cannot delete a project", async () => {
  const paths = createTestPaths("delete-non-admin");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("user");
    const events = new BagLiveStateEvents();
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });

    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "Test Project",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "forbidden");
  } finally {
    closeLocalDatabase(db);
  }
});

test("confirmation-name mismatch blocks deletion", async () => {
  const paths = createTestPaths("delete-confirm");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const events = new BagLiveStateEvents();
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });

    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "Wrong Name",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "confirmation-mismatch");
    assert.notEqual(projects.getById(projectId), null);
  } finally {
    closeLocalDatabase(db);
  }
});

test("generic scraper ensures blank page source row", async () => {
  const paths = createTestPaths("generic-page-source");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const generic = new GenericScraperService(dataSources, projects);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    generic.ensureGenericScraperSources(engine.id);
    const page = dataSources.getSourceByKey(engine.id, "page");
    assert.ok(page);
    assert.equal(page.url, "");
  } finally {
    closeLocalDatabase(db);
  }
});

test("remote execution mode is rejected by local data service", async () => {
  const paths = createTestPaths("remote-blocked");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const displays = new DisplaysRepository(db);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");
    dataSources.updateConfig(engine.id, {
      ...engine.config,
      execution_mode: "remote-worker",
    });

    const { LocalDataService } = await import("../dist/services/local-data-service.js");
    const { BagSourceService } = await import("../dist/services/bag-source-service.js");
    const { BagDisplayService } = await import("../dist/services/bag-display-service.js");
    const { AppSettingsRepository } = await import("../dist/repositories/app-settings-repository.js");
    const bagSources = new BagSourceService(dataSources, projects);
    const genericScraper = new GenericScraperService(dataSources, projects);
    const bagLiveStateRepository = new BagLiveStateRepository(db);
    const bagManualEvents = new BagManualEventsRepository(db);
    const bagEvents = new BagLiveStateEvents();
    const bagLiveState = new BagLiveStateService(
      projects,
      dataSources,
      bagLiveStateRepository,
      bagEvents,
      bagManualEvents,
    );
    const bagDisplays = new BagDisplayService(projects, displays, bagLiveState);
    const settings = new AppSettingsRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const projectDeletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      bagEvents,
    );
    const localData = new LocalDataService(
      projects,
      dataSources,
      displays,
      settings,
      bagSources,
      genericScraper,
      bagDisplays,
      bagLiveState,
      paths,
      auth,
      projectDeletion,
    );

    assert.throws(
      () => localData.setExecutionMode(engine.id, "remote-worker"),
      /Remote Worker execution is not available yet/,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("generic snapshot is not processed as BAG live state after deletion setup", async () => {
  const paths = createTestPaths("bag-live-delete");
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
    assert.equal(bagLiveState.processSnapshot(engine.id, snapshot), null);
  } finally {
    closeLocalDatabase(db);
  }
});

test("user exports directory is not removed during project cleanup", async () => {
  const paths = createTestPaths("exports-preserved");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const events = new BagLiveStateEvents();
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );
    const exportFile = path.join(paths.exports, "user-export.zip");
    fs.writeFileSync(exportFile, "keep");

    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper", name: "Delete Me" });
    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "Delete Me",
    });
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(exportFile), true);
  } finally {
    closeLocalDatabase(db);
  }
});

test("unauthenticated request cannot delete a project", async () => {
  const paths = createTestPaths("delete-unauth");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub(null);
    const events = new BagLiveStateEvents();
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });

    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "Test Project",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "unauthorized");
  } finally {
    closeLocalDatabase(db);
  }
});

test("deleting a BAG project removes live state, manual events, and displays", async () => {
  const paths = createTestPaths("delete-bag-cascade");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const displays = new DisplaysRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const events = new BagLiveStateEvents();
    const bagLiveStateRepository = new BagLiveStateRepository(db);
    const manualEvents = new BagManualEventsRepository(db);
    const bagLiveState = new BagLiveStateService(
      projects,
      dataSources,
      bagLiveStateRepository,
      events,
      manualEvents,
    );
    const bagDisplays = new BagDisplayService(projects, displays, bagLiveState);
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );

    const projectId = crypto.randomUUID();
    seedProject(db, {
      projectId,
      projectType: "bag-graphics",
      slug: "bag-delete",
      name: "BAG Delete Test",
    });
    dataSources.ensureWebpageScraper(projectId, "bag-graphics");
    bagDisplays.ensureBagDisplay(projectId, "http://127.0.0.1:8070");
    bagLiveState.ensureLiveState(projectId);
    db.prepare(
      `INSERT INTO bag_manual_events (
        id, project_id, event_type, details_json, created_at
      ) VALUES (?, ?, 'manual-enter', '{}', ?)`,
    ).run(crypto.randomUUID(), projectId, new Date().toISOString());

    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "BAG Delete Test",
    });
    assert.equal(result.ok, true);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM bag_live_state WHERE project_id = ?").get(projectId)
        .count,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM bag_manual_events WHERE project_id = ?").get(projectId)
        .count,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM displays WHERE project_id = ?").get(projectId).count,
      0,
    );
    assert.equal(dataSources.listByProject(projectId).length, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM data_source_sources").get().count,
      0,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("running engines are stopped before project deletion", async () => {
  const paths = createTestPaths("delete-stop-engine");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const events = new BagLiveStateEvents();
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );
    const stopped = [];
    deletion.setEngineManager({
      stop: async (engineId) => {
        stopped.push(engineId);
      },
    });

    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper", name: "Stop Me" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "Stop Me",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(stopped, [engine.id]);
  } finally {
    closeLocalDatabase(db);
  }
});

test("existing remote-configured engines normalize to Desktop on detail load", async () => {
  const paths = createTestPaths("remote-normalize");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const displays = new DisplaysRepository(db);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");
    dataSources.updateConfig(engine.id, {
      ...engine.config,
      execution_mode: "remote-worker",
    });

    const { LocalDataService } = await import("../dist/services/local-data-service.js");
    const { BagSourceService } = await import("../dist/services/bag-source-service.js");
    const { BagDisplayService } = await import("../dist/services/bag-display-service.js");
    const { AppSettingsRepository } = await import("../dist/repositories/app-settings-repository.js");
    const bagSources = new BagSourceService(dataSources, projects);
    const genericScraper = new GenericScraperService(dataSources, projects);
    const bagLiveStateRepository = new BagLiveStateRepository(db);
    const bagManualEvents = new BagManualEventsRepository(db);
    const bagEvents = new BagLiveStateEvents();
    const bagLiveState = new BagLiveStateService(
      projects,
      dataSources,
      bagLiveStateRepository,
      bagEvents,
      bagManualEvents,
    );
    const bagDisplays = new BagDisplayService(projects, displays, bagLiveState);
    const settings = new AppSettingsRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const projectDeletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      bagEvents,
    );
    const localData = new LocalDataService(
      projects,
      dataSources,
      displays,
      settings,
      bagSources,
      genericScraper,
      bagDisplays,
      bagLiveState,
      paths,
      auth,
      projectDeletion,
    );

    localData.getEngineDetailBundle(engine.id);
    const updated = dataSources.getById(engine.id);
    assert.equal(updated?.config.execution_mode, "local-desktop");
    const logs = dataSources.getLogs(engine.id, undefined, 5);
    assert.equal(logs.some((log) => log.eventType === "engine.execution_mode_normalized"), true);
  } finally {
    closeLocalDatabase(db);
  }
});

test("new engines default to Desktop execution mode", async () => {
  const paths = createTestPaths("desktop-default");
  const db = await openLocalDatabase(paths);

  try {
    const dataSources = new DataSourcesRepository(db);
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper" });
    const engine = dataSources.ensureWebpageScraper(projectId, "webpage-scraper");
    assert.equal(engine.config.execution_mode, "local-desktop");
  } finally {
    closeLocalDatabase(db);
  }
});

test("owner can delete a project", async () => {
  const paths = createTestPaths("delete-owner");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("owner");
    const events = new BagLiveStateEvents();
    const deletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      events,
    );
    const projectId = crypto.randomUUID();
    seedProject(db, { projectId, projectType: "webpage-scraper", name: "Owner Delete" });
    dataSources.ensureWebpageScraper(projectId, "webpage-scraper");

    const result = await deletion.deleteProject({
      projectId,
      confirmationName: "Owner Delete",
    });
    assert.equal(result.ok, true);
    assert.equal(projects.getById(projectId), null);
  } finally {
    closeLocalDatabase(db);
  }
});

test("owner can create a project through local data service", async () => {
  const paths = createTestPaths("create-owner");
  const db = await openLocalDatabase(paths);

  try {
    const { LocalDataService } = await import("../dist/services/local-data-service.js");
    const { AppSettingsRepository } = await import("../dist/repositories/app-settings-repository.js");
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const genericScraper = new GenericScraperService(dataSources, projects);
    const bagLiveStateRepository = new BagLiveStateRepository(db);
    const bagManualEvents = new BagManualEventsRepository(db);
    const bagEvents = new BagLiveStateEvents();
    const bagLiveState = new BagLiveStateService(
      projects,
      dataSources,
      bagLiveStateRepository,
      bagEvents,
      bagManualEvents,
    );
    const bagDisplays = new BagDisplayService(projects, displays, bagLiveState);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("owner");
    const projectDeletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      bagEvents,
    );
    const localData = new LocalDataService(
      projects,
      dataSources,
      displays,
      settings,
      bagSources,
      genericScraper,
      bagDisplays,
      bagLiveState,
      paths,
      auth,
      projectDeletion,
    );

    const created = localData.createProject({
      name: "Owner Created",
      slug: "owner-created",
      projectType: "webpage-scraper",
    });
    assert.equal(created.slug, "owner-created");
  } finally {
    closeLocalDatabase(db);
  }
});

test("operator cannot create a project through local data service", async () => {
  const paths = createTestPaths("create-operator-blocked");
  const db = await openLocalDatabase(paths);

  try {
    const { LocalDataService } = await import("../dist/services/local-data-service.js");
    const { AppSettingsRepository } = await import("../dist/repositories/app-settings-repository.js");
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const genericScraper = new GenericScraperService(dataSources, projects);
    const bagLiveStateRepository = new BagLiveStateRepository(db);
    const bagManualEvents = new BagManualEventsRepository(db);
    const bagEvents = new BagLiveStateEvents();
    const bagLiveState = new BagLiveStateService(
      projects,
      dataSources,
      bagLiveStateRepository,
      bagEvents,
      bagManualEvents,
    );
    const bagDisplays = new BagDisplayService(projects, displays, bagLiveState);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("operator");
    const projectDeletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      bagEvents,
    );
    const localData = new LocalDataService(
      projects,
      dataSources,
      displays,
      settings,
      bagSources,
      genericScraper,
      bagDisplays,
      bagLiveState,
      paths,
      auth,
      projectDeletion,
    );

    assert.throws(
      () =>
        localData.createProject({
          name: "Blocked",
          slug: "blocked-operator",
          projectType: "webpage-scraper",
        }),
      /Only platform owners and admins may create projects/,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("admin can create a project through local data service", async () => {
  const paths = createTestPaths("create-admin");
  const db = await openLocalDatabase(paths);

  try {
    const { LocalDataService } = await import("../dist/services/local-data-service.js");
    const { AppSettingsRepository } = await import("../dist/repositories/app-settings-repository.js");
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const bagSources = new BagSourceService(dataSources, projects);
    const genericScraper = new GenericScraperService(dataSources, projects);
    const bagLiveStateRepository = new BagLiveStateRepository(db);
    const bagManualEvents = new BagManualEventsRepository(db);
    const bagEvents = new BagLiveStateEvents();
    const bagLiveState = new BagLiveStateService(
      projects,
      dataSources,
      bagLiveStateRepository,
      bagEvents,
      bagManualEvents,
    );
    const bagDisplays = new BagDisplayService(projects, displays, bagLiveState);
    const credentials = new CredentialStore(paths);
    const auth = createAuthStub("admin");
    const projectDeletion = new ProjectDeletionService(
      projects,
      dataSources,
      credentials,
      paths,
      auth,
      bagEvents,
    );
    const localData = new LocalDataService(
      projects,
      dataSources,
      displays,
      settings,
      bagSources,
      genericScraper,
      bagDisplays,
      bagLiveState,
      paths,
      auth,
      projectDeletion,
    );

    const project = localData.createProject({
      name: "Admin Created",
      slug: "admin-created",
      projectType: "webpage-scraper",
    });
    assert.equal(project.name, "Admin Created");
  } finally {
    closeLocalDatabase(db);
  }
});

test("credential meta returns email but never password", async (t) => {
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

  const paths = createTestPaths("credential-meta");
  const db = await openLocalDatabase(paths);

  try {
    const credentials = new CredentialStore(paths);
    const engineId = crypto.randomUUID();
    credentials.saveCredentials(engineId, {
      email: "placeholder@example.com",
      password: "placeholder-password",
    });
    const meta = credentials.getCredentialMeta(engineId);
    assert.equal(meta.hasCredentials, true);
    assert.equal(meta.email, "placeholder@example.com");
    assert.ok(!("password" in meta));
  } finally {
    closeLocalDatabase(db);
  }
});

test("blank password submission is rejected", async (t) => {
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

  const paths = createTestPaths("credential-required");
  const db = await openLocalDatabase(paths);

  try {
    const credentials = new CredentialStore(paths);
    const engineId = crypto.randomUUID();
    credentials.saveCredentials(engineId, {
      email: "first@example.com",
      password: "first-password",
    });
    assert.throws(
      () =>
        credentials.saveCredentials(engineId, {
          email: "updated@example.com",
          password: "",
        }),
      /Invalid password/,
    );
    const workerCreds = credentials.getCredentialsForWorker(engineId);
    assert.equal(workerCreds?.email, "first@example.com");
    assert.equal(workerCreds?.password, "first-password");
  } finally {
    closeLocalDatabase(db);
  }
});

test("BAG extraction definitions are populated", async () => {
  const { BAG_EXTRACTION_DEFINITIONS } = await import(
    "../dist/bag/extraction-definitions.js"
  );
  assert.ok(BAG_EXTRACTION_DEFINITIONS.length >= 8);
  assert.ok(BAG_EXTRACTION_DEFINITIONS.some((item) => item.key === "prev" || item.key === "previousLot"));
});
