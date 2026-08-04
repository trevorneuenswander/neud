#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sanitizeCanonicalProjectData,
  hashCanonicalProjectData,
} from "../dist/publishing/index.js";

function dirtyCanonicalData() {
  return {
    prev: null,
    current: {
      lot: "101",
      title: "Sample Vehicle",
      password: "auction-secret",
      authToken: "abc123",
      email: "operator@example.com",
      workerConfig: { executable: "puppeteer" },
      filePath: "C:\\Users\\Trevor\\secret\\config.json",
    },
    next: [{ lot: "102", title: "Next Vehicle", sessionId: "sess-123" }],
    lots: [],
    lastSold: null,
    auctionDisplay: {
      lot: "Lot 101",
      title: "Sample Vehicle",
      biddingPrice: "$10,000",
      serviceRoleKey: "super-secret",
      scraperSource: "console.log('secret')",
      currencies: ["EUR 9,000"],
      photos: ["https://cdn.example.com/photo.jpg"],
    },
    updatedAt: "2026-07-27T21:30:45.000Z",
    dataSource: "webpage-scraper",
  };
}

test("sanitizer removes credentials, tokens, paths, and contact data", () => {
  const sanitized = sanitizeCanonicalProjectData(dirtyCanonicalData());
  const serialized = JSON.stringify(sanitized);

  assert.doesNotMatch(serialized, /auction-secret/);
  assert.doesNotMatch(serialized, /abc123/);
  assert.doesNotMatch(serialized, /operator@example.com/);
  assert.doesNotMatch(serialized, /super-secret/);
  assert.doesNotMatch(serialized, /puppeteer/);
  assert.doesNotMatch(serialized, /C:\\Users\\Trevor/);
  assert.doesNotMatch(serialized, /sess-123/);
});

test("sanitizer retains allowed canonical display fields", () => {
  const sanitized = sanitizeCanonicalProjectData(dirtyCanonicalData());

  assert.equal(sanitized.current?.lot, "101");
  assert.equal(sanitized.current?.title, "Sample Vehicle");
  assert.equal(sanitized.next[0]?.lot, "102");
  assert.equal(sanitized.auctionDisplay?.biddingPrice, "$10,000");
  assert.deepEqual(sanitized.auctionDisplay?.currencies, ["EUR 9,000"]);
  assert.equal(sanitized.dataSource, "webpage-scraper");
});

test("sanitizer output is stable for duplicate detection hashing", () => {
  const first = sanitizeCanonicalProjectData(dirtyCanonicalData());
  const second = sanitizeCanonicalProjectData({
    ...dirtyCanonicalData(),
    current: {
      ...dirtyCanonicalData().current,
      password: "different-secret",
    },
  });

  assert.equal(hashCanonicalProjectData(first), hashCanonicalProjectData(second));
});
