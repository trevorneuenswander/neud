import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateBidExpression,
  parseBidInput,
} from "../dist/bag/live-state/bag-manual-validation.js";
import {
  createDraftFromLot,
  createEmptyDraft,
  syncDraftFromScrapedLot,
} from "../dist/bag/live-state/bag-local-controller-state.js";
import { BagLiveStateRepository } from "../dist/bag/live-state/bag-live-state-repository.js";
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

const updatedSnapshot = {
  ...sampleSnapshot,
  current: {
    lot: "101",
    title: "Current Vehicle",
    price: "$ 16,000",
    status: "Active",
  },
  auctionDisplay: {
    ...sampleSnapshot.auctionDisplay,
    biddingPrice: "$ 16,000",
  },
  updatedAt: "2026-01-01T00:00:05.000Z",
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

async function createService(name) {
  const paths = createTestPaths(name);
  const db = await openLocalDatabase(paths);
  const projects = new ProjectsRepository(db);
  const dataSources = new DataSourcesRepository(db);
  const repository = new BagLiveStateRepository(db);
  const manualEvents = new BagManualEventsRepository(db);
  const events = new BagLiveStateEvents();
  const service = new BagLiveStateService(
    projects,
    dataSources,
    repository,
    events,
    manualEvents,
  );
  return { db, projects, dataSources, repository, manualEvents, events, service };
}

const actor = { email: "operator@example.com" };

test("entering Manual Mode copies current state", async () => {
  const ctx = await createService("manual-enter");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = ctx.service.enterManualMode(projectId, actor);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.envelope.state.mode, "manual");
    assert.equal(result.envelope.state.currentLot?.lotNumber, "101");
    assert.ok(result.envelope.automaticState);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("automatic snapshots do not overwrite submitted manual state", async () => {
  const ctx = await createService("manual-snapshot");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    ctx.service.setManualBid(projectId, "$ 20,000", actor);
    ctx.service.submitManualBid(projectId, actor);

    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: updatedSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:05.000Z",
      createdAt: "2026-01-01T00:00:05.000Z",
    });

    const submitted = ctx.service.getSubmittedDisplayState(projectId);
    assert.equal(submitted?.currentLot?.currentBid, 20000);
    const envelope = ctx.service.getLiveStateEnvelope(projectId);
    assert.equal(envelope?.automaticState?.currentLot?.currentBidLabel, "$ 16,000");
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("automatic state is retained while manual mode is active", async () => {
  const ctx = await createService("manual-retain-auto");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: updatedSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:05.000Z",
      createdAt: "2026-01-01T00:00:05.000Z",
    });

    const record = ctx.repository.get(projectId);
    assert.ok(record?.automaticState);
    assert.equal(record.automaticState.currentLot?.currentBidLabel, "$ 16,000");
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("exiting Manual Mode restores latest automatic state", async () => {
  const ctx = await createService("manual-exit");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    ctx.service.setManualBid(projectId, "99999", actor);
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: updatedSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:05.000Z",
      createdAt: "2026-01-01T00:00:05.000Z",
    });

    const result = ctx.service.exitManualMode(projectId, actor);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.envelope.state.mode, "automatic");
    assert.equal(result.envelope.state.currentLot?.currentBidLabel, "$ 16,000");
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("exiting is blocked when no automatic state exists", async () => {
  const ctx = await createService("manual-exit-blocked");
  try {
    const projectId = crypto.randomUUID();
    seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.ensureLiveState(projectId);
    ctx.service.enterManualMode(projectId, actor);
    ctx.repository.upsert({
      projectId,
      engineId: ctx.service.getBagEngineForProject(projectId)?.id ?? "engine",
      state: ctx.service.getLiveState(projectId),
      automaticState: null,
    });

    const result = ctx.service.exitManualMode(projectId, actor);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /automatic scraper state/i);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("next-lot selection updates draft until submit", async () => {
  const ctx = await createService("manual-next");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    const draftResult = ctx.service.selectNextLot(projectId, actor);
    assert.equal(draftResult.ok, true);
    if (!draftResult.ok) return;
    assert.equal(draftResult.envelope.localControllerDraft?.lotNumber, "102");
    const submitted = ctx.service.submitManualLot(projectId, actor);
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;
    assert.equal(submitted.envelope.localControllerSubmitted?.currentLot?.lotNumber, "102");
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("previous-lot selection", async () => {
  const ctx = await createService("manual-previous");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    ctx.service.selectNextLot(projectId, actor);
    const result = ctx.service.selectPreviousLot(projectId, actor);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.envelope.state.currentLot?.lotNumber, "101");
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("jump-to-lot selection updates draft until submit", async () => {
  const ctx = await createService("manual-jump");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    const draftResult = ctx.service.selectLot(projectId, "102", actor);
    assert.equal(draftResult.ok, true);
    if (!draftResult.ok) return;
    assert.equal(draftResult.envelope.localControllerDraft?.lotNumber, "102");
    const submitted = ctx.service.submitManualLot(projectId, actor);
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;
    assert.equal(submitted.envelope.localControllerSubmitted?.currentLot?.lotNumber, "102");
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("exact bid parsing", () => {
  assert.equal(parseBidInput("42000"), 42000);
  assert.equal(parseBidInput("42,000"), 42000);
  assert.equal(parseBidInput("$42,000"), 42000);
  assert.equal(parseBidInput("bad"), null);
});

test("bid increment and decrement update draft until submit", async () => {
  const ctx = await createService("manual-adjust");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    const setBid = ctx.service.setManualBid(projectId, "$15,500", actor);
    assert.equal(setBid.ok, true);
    if (!setBid.ok) return;
    const up = ctx.service.adjustManualBid(projectId, 1000, actor);
    assert.equal(up.ok, true);
    if (!up.ok) return;
    assert.equal(up.envelope.localControllerDraft?.currentBid, 16500);
    const down = ctx.service.adjustManualBid(projectId, -500, actor);
    assert.equal(down.ok, true);
    if (!down.ok) return;
    assert.equal(down.envelope.localControllerDraft?.currentBid, 16000);
    const submitted = ctx.service.submitManualBid(projectId, actor);
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;
    assert.equal(submitted.envelope.localControllerSubmitted?.currentLot?.currentBid, 16000);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("bid cannot go below zero", async () => {
  const ctx = await createService("manual-bid-floor");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    ctx.service.setManualBid(projectId, "500", actor);
    const result = ctx.service.adjustManualBid(projectId, -5000, actor);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.envelope.localControllerDraft?.currentBid, 0);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("safe calculator parsing", () => {
  assert.deepEqual(evaluateBidExpression("42000 + 1000", 42000), { ok: true, amount: 43000 });
  assert.deepEqual(evaluateBidExpression("42000 - 500", 42000), { ok: true, amount: 41500 });
  assert.deepEqual(evaluateBidExpression("current + 1000", 42000), { ok: true, amount: 43000 });
  assert.deepEqual(evaluateBidExpression("current - 500", 42000), { ok: true, amount: 41500 });
});

test("invalid calculator expressions rejected", () => {
  assert.equal(evaluateBidExpression("eval('1')", 100).ok, false);
  assert.equal(evaluateBidExpression("current * 2", 100).ok, false);
  assert.equal(evaluateBidExpression("", 100).ok, false);
});

test("sold/pass mutual exclusivity", async () => {
  const ctx = await createService("manual-status");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    ctx.service.setManualLotStatus(projectId, "sold", actor);
    let lot = ctx.service.getLiveState(projectId)?.currentLot;
    assert.equal(lot?.sold, true);
    assert.notEqual(lot?.passed, true);
    ctx.service.setManualLotStatus(projectId, "passed", actor);
    lot = ctx.service.getLiveState(projectId)?.currentLot;
    assert.equal(lot?.passed, true);
    assert.notEqual(lot?.sold, true);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("restart recovery in Manual Mode", async () => {
  const ctx = await createService("manual-restart");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    ctx.service.setManualBid(projectId, "25000", actor);
    ctx.service.submitManualBid(projectId, actor);

    const recoveredService = new BagLiveStateService(
      ctx.projects,
      ctx.dataSources,
      ctx.repository,
      ctx.events,
      ctx.manualEvents,
    );
    recoveredService.recoverAllProjects();
    const envelope = recoveredService.getLiveStateEnvelope(projectId);
    assert.equal(envelope?.state.mode, "manual");
    assert.equal(envelope?.localControllerSubmitted?.currentLot?.currentBid, 25000);
    assert.equal(envelope?.manualSession?.restoredFromPreviousSession, true);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("SSE update emitted after manual mutation", async () => {
  const ctx = await createService("manual-sse");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    let received = 0;
    const unsubscribe = ctx.events.subscribe(projectId, () => {
      received += 1;
    });

    ctx.service.enterManualMode(projectId, actor);
    unsubscribe();
    assert.equal(received, 1);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("mutation rejected for non-BAG projects", async () => {
  const ctx = await createService("manual-non-bag");
  try {
    const projectId = crypto.randomUUID();
    seedBagProject(ctx.db, ctx.dataSources, {
      projectId,
      projectType: "webpage-scraper",
    });
    assert.throws(
      () => ctx.service.enterManualMode(projectId, actor),
      /BAG projects/i,
    );
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("manual action audit row created", async () => {
  const ctx = await createService("manual-audit");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    const row = ctx.db
      .prepare(
        "SELECT event_type FROM bag_manual_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(projectId);
    assert.equal(row?.event_type, "enter_manual");
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("invalid manual patch preserves previous state", async () => {
  const ctx = await createService("manual-invalid-patch");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    const before = ctx.service.getLiveState(projectId)?.currentLot?.title;
    const result = ctx.service.applyManualLotPatch(projectId, { title: "   " }, actor);
    assert.equal(result.ok, false);
    const after = ctx.service.getLiveState(projectId)?.currentLot?.title;
    assert.equal(after, before);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

test("syncDraftFromScrapedLot does not auto-fill draft fields from scraper polls", () => {
  const draft = createDraftFromLot({
    lotNumber: "101",
    title: "Current Vehicle",
    currentBid: 15000,
    currentBidLabel: "$15,000",
  });
  assert.equal(draft.currentBid, null);
  assert.equal(draft.currentBidLabel, "");

  const dirtyLotDraft = {
    ...draft,
    lotNumber: "999",
    title: "Manual Title",
    lotDirty: true,
    currentBid: 15000,
    currentBidLabel: "$15,000",
    bidDirty: true,
  };
  const syncedLot = syncDraftFromScrapedLot(dirtyLotDraft, {
    lotNumber: "102",
    title: "Scraped Title",
    currentBid: 16000,
    currentBidLabel: "$16,000",
  });
  assert.equal(syncedLot.lotNumber, "999");
  assert.equal(syncedLot.title, "Manual Title");
  assert.equal(syncedLot.currentBidLabel, "$15,000");

  const cleanDraft = createEmptyDraft();
  const syncedClean = syncDraftFromScrapedLot(cleanDraft, {
    lotNumber: "102",
    title: "Scraped Title",
    currentBid: 16000,
    currentBidLabel: "$16,000",
  });
  assert.equal(syncedClean.lotNumber, "");
  assert.equal(syncedClean.title, "");
  assert.equal(syncedClean.currentBid, null);
  assert.equal(syncedClean.currentBidLabel, "");
});

test("manual bid stays unset until operator submits", async () => {
  const ctx = await createService("manual-bid-unset");
  try {
    const projectId = crypto.randomUUID();
    const engine = seedBagProject(ctx.db, ctx.dataSources, { projectId });
    ctx.service.processSnapshot(engine.id, {
      id: crypto.randomUUID(),
      sourceId: engine.id,
      data: sampleSnapshot,
      recordCount: 3,
      payloadSizeBytes: 100,
      durationMs: 50,
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    ctx.service.enterManualMode(projectId, actor);
    const envelope = ctx.service.getLiveStateEnvelope(projectId);
    assert.equal(envelope?.localControllerDraft?.currentBid, null);
    assert.equal(envelope?.localControllerSubmitted?.currentLot?.currentBid, undefined);
  } finally {
    closeLocalDatabase(ctx.db);
  }
});

