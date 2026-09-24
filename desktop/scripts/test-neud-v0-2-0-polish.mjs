#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("day filter end of day does not wrap to first lot", async () => {
  const { mapSnapshotToLowerTickerFeed } = await import(
    "../dist/displays/lower-ticker-data.js"
  );
  const lots = [
    { lot: "Lot 197", title: "A" },
    { lot: "Lot 198", title: "B" },
    { lot: "Lot 199", title: "C" },
  ];
  const feed = mapSnapshotToLowerTickerFeed(
    { lots, current: { lot: "Lot 199" }, next: [{ lot: "Lot 197", title: "wrap" }] },
    { dayFilter: 1 },
  );
  assert.deepEqual(feed.next, []);
});

test("all lots may continue across day boundaries", async () => {
  const { mapSnapshotToLowerTickerFeed } = await import(
    "../dist/displays/lower-ticker-data.js"
  );
  const lots = [
    { lot: "Lot 199", title: "A" },
    { lot: "Lot 201", title: "B" },
  ];
  const feed = mapSnapshotToLowerTickerFeed(
    { lots, current: { lot: "Lot 199" } },
    { dayFilter: "all" },
  );
  assert.equal(feed.next[0]?.lot, "Lot 201");
});

test("stream ticker animates UP NEXT when next lots empty", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /upNextLabel/);
  assert.match(html, /setUpNextLabelVisible\(count > 0\)/);
});

test("shared auction day setting module exists", () => {
  assert.match(read("src/lib/bag/auction-day-selection.ts"), /auctionDaySelectionSettingKey/);
  assert.match(read("desktop/src/bag/auction-day-selection.ts"), /readAuctionDaySelectionWithMigration/);
});

test("live feed mode preference wiring exists without automatic", () => {
  assert.match(read("workers/data-engine/src/adapters/bag-event-driven-session.js"), /liveFeedModePreference/);
  const panel = read("src/components/data-engines/webpage-scraper/BagLiveFeedPanel.tsx");
  assert.doesNotMatch(panel, /Automatic/);
  assert.match(panel, /Live Feed/);
});

test("json preview uses authoritative scraper snapshot merge", () => {
  assert.match(read("src/lib/bag/live-state-preview.ts"), /pickAuthoritativeScraperPreview/);
  assert.match(read("src/components/data-engines/webpage-scraper/BagLiveStateJsonPreview.tsx"), /pickAuthoritativeScraperPreview/);
});

test("local controller preserves project scroll on lot navigation", () => {
  assert.match(read("src/components/bag-graphics/BagControllerClient.tsx"), /preserveProjectScrollPosition/);
  assert.match(read("src/components/bag-graphics/BagControllerClient.tsx"), /probeControllerScroll/);
});

test("stream ticker day filter removed from display card", () => {
  assert.doesNotMatch(read("src/components/displays/DeveloperHtmlDisplayCard.tsx"), /StreamTickerDayFilterControl/);
});
