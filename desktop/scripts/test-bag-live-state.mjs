import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyBagLiveState,
  normalizeBagSnapshot,
} from "../dist/bag/live-state/bag-snapshot-normalizer.js";
import { parseBagLiveState, BagLiveStateRepository } from "../dist/bag/live-state/bag-live-state-repository.js";
import { BagLiveStateEvents } from "../dist/bag/live-state/bag-live-state-events.js";
import { BagLiveStateService } from "../dist/bag/live-state/bag-live-state-service.js";
import { BagManualEventsRepository } from "../dist/bag/live-state/bag-manual-events-repository.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const sampleSnapshot = {
  prev: {
    lot: "100",
    title: "Previous Vehicle",
    price: "$ 10,000",
    status: "Sold",
  },
  current: {
    lot: "101",
    title: "Current Vehicle",
    price: "$ 15,000",
    status: "Active",
  },
  next: [
    {
      lot: "102",
      title: "Next Vehicle",
      price: "",
      status: null,
    },
  ],
  lots: [
    {
      lot: "100",
      title: "Previous Vehicle",
      price: "$ 10,000",
      status: "Sold",
    },
    {
      lot: "101",
      title: "Current Vehicle",
      price: "$ 15,000",
      status: "Active",
    },
    {
      lot: "102",
      title: "Next Vehicle",
      price: "",
      status: null,
    },
  ],
  lastSold: {
    lot: "100",
    title: "Previous Vehicle",
    price: "$ 10,000",
  },
  auctionDisplay: {
    lot: "Lot 101",
    year: "2020",
    title: "Current Vehicle",
    biddingPrice: "$ 15,500",
    reserveStatus: "No Reserve",
    photos: ["https://example.com/photo.jpg"],
    scrapedAt: "2026-01-01T00:00:00.000Z",
  },
  updatedAt: "2026-01-01T00:00:00.000Z",
};

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

  for (const dir of [paths.data, paths.backups, paths.config, paths.logs, paths.engineLogs]) {
    mkdirSync(dir, { recursive: true });
  }

  return paths;
}

function seedBagProject(db, dataSources, { projectId, projectType = "bag-graphics" }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, project_number, name, slug, project_type, status,
      settings_json, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
  ).run(projectId, 1, "BAG Project", "bag-project", projectType, "active", now, now);

  dataSources.ensureWebpageScraper(projectId, "bag-graphics");
  const engine = dataSources.getByEngineKey(projectId, "webpage-scraper");
  assert.ok(engine);
  return engine;
}

test("normalizeBagSnapshot maps current lot and lots", () => {
  const result = normalizeBagSnapshot({
    projectId: "project-1",
    engineId: "engine-1",
    snapshotId: "snapshot-1",
    capturedAt: "2026-01-01T00:00:00.000Z",
    snapshot: sampleSnapshot,
    connection: { status: "connected" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.state.currentLot?.lotNumber, "101");
  assert.equal(result.state.currentLot?.currentBidLabel, "$ 15,500");
  assert.equal(result.state.lotCount, 3);
  assert.equal(result.state.lastSold?.lotNumber, "100");
  assert.equal(result.state.mode, "automatic");
});

test("normalizeBagSnapshot handles missing optional fields", () => {
  const result = normalizeBagSnapshot({
    projectId: "project-1",
    engineId: "engine-1",
    snapshotId: "snapshot-2",
    capturedAt: "2026-01-01T00:00:00.000Z",
    snapshot: {
      lots: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    connection: { status: "connected" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.currentLot, null);
  assert.equal(result.state.lotCount, 0);
});

test("invalid snapshot preserves previous live state", async () => {
  const paths = createTestPaths("bag-live-invalid");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const repository = new BagLiveStateRepository(db);
    const events = new BagLiveStateEvents();
    const manualEvents = new BagManualEventsRepository(db);
    const service = new BagLiveStateService(
      projects,
      dataSources,
      repository,
      events,
      manualEvents,
    );

    const projectId = crypto.randomUUID();
    const engine = seedBagProject(db, dataSources, { projectId });

    const good = service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    assert.ok(good?.state.currentLot);

    const afterBad = service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: { lots: [] },
      recordCount: 0,
      payloadSizeBytes: 10,
      durationMs: 10,
      capturedAt: "2026-01-01T00:00:01.000Z",
      createdAt: "2026-01-01T00:00:01.000Z",
    });

    assert.equal(afterBad?.state.currentLot?.lotNumber, "101");
    assert.match(afterBad?.state.connection.lastError ?? "", /did not include a current lot/i);
  } finally {
    closeLocalDatabase(db);
  }
});

test("persisted live state round-trip and restart recovery", async () => {
  const paths = createTestPaths("bag-live-roundtrip");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const repository = new BagLiveStateRepository(db);
    const events = new BagLiveStateEvents();
    const manualEvents = new BagManualEventsRepository(db);
    const service = new BagLiveStateService(
      projects,
      dataSources,
      repository,
      events,
      manualEvents,
    );

    const projectId = crypto.randomUUID();
    const engine = seedBagProject(db, dataSources, { projectId });

    service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const persisted = repository.get(projectId);
    assert.ok(persisted);
    assert.equal(persisted.state.currentLot?.lotNumber, "101");

    const recovered = service.ensureLiveState(projectId);
    assert.equal(recovered.currentLot?.lotNumber, "101");
  } finally {
    closeLocalDatabase(db);
  }
});

test("createEmptyBagLiveState returns valid schema", () => {
  const state = createEmptyBagLiveState({
    projectId: "project-1",
    engineId: "engine-1",
  });

  assert.equal(parseBagLiveState(state)?.projectId, "project-1");
  assert.equal(state.currentLot, null);
  assert.equal(state.connection.status, "stopped");
});

test("update event publication notifies subscribers", async () => {
  const paths = createTestPaths("bag-live-events");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const repository = new BagLiveStateRepository(db);
    const events = new BagLiveStateEvents();
    const manualEvents = new BagManualEventsRepository(db);
    const service = new BagLiveStateService(
      projects,
      dataSources,
      repository,
      events,
      manualEvents,
    );

    const projectId = crypto.randomUUID();
    const engine = seedBagProject(db, dataSources, { projectId });

    let received = 0;
    const unsubscribe = events.subscribe(projectId, () => {
      received += 1;
    });

    service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    unsubscribe();
    assert.equal(received, 1);
  } finally {
    closeLocalDatabase(db);
  }
});

test("non-BAG projects are rejected by service lookup", async () => {
  const paths = createTestPaths("bag-live-non-bag");
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const repository = new BagLiveStateRepository(db);
    const events = new BagLiveStateEvents();
    const manualEvents = new BagManualEventsRepository(db);
    const service = new BagLiveStateService(
      projects,
      dataSources,
      repository,
      events,
      manualEvents,
    );

    const projectId = crypto.randomUUID();
    seedBagProject(db, dataSources, {
      projectId,
      projectType: "webpage-scraper",
    });

    assert.equal(service.isBagGraphicsProject(projectId), false);
    assert.equal(service.getLiveState(projectId), null);
  } finally {
    closeLocalDatabase(db);
  }
});
