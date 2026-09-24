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

function detectAuctionDaysFromLotNumbers(lotNumbers) {
  const days = new Set();
  for (const lotNumber of lotNumbers) {
    const raw = String(lotNumber ?? "")
      .trim()
      .replace(/^lot\s+/i, "");
    const match = raw.match(/^(\d+(?:\.\d+)?)/);
    if (!match?.[1]) continue;
    const whole = Math.trunc(Number.parseFloat(match[1]));
    if (!Number.isFinite(whole) || whole < 100) continue;
    const day = Math.floor(whole / 100);
    const lotWithinDay = whole % 100;
    if (day >= 1 && lotWithinDay >= 1) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

test("live feed UI has no Automatic option", () => {
  const panel = read("src/components/data-engines/webpage-scraper/BagLiveFeedPanel.tsx");
  assert.doesNotMatch(panel, /Automatic/);
  assert.match(panel, /liveFeedModeUiLabel\("faye"\)/);
  assert.match(panel, /liveFeedModeUiLabel\("dom"\)/);
  assert.match(panel, /liveFeedModeUiLabel\("legacy"\)/);
});

test("live feed layout: heading, mode, day inline without Mode/Auction Day labels", () => {
  const panel = read("src/components/data-engines/webpage-scraper/BagLiveFeedPanel.tsx");
  assert.match(panel, /Live Feed/);
  assert.match(panel, /AuctionDaySelectionControl/);
  assert.doesNotMatch(panel, />\s*Mode\s*</);
  const settings = read("src/components/data-engines/webpage-scraper/EngineSettingsForm.tsx");
  assert.doesNotMatch(settings, /AuctionDaySelectionControl/);
});

test("legacy automatic setting normalizes to faye", async () => {
  const { normalizeLiveFeedModePreference } = await import(utilsUrl);
  assert.equal(normalizeLiveFeedModePreference("automatic"), "faye");
  assert.equal(normalizeLiveFeedModePreference(undefined), "faye");
  assert.equal(normalizeLiveFeedModePreference("bogus"), "faye");
});

test("live feed mode UI labels in source", () => {
  const labels = read("src/lib/bag/live-feed-mode-labels.ts");
  assert.match(labels, /Faye \(Fastest\)/);
  assert.match(labels, /DOM \(Backup\)/);
  assert.match(labels, /Legacy Polling \(Slowest\)/);
});

test("poll interval only when legacy in live feed panel", () => {
  const panel = read("src/components/data-engines/webpage-scraper/BagLiveFeedPanel.tsx");
  assert.match(panel, /showLegacyPoll = modePreference === "legacy"/);
});

test("failover down only in event-driven session", () => {
  const session = read("workers/data-engine/src/adapters/bag-event-driven-session.js");
  assert.match(session, /persistModeDowngrade/);
  assert.match(session, /Faye live feed unavailable; switched to DOM/);
  assert.match(session, /DOM live feed unavailable; switched to Legacy Polling/);
  assert.doesNotMatch(session, /maybePromote/);
  assert.doesNotMatch(session, /"automatic"/);
});

test("failover persistence wired through worker and local API", () => {
  assert.match(read("workers/data-engine/src/adapters/bag-auction.js"), /onPersistLiveFeedMode/);
  assert.match(read("workers/data-engine/src/local-client.js"), /persistLiveFeedModeFailover/);
  assert.match(read("desktop/src/services/local-data-service.ts"), /applyLiveFeedModeFailover/);
});

test("auction day options from lot numbers", () => {
  assert.deepEqual(detectAuctionDaysFromLotNumbers(["101", "102"]), [1]);
  assert.deepEqual(detectAuctionDaysFromLotNumbers(["201", "202"]), [2]);
  assert.deepEqual(detectAuctionDaysFromLotNumbers(["301"]), [3]);
  assert.deepEqual(detectAuctionDaysFromLotNumbers(["101", "201", "301"]), [1, 2, 3]);
  assert.deepEqual(detectAuctionDaysFromLotNumbers(["Lot 101", "bad", ""]), [1]);
  assert.match(read("src/lib/bag/auction-day-options.ts"), /detectAuctionDayOptionsFromLotNumbers/);
  assert.match(read("desktop/src/bag/auction-day-options.ts"), /detectAuctionDayOptionsFromLotNumbers/);
});

test("auction day GET returns detected days from local data service", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /getAuctionDaySelectionState/);
  assert.match(service, /collectLotNumbersForAuctionDayDetection/);
  assert.match(service, /getActiveDownloadedDataset/);
});

test("local controller has no auction day dropdown", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(controller, /AuctionDaySelectionControl/);
  assert.match(controller, /localGetAuctionDaySelection/);
});

test("scroll owner is project layout frame with preserve helper", () => {
  assert.match(read("src/lib/portal/project-scroll-container.ts"), /\.project-layout-frame/);
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /preserveProjectScrollPosition/);
  assert.doesNotMatch(controller, /window\.scrollTo/);
  assert.match(controller, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
});

test("photo panel keyed per lot not whole controller page", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.doesNotMatch(controller, /key=\{`controller-/);
  assert.match(controller, /key=\{`lot-photos-/);
});
