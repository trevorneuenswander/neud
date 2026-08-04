#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CanonicalRevisionTracker,
  hashCanonicalProjectDataForPublish,
  sanitizeCanonicalProjectData,
} from "../dist/publishing/index.js";

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

test("canonical revision ignores updatedAt-only changes", () => {
  const tracker = new CanonicalRevisionTracker();
  const first = tracker.observeCanonicalData(sampleData("101", "2026-07-27T21:30:45.000Z"));
  const duplicate = tracker.observeCanonicalData(sampleData("101", "2026-07-27T21:30:46.000Z"));
  assert.equal(first.revision, 1);
  assert.equal(duplicate.revision, 1);
});

test("canonical revision increments only when sanitized payload changes", () => {
  const tracker = new CanonicalRevisionTracker();

  const first = tracker.observeCanonicalData(sampleData("101"));
  const duplicate = tracker.observeCanonicalData(sampleData("101"));
  const changed = tracker.observeCanonicalData(sampleData("102"));

  assert.equal(first.revision, 1);
  assert.equal(duplicate.revision, 1);
  assert.equal(changed.revision, 2);
});

test("canonical revision ignores null snapshots", () => {
  const tracker = new CanonicalRevisionTracker();
  tracker.observeCanonicalData(sampleData("101"));
  const unchanged = tracker.observeCanonicalData(null);

  assert.equal(unchanged.revision, 1);
});

test("seedFromPublishedState preserves cloud revision after restart", () => {
  const tracker = new CanonicalRevisionTracker();
  const data = sampleData("101");
  const hash = hashCanonicalProjectDataForPublish(data);
  tracker.seedFromPublishedState(42, hash);
  const observed = tracker.observeCanonicalData(data);

  assert.equal(observed.revision, 42);
  assert.equal(observed.payloadHash, hash);
});
