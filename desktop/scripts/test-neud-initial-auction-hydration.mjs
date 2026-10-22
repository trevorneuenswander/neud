import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBagEventDrivenSession } from "../../workers/data-engine/src/adapters/bag-event-driven-session.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

const DOM_SNAPSHOT = {
  lotNumber: "101",
  year: "1967",
  title: "Ferrari 275 GTB/4",
  biddingPrice: "$ 1,000,000",
  reserveStatus: "No Reserve",
  currencies: ["EUR 900,000"],
  photos: [],
  vehicleId: "veh-1",
};

function createHarness({ mode = "faye", evaluate } = {}) {
  let cache = { lots: [], current: null, prev: null, next: [], auctionDisplay: null };
  const logs = [];
  const published = [];
  let refreshCount = 0;

  const page = {
    exposeFunction: async () => {},
    evaluateOnNewDocument: async () => {},
    evaluate: async (...args) => (evaluate ? evaluate(...args) : DOM_SNAPSHOT),
  };

  const session = createBagEventDrivenSession({
    engineId: "engine-test",
    getCache: () => cache,
    setCache: (next) => {
      cache = next;
    },
    getAuctionPage: () => page,
    ensureBidDisplayPersistent: async () => {},
    refreshCatalog: async () => {
      refreshCount += 1;
    },
    runLegacyFullScrape: async () => {},
    queuePreviousLotSoldCheck: async () => {},
    queueReserveForCurrentLot: async () => {},
    onPublishSnapshot: async (next, meta) => {
      published.push({ cache: next, meta });
    },
    onExecutionLog: (message) => logs.push(message),
    onActivityTransition: () => {},
    onPersistLiveFeedMode: async () => {},
    loadSettings: async () => ({ live_feed_mode: mode, background_refresh_interval_ms: 600000 }),
    shouldContinue: () => true,
  });

  return { session, logs, published, getCache: () => cache, getRefreshCount: () => refreshCount };
}

test("start publishes one initial auction snapshot and logs it distinctly", async () => {
  const h = createHarness();
  await h.session.start({ live_feed_mode: "faye" }, { initialHydration: true });
  try {
    assert.equal(h.published.length, 1, "exactly one initial snapshot");
    assert.equal(h.published[0].cache.auctionDisplay.lot, "Lot 101");
    assert.equal(h.published[0].cache.auctionDisplay.reserveStatus, "No Reserve");
    assert.ok(h.logs.includes("Initial auction state loaded"));

    // No continuous polling while Faye is the active source.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(h.published.length, 1, "no additional publishes without live events");
  } finally {
    await h.session.stop();
  }
});

test("restart style start hydrates again on a fresh session", async () => {
  for (let i = 0; i < 2; i += 1) {
    const h = createHarness();
    await h.session.start({ live_feed_mode: "faye" });
    try {
      assert.equal(h.published.length, 1);
      assert.ok(h.logs.includes("Initial auction state loaded"));
    } finally {
      await h.session.stop();
    }
  }
});

test("Faye event arriving during the initial read wins; initial snapshot is skipped", async () => {
  let session;
  const h = createHarness({
    evaluate: async () => {
      await session.handleLiveEvent({
        source: "faye",
        eventType: "vehicle_update",
        lotNumber: "102",
        title: "Newer lot",
        biddingPrice: "$ 2,000,000",
        currencies: [],
        receivedAt: Date.now(),
      });
      return DOM_SNAPSHOT;
    },
  });
  session = h.session;
  await session.start({ live_feed_mode: "faye" });
  try {
    assert.equal(h.published.length, 1, "only the live event is published");
    assert.equal(h.published[0].cache.auctionDisplay.lot, "Lot 102");
    assert.equal(h.getCache().auctionDisplay.lot, "Lot 102", "cache keeps newer live state");
    assert.ok(
      h.logs.includes("Initial auction state skipped; live feed already delivered current state"),
    );
    assert.ok(!h.logs.includes("Initial auction state loaded"));
  } finally {
    await session.stop();
  }
});

test("Run Once style start (initialHydration false) does not publish an initial snapshot", async () => {
  const h = createHarness();
  await h.session.start({ live_feed_mode: "faye" }, { initialHydration: false });
  try {
    assert.equal(h.published.length, 0);
    assert.ok(!h.logs.includes("Initial auction state loaded"));
  } finally {
    await h.session.stop();
  }
});

test("legacy polling mode leaves hydration to the legacy scheduler", async () => {
  const h = createHarness({ mode: "legacy" });
  await h.session.start({ live_feed_mode: "legacy" });
  try {
    assert.ok(!h.logs.includes("Initial auction state loaded"));
  } finally {
    await h.session.stop();
  }
});

test("engine runtime and adapter plumb initialHydration to the session", () => {
  const runtime = read("workers/data-engine/src/engine-runtime.js");
  assert.match(runtime, /initialHydration: !\(runOnceRequested && desiredState !== "running"\)/);
  assert.match(read("workers/data-engine/src/adapters/bag-auction.js"), /initialHydration: context\.initialHydration !== false/);
  assert.match(
    read("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js"),
    /initialHydration: sessionOptions\.initialHydration !== false/,
  );
});
