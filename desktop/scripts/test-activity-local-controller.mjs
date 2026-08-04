import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ActivitySessionStore, ACTIVITY_OVERVIEW_LIMIT } from "../dist/services/activity-session-store.js";
import { ActivityEventsRepository } from "../dist/repositories/activity-events-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { resolveEffectiveDisplayData } from "../dist/displays/resolve-effective-display-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
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
    repoRoot: path.resolve(__dirname, "../.."),
  };

  mkdirSync(paths.data, { recursive: true });
  mkdirSync(paths.backups, { recursive: true });
  mkdirSync(paths.config, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });
  mkdirSync(paths.engineLogs, { recursive: true });
  return paths;
}

test("activity session persists to sqlite and survives reload", async () => {
  const paths = createTestPaths("activity-persist");
  const db = await openLocalDatabase(paths);

  try {
    const repository = new ActivityEventsRepository(db);
    const store = new ActivitySessionStore(repository);
    store.append({
      type: "test.event",
      message: "Persisted event",
      timestamp: new Date().toISOString(),
    });
    assert.equal(store.getSnapshot().length, 1);

    const reloaded = new ActivitySessionStore(repository);
    assert.equal(reloaded.getSnapshot().length, 1);
    assert.equal(reloaded.getSnapshot()[0]?.message, "Persisted event");
  } finally {
    closeLocalDatabase(db);
  }
});

test("activity overview limit is 50 while full snapshot is unbounded", () => {
  const store = new ActivitySessionStore();
  for (let index = 0; index < 55; index += 1) {
    store.append({
      type: "test.event",
      message: `Event ${index}`,
      timestamp: new Date().toISOString(),
    });
  }

  assert.equal(store.getOverviewSnapshot().length, ACTIVITY_OVERVIEW_LIMIT);
  assert.equal(store.getSnapshot().length, 55);
  assert.equal(store.getOverviewSnapshot()[0]?.message, "Event 54");
});

test("resolveEffectiveDisplayData switches preview payload by source", () => {
  const scraperSnapshot = {
    auctionDisplay: {
      lot: "Lot 12",
      title: "Scraper Lot",
      biddingPrice: "$100,000",
    },
  };

  const scraperResolved = resolveEffectiveDisplayData({
    source: "webpage-scraper",
    scraperSnapshot,
    localControllerState: {
      currentLot: {
        lotNumber: "99",
        title: "Manual Lot",
        currentBidLabel: "$50,000",
      },
    },
  });

  assert.equal(scraperResolved.previewSnapshot?.auctionDisplay?.title, "Scraper Lot");

  const controllerResolved = resolveEffectiveDisplayData({
    source: "local-controller",
    scraperSnapshot,
    localControllerState: {
      currentLot: {
        lotNumber: "99",
        title: "Manual Lot",
        currentBidLabel: "$50,000",
      },
      nextLots: [{ lotNumber: "100", title: "Next Manual" }],
    },
  });

  assert.equal(controllerResolved.previewSnapshot?.current?.title, "Manual Lot");
  assert.equal(controllerResolved.pylonFeed.auctionDisplay.title, "Manual Lot");
});

test("activity local controller no longer records offline export activity", () => {
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  const activityMessage = readSrc("desktop/src/services/activity-message.ts");

  assert.ok(!ipc.includes('userAction: "Auction JSON downloaded"'));
  assert.ok(ipc.includes("offline.export.completed"));
  assert.ok(activityMessage.includes("formatUserActivityMessage"));
});
