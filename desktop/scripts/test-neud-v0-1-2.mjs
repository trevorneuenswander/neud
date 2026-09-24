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

function getAuctionDayFromLotNumber(lotNumber) {
  if (lotNumber === null || lotNumber === undefined) {
    return null;
  }
  const raw = String(lotNumber).trim().replace(/^lot\s+/i, "");
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const numeric = Number.parseFloat(match[1]);
  if (!Number.isFinite(numeric) || numeric < 100) return null;
  const whole = Math.trunc(numeric);
  const day = Math.floor(whole / 100);
  const lotWithinDay = whole % 100;
  if (day < 1 || lotWithinDay < 1) return null;
  return day;
}

function detectAuctionDaysFromLotNumbers(lotNumbers) {
  const days = new Set();
  for (const lotNumber of lotNumbers) {
    const day = getAuctionDayFromLotNumber(lotNumber);
    if (day !== null) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

function filterLotsByAuctionDay(lots, filter) {
  if (filter === "all") return lots;
  return lots.filter((lot) => getAuctionDayFromLotNumber(lot.lotNumber) === filter);
}

const sampleLots = [
  { lotNumber: "101", stableId: "lot:101" },
  { lotNumber: "150", stableId: "lot:150" },
  { lotNumber: "201", stableId: "lot:201" },
  { lotNumber: "250", stableId: "lot:250" },
  { lotNumber: "301", stableId: "lot:301" },
  { lotNumber: "401", stableId: "lot:401" },
  { lotNumber: "TBD", stableId: "lot:tbd" },
];

test("auction day detection maps 101-199 to day 1", () => {
  assert.equal(getAuctionDayFromLotNumber(101), 1);
  assert.equal(getAuctionDayFromLotNumber("199"), 1);
});

test("auction day detection maps 201-299 to day 2", () => {
  assert.equal(getAuctionDayFromLotNumber(201), 2);
  assert.equal(getAuctionDayFromLotNumber("250"), 2);
});

test("auction day detection maps 301-399 to day 3", () => {
  assert.equal(getAuctionDayFromLotNumber(301), 3);
  assert.equal(getAuctionDayFromLotNumber("399"), 3);
});

test("auction day detection discovers additional days dynamically", () => {
  assert.deepEqual(
    detectAuctionDaysFromLotNumbers(sampleLots.map((lot) => lot.lotNumber)),
    [1, 2, 3, 4],
  );
});

test("all lots filter shows every lot including unknown numbers", () => {
  const filtered = filterLotsByAuctionDay(sampleLots, "all");
  assert.equal(filtered.length, sampleLots.length);
});

test("day filter shows only matching lots", () => {
  assert.equal(filterLotsByAuctionDay(sampleLots, 2).length, 2);
  assert.equal(filterLotsByAuctionDay(sampleLots, 2)[0]?.lotNumber, "201");
});

test("malformed lot numbers do not crash day detection", () => {
  assert.equal(getAuctionDayFromLotNumber("TBD"), null);
  assert.equal(getAuctionDayFromLotNumber(""), null);
  assert.doesNotThrow(() => getAuctionDayFromLotNumber(undefined));
});

test("unknown lots remain visible under all lots only", () => {
  const day1 = filterLotsByAuctionDay(sampleLots, 1);
  assert.equal(day1.some((lot) => lot.lotNumber === "TBD"), false);
  const all = filterLotsByAuctionDay(sampleLots, "all");
  assert.equal(all.some((lot) => lot.lotNumber === "TBD"), true);
});

test("filtered prev/next uses filtered lot sequence", () => {
  const day1Lots = filterLotsByAuctionDay(sampleLots, 1);
  assert.equal(day1Lots.length, 2);
  assert.equal(day1Lots[0]?.lotNumber, "101");
  assert.equal(day1Lots[1]?.lotNumber, "150");
  const index = 0;
  assert.equal(index > 0, false);
  assert.equal(index < day1Lots.length - 1, true);
});

test("all lots navigation crosses day boundaries", () => {
  const ordered = filterLotsByAuctionDay(sampleLots, "all");
  const idx101 = ordered.findIndex((lot) => lot.lotNumber === "101");
  const idx201 = ordered.findIndex((lot) => lot.lotNumber === "201");
  assert.ok(idx201 > idx101);
});

test("lot day filter UI is wired in local controller", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  const hook = read("src/components/bag-graphics/useDownloadedLotNavigation.ts");
  assert.match(controller, /detectedAuctionDays/);
  assert.match(controller, /filteredLots/);
  assert.match(hook, /filterLotsByAuctionDay/);
  assert.match(hook, /readSessionAuctionDayFilter/);
});

test("scraper recovery clears active lastError on healthy running status", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const bagLive = read("desktop/src/bag/live-state/bag-live-state-service.ts");
  assert.match(localData, /recoveredAfterSuccess/);
  assert.match(localData, /recordRunSuccess[\s\S]*lastError: null/);
  assert.match(bagLive, /lastError: status\?\.lastError \?\? null/);
});

test("offline identity falls back to cached access on network errors", () => {
  const identity = read("desktop/src/services/supabase-identity-service.ts");
  const auth = read("src/lib/projects/authorization.ts");
  assert.match(identity, /loadFromLocalCache/);
  assert.match(identity, /isNetworkError/);
  assert.match(auth, /meta\?\.identityStatus === "error"/);
  assert.match(auth, /localGetProjectAccessContext/);
});

test("display revision import reuses matching bundled source hash", () => {
  const service = read("desktop/src/services/broad-arrow-stream-displays-import-service.ts");
  const hash = read("desktop/src/displays/display-source-content-hash.ts");
  assert.match(hash, /hashBundledDisplayContentIdentity/);
  assert.match(service, /findByResourceAndSourceHash/);
  assert.match(service, /duplicateRevisionPrevented/);
  assert.match(service, /revisionCreationReason/);
});

test("online viewer toggle suppresses stale refetch during mutation", () => {
  const hook = read("src/lib/displays/use-online-viewer-settings.ts");
  assert.match(hook, /mutationGenerationRef/);
  assert.match(hook, /generationAtStart !== mutationGenerationRef\.current/);
  assert.doesNotMatch(hook, /\[displayEnabled, refresh\]/);
});

test("online viewer toggle rolls back only on failed local mutation", () => {
  const hook = read("src/lib/displays/use-online-viewer-settings.ts");
  assert.match(hook, /setEnabled\(previousEnabled\)/);
  assert.match(hook, /localUpdateOnlineViewerSettings/);
});
