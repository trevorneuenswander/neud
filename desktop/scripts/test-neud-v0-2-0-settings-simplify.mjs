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

test("live feed panel mode-specific timing controls", () => {
  const panel = read("src/components/data-engines/webpage-scraper/BagLiveFeedPanel.tsx");
  assert.match(panel, /showLegacyPoll = modePreference === "legacy"/);
  assert.match(panel, /Background Refresh/);
  assert.match(panel, /Poll Interval/);
  assert.match(panel, /ScraperIntervalSliderControl/);
  assert.doesNotMatch(panel, /Active source/i);
  assert.match(panel, /pt-4/);
});

test("advanced settings collapsed and primary timing removed from engine form", () => {
  const form = read("src/components/data-engines/webpage-scraper/EngineSettingsForm.tsx");
  assert.match(form, /Advanced Settings/);
  assert.match(form, /defaultOpen=\{false\}/);
  assert.doesNotMatch(form, /Background refresh/);
  assert.doesNotMatch(form, /Live poll interval/);
});

test("local controller has no auction day dropdown", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(controller, /AuctionDaySelectionControl/);
  assert.match(controller, /localGetAuctionDaySelection/);
  assert.match(controller, /filterLotsByAuctionDay/);
});

test("scroll instrumentation and anchor isolation", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /probeControllerScroll/);
  assert.match(controller, /overflowAnchor: "none"/);
  const scroll = read("src/lib/portal/project-scroll-container.ts");
  assert.match(scroll, /SCROLL_WATCH_MS/);
});

test("legacy mode skips duplicate background scheduler", () => {
  const session = read("workers/data-engine/src/adapters/bag-event-driven-session.js");
  assert.match(session, /getOperatorMode\(\) === "legacy"/);
});

test("stream ticker UP NEXT animates out", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /setUpNextLabelVisible/);
  assert.match(html, /up-next-label\.fade-out/);
  assert.doesNotMatch(html, /upNextLabel\.classList\.add\("hidden"\);\s*\n\s*\} else \{/);
});

test("downloads remain all-days", () => {
  const exportService = read("desktop/src/services/offline-auction-export-service.ts");
  assert.doesNotMatch(exportService, /auctionDaySelection/);
  assert.doesNotMatch(exportService, /streamTickerDayFilter/);
  assert.doesNotMatch(exportService, /filterLotsByAuctionDay/);
});
