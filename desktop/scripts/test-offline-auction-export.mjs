import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OfflineAuctionExportService } from "../dist/services/offline-auction-export-service.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { CredentialStore } from "../dist/services/credential-store.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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

  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.backups, { recursive: true });
  fs.mkdirSync(paths.config, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(paths.engineLogs, { recursive: true });
  return paths;
}

const sampleSnapshot = {
  current: { lot: "101", title: "Current Vehicle", price: "$15,000", status: "Active" },
  lots: [
    {
      lot: "101",
      title: "Current Vehicle",
      price: "$15,000",
      status: "Active",
      editHref: "/vehicles/6041/edit",
    },
    {
      lot: "102",
      title: "Next Vehicle",
      price: "",
      status: null,
      editHref: "/vehicles/6042/edit",
    },
  ],
};

function seedBagProject(projects, dataSources) {
  const project = projects.create({
    name: "Broad Arrow Auctions",
    slug: `broad-arrow-${crypto.randomUUID().slice(0, 6)}`,
    projectType: "bag-graphics",
  });
  dataSources.ensureWebpageScraper(project.id, "bag-graphics");
  const engine = dataSources.getByEngineKey(project.id, "webpage-scraper");
  assert.ok(engine);
  dataSources.insertSnapshot(engine.id, {
    data: sampleSnapshot,
    recordCount: 2,
    payloadSizeBytes: 100,
    durationMs: 10,
    capturedAt: new Date().toISOString(),
  });
  return { project, engine };
}

test("offline export service wiring exists in desktop shell", () => {
  const main = readSrc("desktop/src/main.ts");
  const preload = readSrc("desktop/src/preload.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");

  assert.ok(main.includes("OfflineAuctionExportService"));
  assert.ok(main.includes("registerOfflineAuctionIpc"));
  assert.ok(preload.includes("offlineAuction"));
  assert.ok(controller.includes("Download Current Webpage"));
  assert.ok(!ipc.includes("showSaveDialog"));
  assert.ok(ipc.includes("getAuctionDataDirectory"));
});

test("export requires scraper snapshot and worker export path", () => {
  const serviceSource = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const bridge = readSrc("desktop/src/services/worker-auction-export-bridge.ts");
  const main = readSrc("desktop/src/main.ts");

  assert.match(serviceSource, /attachEngineManager/);
  assert.match(serviceSource, /exportCurrentAuction/);
  assert.match(serviceSource, /buildWorkerExportTasks/);
  assert.match(serviceSource, /mergeWorkerExportIntoExportPayload/);
  assert.doesNotMatch(serviceSource, /runBroadArrowOfflineExport/);
  assert.doesNotMatch(serviceSource, /BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE/);
  assert.match(bridge, /mapWorkerPhotoReferences/);
  assert.match(main, /attachEngineManager\(engineManager\)/);
});

test("export fails when scraper worker is not running", async () => {
  const paths = createTestPaths("offline-export-no-worker");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const { project } = seedBagProject(projects, dataSources);

    const service = new OfflineAuctionExportService(
      paths,
      projects,
      dataSources,
      credentials,
      "http://127.0.0.1:8070",
    );
    service.attachEngineManager({
      isEngineRunning: () => false,
      exportCurrentAuction: async () => ({}),
    });

    const result = await service.exportCurrentWebpage(project.id);
    assert.equal(result.ok, false);
    assert.match(
      result.error ?? "",
      /Start the Webpage Scraper before downloading the Current Webpage\./,
    );
  } finally {
    closeLocalDatabase(db);
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
});

test("export fails when engine manager is unavailable", async () => {
  const paths = createTestPaths("offline-export-no-manager");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const { project } = seedBagProject(projects, dataSources);

    const service = new OfflineAuctionExportService(
      paths,
      projects,
      dataSources,
      credentials,
      "http://127.0.0.1:8070",
    );

    const result = await service.exportCurrentWebpage(project.id);
    assert.equal(result.ok, false);
    assert.match(
      result.error ?? "",
      /The active Webpage Scraper worker could not be found/,
    );
  } finally {
    closeLocalDatabase(db);
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
});

test("export fails when no scraper snapshot exists", async () => {
  const paths = createTestPaths("offline-export-no-snapshot");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const project = projects.create({
      name: "Broad Arrow Auctions",
      slug: `broad-arrow-${crypto.randomUUID().slice(0, 6)}`,
      projectType: "bag-graphics",
    });
    dataSources.ensureWebpageScraper(project.id, "bag-graphics");

    const service = new OfflineAuctionExportService(
      paths,
      projects,
      dataSources,
      credentials,
      "http://127.0.0.1:8070",
    );

    const result = await service.exportCurrentWebpage(project.id);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /No Webpage Scraper data is available yet/);
  } finally {
    closeLocalDatabase(db);
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
});

test("local api exposes guarded offline asset route", () => {
  const localApi = readSrc("desktop/src/services/local-api-server.ts");
  assert.ok(localApi.includes("offline-assets"));
  assert.ok(localApi.includes("resolveOfflineAsset"));
});

test("concurrent offline exports are prevented", () => {
  const serviceSource = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.ok(serviceSource.includes("exportInProgress"));
  assert.ok(serviceSource.includes("An offline export is already in progress."));
});

test("offline export IPC records execution log instead of activity", () => {
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  assert.ok(!ipc.includes('userAction: "Auction JSON downloaded"'));
});
