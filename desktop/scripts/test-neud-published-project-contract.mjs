#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
  buildPublishedProjectPayload,
  validatePublishedProjectPayload,
} from "../dist/publishing/index.js";

function sampleCanonicalData() {
  return {
    prev: null,
    current: { lot: "101", title: "Sample Vehicle", biddingPrice: "$10,000" },
    next: [{ lot: "102", title: "Next Vehicle" }],
    lots: [],
    lastSold: null,
    auctionDisplay: {
      lot: "Lot 101",
      title: "Sample Vehicle",
      biddingPrice: "$10,000",
      currencies: ["EUR 9,000"],
      photos: ["https://cdn.example.com/photo.jpg"],
    },
    updatedAt: "2026-07-27T21:30:45.000Z",
    dataSource: "webpage-scraper",
  };
}

test("published project contract validates a complete envelope", () => {
  const payload = buildPublishedProjectPayload({
    projectId: "11111111-1111-1111-1111-111111111111",
    projectSlug: "broad-arrow-auctions",
    revision: 3,
    generatedAt: "2026-07-27T21:30:45.000Z",
    publisherInstanceId: "22222222-2222-2222-2222-222222222222",
    publisherLastSeenAt: "2026-07-27T21:30:46.000Z",
    sourceMode: "webpage-scraper",
    sourceConnected: true,
    data: sampleCanonicalData(),
  });

  assert.equal(payload.contractVersion, NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION);
  const validation = validatePublishedProjectPayload(payload);
  assert.equal(validation.ok, true);
});

test("published project contract rejects invalid contract version and source mode", () => {
  const payload = buildPublishedProjectPayload({
    projectId: "11111111-1111-1111-1111-111111111111",
    projectSlug: "broad-arrow-auctions",
    revision: 1,
    generatedAt: "2026-07-27T21:30:45.000Z",
    publisherInstanceId: "22222222-2222-2222-2222-222222222222",
    publisherLastSeenAt: "2026-07-27T21:30:46.000Z",
    sourceMode: "webpage-scraper",
    sourceConnected: true,
    data: sampleCanonicalData(),
  });

  assert.equal(validatePublishedProjectPayload({ ...payload, contractVersion: "2.0" }).ok, false);
  assert.equal(
    validatePublishedProjectPayload({
      ...payload,
      source: { mode: "manual", connected: true },
    }).ok,
    false,
  );
});

test("published project contract requires project identity and ISO timestamps", () => {
  const payload = buildPublishedProjectPayload({
    projectId: "",
    projectSlug: "",
    revision: -1,
    generatedAt: "not-a-date",
    publisherInstanceId: "",
    publisherLastSeenAt: "not-a-date",
    sourceMode: "local-controller",
    sourceConnected: false,
    data: sampleCanonicalData(),
  });

  const validation = validatePublishedProjectPayload(payload);
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.ok(validation.issues.some((issue) => issue.includes("projectId")));
    assert.ok(validation.issues.some((issue) => issue.includes("generatedAt")));
  }
});
