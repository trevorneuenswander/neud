#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildCanonicalProjectSnapshot,
  normalizeScraperSnapshot,
} from "../dist/displays/canonical-project-data.js";
import {
  hashCanonicalProjectDataForPublish,
  sanitizeCanonicalProjectData,
} from "../dist/publishing/index.js";
import {
  diffCanonicalStructuralGroups,
  fingerprintCanonicalStructuralGroups,
} from "../dist/services/canonical/canonical-pipeline-diagnostics.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const scraperSnapshot = {
  current: { lot: "101", title: "Scraper Lot", price: "$ 10,000", status: "Active" },
  next: [],
  lots: [],
  auctionDisplay: { biddingPrice: "$ 10,000", currencies: ["USD"] },
  updatedAt: "2026-07-21T12:00:00.000Z",
};

const localControllerState = {
  currentLot: {
    lotNumber: "101",
    title: "Manual Lot",
    currentBidLabel: "$ 25,000",
    currentBid: 25000,
    reserveStatus: "No Reserve",
  },
  nextLots: [{ lotNumber: "102", title: "Next Lot" }],
  auctionDisplay: {
    biddingPrice: "$ 25,000",
    currencies: ["USD", "EUR 23.000"],
    photos: ["https://example.test/manual.jpg"],
  },
};

test("webpage-scraper canonical ignores local controller mutations", () => {
  const canonical = buildCanonicalProjectSnapshot({
    source: "webpage-scraper",
    scraperSnapshot,
    localControllerState,
  });
  assert.equal(canonical?.current?.lot, "101");
  assert.equal(canonical?.current?.price, "$ 10,000");
  assert.equal(canonical?.dataSource, "webpage-scraper");
});

test("local-controller canonical uses submitted controller state", () => {
  const canonical = buildCanonicalProjectSnapshot({
    source: "local-controller",
    scraperSnapshot,
    localControllerState,
  });
  assert.equal(canonical?.dataSource, "local-controller");
  assert.match(String(canonical?.current?.price), /25,000/);
});

test("manual bid change changes publish hash in local-controller mode", () => {
  const first = buildCanonicalProjectSnapshot({
    source: "local-controller",
    scraperSnapshot,
    localControllerState,
  });
  const second = buildCanonicalProjectSnapshot({
    source: "local-controller",
    scraperSnapshot,
    localControllerState: {
      ...localControllerState,
      currentLot: {
        ...localControllerState.currentLot,
        currentBidLabel: "$ 30,000",
        currentBid: 30000,
      },
    },
  });
  const firstHash = hashCanonicalProjectDataForPublish(sanitizeCanonicalProjectData(first));
  const secondHash = hashCanonicalProjectDataForPublish(sanitizeCanonicalProjectData(second));
  assert.notEqual(firstHash, secondHash);
});

test("manual bid draft in scraper mode does not replace scraper hash", () => {
  const scraperOnly = buildCanonicalProjectSnapshot({
    source: "webpage-scraper",
    scraperSnapshot,
    localControllerState,
  });
  const scraperHash = hashCanonicalProjectDataForPublish(
    sanitizeCanonicalProjectData(scraperOnly),
  );
  const unchanged = buildCanonicalProjectSnapshot({
    source: "webpage-scraper",
    scraperSnapshot,
    localControllerState: {
      ...localControllerState,
      currentLot: {
        ...localControllerState.currentLot,
        currentBidLabel: "$ 99,999",
      },
    },
  });
  const unchangedHash = hashCanonicalProjectDataForPublish(
    sanitizeCanonicalProjectData(unchanged),
  );
  assert.equal(scraperHash, unchangedHash);
});

test("reserve and photo structural groups change hash", () => {
  const base = sanitizeCanonicalProjectData(
    buildCanonicalProjectSnapshot({
      source: "local-controller",
      scraperSnapshot,
      localControllerState,
    }),
  );
  const reserveChanged = sanitizeCanonicalProjectData({
    ...base,
    current: { ...base.current, status: "Reserve Met" },
  });
  const photosChanged = sanitizeCanonicalProjectData({
    ...base,
    auctionDisplay: {
      ...(base.auctionDisplay ?? {}),
      photos: ["https://example.test/a.jpg", "https://example.test/b.jpg"],
    },
  });
  assert.notEqual(
    hashCanonicalProjectDataForPublish(base),
    hashCanonicalProjectDataForPublish(reserveChanged),
  );
  assert.notEqual(
    hashCanonicalProjectDataForPublish(base),
    hashCanonicalProjectDataForPublish(photosChanged),
  );
});

test("structural diff reports changed groups without values", () => {
  const before = buildCanonicalProjectSnapshot({
    source: "local-controller",
    scraperSnapshot,
    localControllerState,
  });
  const after = buildCanonicalProjectSnapshot({
    source: "local-controller",
    scraperSnapshot,
    localControllerState: {
      ...localControllerState,
      currentLot: {
        ...localControllerState.currentLot,
        lotNumber: "102",
      },
    },
  });
  const changed = diffCanonicalStructuralGroups(before, after);
  assert.ok(changed.includes("current"));
  assert.ok(fingerprintCanonicalStructuralGroups(after).includes("current"));
});

test("local controller submit routes notify staged state without auto source switch", () => {
  const routes = read("desktop/src/bag/live-state/bag-live-state-routes.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(routes, /notifyLocalControllerStateChanged|notifyLocalControllerCanonicalChanged/);
  assert.match(routes, /submit-bid/);
  assert.match(routes, /submit-lot/);
  assert.match(localData, /notifyLocalControllerStateChanged/);
  assert.match(localData, /notifyActiveCanonicalDataChanged/);
  assert.match(localData, /notifySelectedCanonicalSourceChanged/);
  assert.match(localData, /inactiveSourceStateStaged/);
  assert.doesNotMatch(localData, /setDisplayDataSource\("local-controller",\s*\{\s*reason:\s*`controller:/);
});

test("publishing manager requests immediate sync for controller and scraper reasons", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /notifyProjectCanonicalMayHaveChanged\(projectId: string, reason/);
  assert.match(manager, /const delayMs = reason === "heartbeat" \? PUBLISHING_DEBOUNCE_MS : 0/);
  assert.match(manager, /lastCanonicalPublicationAttemptAt/);
  assert.match(manager, /duplicate_unchanged/);
  assert.match(manager, /canonicalPublicationFollowUpRequested/);
});

test("scraper updates notify only while webpage-scraper source is selected", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /getDisplayDataSource\(\) !== "webpage-scraper"/);
  assert.match(main, /observeScraperCanonicalUpdate/);
});

test("diagnose canonical change script reports source and publication timestamps", () => {
  const script = read("scripts/live-validation/diagnose-broad-arrow-canonical-change.mjs");
  assert.match(script, /selectedDataSource/);
  assert.match(script, /lastCanonicalPublicationAttemptAt/);
  assert.match(script, /lastChangedStructuralGroups/);
  assert.doesNotMatch(script, /current\.price/);
});
