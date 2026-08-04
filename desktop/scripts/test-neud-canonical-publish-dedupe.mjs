#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  CanonicalRevisionTracker,
  hashCanonicalProjectDataForPublish,
  sanitizeCanonicalProjectData,
} from "../dist/publishing/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sampleData(lot = "101", updatedAt = "2026-07-27T21:30:45.000Z") {
  return sanitizeCanonicalProjectData({
    prev: null,
    current: { lot, title: "Sample Vehicle" },
    next: [],
    lots: [],
    lastSold: null,
    auctionDisplay: null,
    updatedAt,
    dataSource: "webpage-scraper",
  });
}

test("identical canonical data across polls keeps one revision", () => {
  const tracker = new CanonicalRevisionTracker();
  const first = tracker.observeCanonicalData(sampleData("101", "2026-07-27T21:30:45.000Z"));
  const second = tracker.observeCanonicalData(sampleData("101", "2026-07-27T21:30:46.000Z"));
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 1);
});

test("volatile updatedAt changes do not change publish hash", () => {
  const firstHash = hashCanonicalProjectDataForPublish(
    sampleData("101", "2026-07-27T21:30:45.000Z"),
  );
  const secondHash = hashCanonicalProjectDataForPublish(
    sampleData("101", "2026-07-27T21:30:46.000Z"),
  );
  assert.equal(firstHash, secondHash);
});

test("meaningful bid/lot change creates a new publish hash", () => {
  const firstHash = hashCanonicalProjectDataForPublish(sampleData("101"));
  const secondHash = hashCanonicalProjectDataForPublish(sampleData("102"));
  assert.notEqual(firstHash, secondHash);
});

test("publishing manager skips unchanged content hash before cloud publish", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /hashCanonicalProjectDataForPublish/);
  assert.match(manager, /if \(unchanged\)/);
  assert.match(manager, /ensurePublisherLease/);
});

test("local canonical snapshot logging is content-change only", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /snapshot content changed/);
  assert.doesNotMatch(localData, /snapshot published/);
});
