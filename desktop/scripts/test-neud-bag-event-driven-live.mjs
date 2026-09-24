#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const utilsUrl = pathToFileURL(
  path.join(repoRoot, "workers/data-engine/src/adapters/bag-live-feed-utils.js"),
).href;

test("Faye event updates auction display fields in cache", async () => {
  const { applyLiveEventToCache } = await import(utilsUrl);
  const cache = applyLiveEventToCache(
    { lots: [{ lot: "Lot 201", status: "Active" }], auctionDisplay: null },
    {
      lotNumber: "201",
      year: "2020",
      title: "Example Vehicle",
      biddingPrice: "$ 12,000",
      currencies: ["€ 10,500"],
      receivedAt: Date.now(),
    },
  );
  assert.equal(cache.auctionDisplay.lot, "Lot 201");
  assert.equal(cache.auctionDisplay.biddingPrice, "$ 12,000");
  assert.deepEqual(cache.auctionDisplay.currencies, ["€ 10,500"]);
});

test("currency and bid share one auctionDisplay patch", async () => {
  const { buildAuctionDisplayPatchFromLiveEvent } = await import(utilsUrl);
  const patch = buildAuctionDisplayPatchFromLiveEvent({
    biddingPrice: "$ 5,000",
    currencies: ["£ 4,000"],
  });
  assert.equal(patch.biddingPrice, "$ 5,000");
  assert.deepEqual(patch.currencies, ["£ 4,000"]);
});

test("duplicate fingerprint is detectable", async () => {
  const { buildLiveFingerprint } = await import(utilsUrl);
  const event = {
    lotNumber: "101",
    title: "Car",
    biddingPrice: "$ 1,000",
    currencies: ["€ 900"],
  };
  assert.equal(buildLiveFingerprint(event), buildLiveFingerprint({ ...event }));
  assert.notEqual(
    buildLiveFingerprint(event),
    buildLiveFingerprint({ ...event, biddingPrice: "$ 1,100" }),
  );
});

test("next three lots derive from catalog cache", async () => {
  const { deriveNextLotsFromCatalog } = await import(utilsUrl);
  const lots = [
    { lot: "Lot 201", status: "Active" },
    { lot: "Lot 202" },
    { lot: "Lot 203" },
    { lot: "Lot 204" },
    { lot: "Lot 205" },
  ];
  const next = deriveNextLotsFromCatalog(lots, "201", 3);
  assert.equal(next.length, 3);
  assert.equal(next[0].lot, "Lot 202");
});

test("event-driven feature flag and adapter wiring exist", () => {
  const bagAuction = read("workers/data-engine/src/adapters/bag-auction.js");
  const engineRuntime = read("workers/data-engine/src/engine-runtime.js");
  assert.match(bagAuction, /startEventDrivenEngine/);
  assert.match(read("workers/data-engine/src/adapters/bag-live-feed-utils.js"), /NEUD_BAG_EVENT_DRIVEN_LIVE/);
  assert.match(engineRuntime, /supportsEventDrivenLive/);
  assert.match(read("workers/data-engine/src/adapters/bag-live-feed-bridge.js"), /afterVehicleUpdate/);
});

test("legacy scrape preserved as fallback path", () => {
  const legacy = read("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(legacy, /runLegacyFullScrape/);
  assert.match(legacy, /includeBidDisplayNavigation/);
});

test("UI exposes live feed panel", () => {
  assert.match(read("src/components/data-engines/webpage-scraper/BagLiveFeedPanel.tsx"), /Live Feed/);
  assert.match(read("src/components/data-engines/EngineDetailClient.tsx"), /BagLiveFeedPanel/);
});

test("snapshot contract avoids new top-level canonical keys in worker utils", async () => {
  const { applyLiveEventToCache } = await import(utilsUrl);
  const cache = applyLiveEventToCache({ lots: [] }, { lotNumber: "1", biddingPrice: "$ 1" });
  assert.ok(!("_liveFeed" in cache));
  assert.ok("auctionDisplay" in cache);
});

test("engine.start log is gated to one run lifecycle", () => {
  const runtime = read("workers/data-engine/src/engine-runtime.js");
  assert.match(runtime, /engineRunLifecycleActive/);
  assert.match(runtime, /if \(!engineRunLifecycleActive\)/);
});

test("abortable background wait wakes on abort", async () => {
  const lifecycleUrl = pathToFileURL(
    path.join(repoRoot, "workers/data-engine/src/adapters/bag-lifecycle-diagnostics.js"),
  ).href;
  const { createAbortableSleep } = await import(lifecycleUrl);
  const waiter = createAbortableSleep();
  const startedAt = Date.now();
  const sleepPromise = waiter.sleep(5000, () => true);
  setTimeout(() => waiter.abort(), 50);
  await sleepPromise;
  assert.ok(Date.now() - startedAt < 500);
});

test("event-driven session stop clears schedulers promptly", () => {
  const session = read("workers/data-engine/src/adapters/bag-event-driven-session.js");
  assert.match(session, /acceptLiveEvents = false/);
  assert.match(session, /backgroundWait\.abort\(\)/);
  assert.match(session, /markBackgroundSchedulerStopped/);
});

test("lot transition recomputes prev current next from catalog", async () => {
  const { applyLiveEventToCache } = await import(utilsUrl);
  const lots = [
    { lot: "Lot 101", title: "A" },
    { lot: "Lot 102", title: "B" },
    { lot: "Lot 103", title: "C" },
    { lot: "Lot 104", title: "D" },
  ];
  const cache = applyLiveEventToCache(
    {
      lots,
      current: lots[1],
      prev: lots[0],
      next: lots.slice(2, 5),
      auctionDisplay: { lot: "Lot 102", photos: ["https://example.test/a.jpg"] },
    },
    {
      eventType: "change_car",
      lotNumber: "103",
      title: "C",
      biddingPrice: "$ 10,000",
      receivedAt: Date.now(),
    },
  );
  assert.equal(cache.current?.lot, "Lot 103");
  assert.equal(cache.prev?.lot, "Lot 102");
  assert.equal(cache.next[0]?.lot, "Lot 104");
});

test("background catalog merge preserves live auctionDisplay bid", async () => {
  const { mergeCatalogRefreshIntoCache } = await import(utilsUrl);
  const lots = [
    { lot: "Lot 101", price: "$ 1", status: "Active" },
    { lot: "Lot 102", price: "$ 2" },
  ];
  const merged = mergeCatalogRefreshIntoCache(
    {
      auctionDisplay: { lot: "Lot 102", biddingPrice: "$ 120,000", photos: ["p1"] },
      current: { lot: "Lot 102" },
    },
    { lots, activeIndex: 0 },
  );
  assert.equal(merged.auctionDisplay.biddingPrice, "$ 120,000");
  assert.equal(merged.current?.lot, "Lot 102");
  assert.deepEqual(merged.auctionDisplay.photos, ["p1"]);
});

test("live patch preserves photos when event sends none", async () => {
  const { applyLiveEventToCache } = await import(utilsUrl);
  const cache = applyLiveEventToCache(
    {
      auctionDisplay: { lot: "Lot 101", photos: ["https://cdn/1.jpg", "https://cdn/2.jpg"] },
      lots: [{ lot: "Lot 101" }],
    },
    { lotNumber: "101", biddingPrice: "$ 50,000", receivedAt: Date.now() },
  );
  assert.equal(cache.auctionDisplay.photos.length, 2);
});

test("public snapshot strips internal live meta keys", async () => {
  const { applyLiveEventToCache, stripInternalLiveMetaForSnapshot } = await import(utilsUrl);
  const internal = applyLiveEventToCache({ lots: [] }, { lotNumber: "1", biddingPrice: "$ 1" });
  const publicCache = stripInternalLiveMetaForSnapshot(internal);
  assert.ok(!("_livePatchMeta" in publicCache));
  assert.ok(!("_backgroundMergeMeta" in publicCache));
});

test("day boundary transition uses ordered catalog not numeric increment", async () => {
  const { applyLiveEventToCache } = await import(utilsUrl);
  const lots = [
    { lot: "Lot 199", title: "Day1 last" },
    { lot: "Lot 201", title: "Day2 first" },
    { lot: "Lot 202", title: "Day2 second" },
  ];
  const cache = applyLiveEventToCache(
    { lots, auctionDisplay: { lot: "Lot 199" } },
    { eventType: "change_car", lotNumber: "201", title: "Day2 first", biddingPrice: "$ 1" },
  );
  assert.equal(cache.current?.lot, "Lot 201");
  assert.equal(cache.prev?.lot, "Lot 199");
  assert.equal(cache.next[0]?.lot, "Lot 202");
});

test("lastSold advances only when detail reports sold", async () => {
  const { mergeLastSoldFromDetailCheck } = await import(utilsUrl);
  const prev = { lot: "Lot 101", title: "A", price: "$ 1" };
  const unsold = mergeLastSoldFromDetailCheck(
    { lastSold: { lot: "Lot 99" } },
    prev,
    { sold: false },
  );
  assert.equal(unsold.lastSold.lot, "Lot 99");
  const sold = mergeLastSoldFromDetailCheck(
    { lastSold: { lot: "Lot 99" } },
    prev,
    { sold: true, currentPrice: 120000 },
  );
  assert.equal(sold.lastSold.lot, "Lot 101");
});

test("rapid bid events preserve photos and advance bid", async () => {
  const { applyLiveEventToCache } = await import(utilsUrl);
  let cache = {
    auctionDisplay: {
      lot: "Lot 101",
      photos: ["https://cdn/a.jpg"],
      biddingPrice: "$ 100,000",
    },
    lots: [{ lot: "Lot 101" }],
  };
  for (const bid of ["$ 105,000", "$ 110,000", "$ 115,000"]) {
    cache = applyLiveEventToCache(cache, {
      lotNumber: "101",
      biddingPrice: bid,
      receivedAt: Date.now(),
    });
  }
  assert.equal(cache.auctionDisplay.biddingPrice, "$ 115,000");
  assert.deepEqual(cache.auctionDisplay.photos, ["https://cdn/a.jpg"]);
});

test("catalog match resolves vehicle id via edit href", async () => {
  const { matchLotInCatalog } = await import(utilsUrl);
  const lots = [
    { lot: "Lot 55", editHref: "/vehicles/9001/edit" },
    { lot: "Lot 56", editHref: "/vehicles/9002/edit" },
  ];
  const match = matchLotInCatalog(lots, { vehicleId: "9002" });
  assert.equal(match.catalogMatchStrategy, "vehicleIdEditHref");
  assert.equal(match.row.lot, "Lot 56");
});

test("lot transition race keeps live bid over stale catalog row", async () => {
  const { applyLiveEventToCache, mergeCatalogRefreshIntoCache } = await import(utilsUrl);
  const lots = [
    { lot: "Lot 101", status: "Active", price: "$ 115,000" },
    { lot: "Lot 102", price: "$ 0" },
  ];
  let cache = applyLiveEventToCache(
    { lots, auctionDisplay: { lot: "Lot 102", biddingPrice: "$ 120,000", photos: ["p"] } },
    { eventType: "change_car", lotNumber: "102", biddingPrice: "$ 120,000" },
  );
  cache = mergeCatalogRefreshIntoCache(cache, { lots, activeIndex: 0 });
  assert.equal(cache.auctionDisplay.biddingPrice, "$ 120,000");
  assert.equal(cache.current?.lot, "Lot 102");
});

test("runtime diagnostics reads from snapshot helper exists", () => {
  assert.match(
    read("src/lib/data-engines/runtime-diagnostics-from-snapshot.ts"),
    /buildRuntimeDiagnosticsFromSnapshot/,
  );
  assert.match(read("src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx"), /findLatestLiveDiagnosticsLog/);
  assert.match(read("workers/data-engine/src/adapters/bag-auction-event-driven.js"), /scrape\.live_update/);
});

test("lifecycle diagnostics counters exist", async () => {
  const lifecycleUrl = pathToFileURL(
    path.join(repoRoot, "workers/data-engine/src/adapters/bag-lifecycle-diagnostics.js"),
  ).href;
  const diagnostics = await import(lifecycleUrl);
  diagnostics.resetBagLifecycleDiagnostics();
  diagnostics.markBrowserLaunched();
  diagnostics.markFayeObserverInstalled();
  const snapshot = diagnostics.getBagLifecycleDiagnostics();
  assert.equal(snapshot.browserLaunchCount, 1);
  assert.equal(snapshot.fayeObserverInstallCount, 1);
});
