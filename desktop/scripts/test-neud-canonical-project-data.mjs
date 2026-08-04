import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCanonicalProjectSnapshot,
  normalizeScraperSnapshot,
  validateCanonicalProjectData,
  listCanonicalTopLevelKeys,
} from "../dist/displays/canonical-project-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const scraperSnapshot = {
  prev: { lot: "100", title: "Prev Lot", price: "$ 10,000", status: "Sold", editHref: "/100" },
  current: { lot: "101", title: "Current Lot", price: "$ 20,000", status: "Active", editHref: "/101" },
  next: [{ lot: "102", title: "Next Lot", price: "", status: null, editHref: "/102" }],
  lots: [{ lot: "101", title: "Current Lot", price: "$ 20,000", status: "Active", editHref: "/101" }],
  lastSold: { lot: "99", title: "Last Sold", price: "$ 5,000", editUrl: "/99" },
  auctionDisplay: {
    lot: "Lot 101",
    title: "Current Lot",
    year: "2020",
    biddingPrice: "$ 20,000",
    photos: ["https://example.test/photo.jpg"],
    currencies: ["USD"],
  },
  updatedAt: "2026-07-21T12:00:00.000Z",
};

test("webpage scraper output validates against canonical schema", () => {
  const canonical = normalizeScraperSnapshot(scraperSnapshot);
  assert.ok(canonical);
  const validation = validateCanonicalProjectData(canonical);
  assert.equal(validation.ok, true);
  assert.deepEqual(listCanonicalTopLevelKeys(), [
    "prev",
    "current",
    "next",
    "lots",
    "lastSold",
    "auctionDisplay",
    "updatedAt",
    "dataSource",
  ]);
});

test("local controller output uses the same top-level keys as scraper output", () => {
  const localControllerState = {
    currentLot: {
      lotNumber: "101",
      title: "Manual Title",
      reserveStatus: "No Reserve",
      currentBidLabel: "25000",
      currentBid: 25000,
      imageUrl: "https://example.test/manual.jpg",
      photos: ["https://example.test/manual.jpg"],
    },
    nextLots: [{ lotNumber: "102", title: "Next Lot" }],
    auctionDisplay: {
      lot: "Lot 101",
      title: "Manual Title",
      biddingPrice: "25000",
      photos: ["https://example.test/manual.jpg"],
      currencies: ["USD"],
    },
  };

  const canonical = buildCanonicalProjectSnapshot({
    source: "local-controller",
    scraperSnapshot,
    localControllerState,
  });

  assert.ok(canonical);
  const validation = validateCanonicalProjectData(canonical);
  assert.equal(validation.ok, true);

  const scraperCanonical = normalizeScraperSnapshot(scraperSnapshot);
  assert.ok(scraperCanonical);
  const scraperKeys = Object.keys(scraperCanonical).sort();
  const localKeys = Object.keys(canonical).sort();
  assert.deepEqual(localKeys, scraperKeys);

  assert.equal(canonical.dataSource, "local-controller");
  assert.equal(canonical.current?.lot, "101");
  assert.equal(canonical.current?.title, "Manual Title");
  assert.equal(canonical.current?.price, "25000");
  assert.equal(canonical.prev?.lot, "100");
  assert.equal(Array.isArray(canonical.lots), true);
  assert.equal(Array.isArray(canonical.auctionDisplay?.photos), true);
});

test("undefined manual values do not erase scraper metadata", () => {
  const localControllerState = {
    currentLot: {
      lotNumber: "101",
      currentBidLabel: "26000",
    },
    auctionDisplay: {
      biddingPrice: "26000",
    },
  };

  const canonical = buildCanonicalProjectSnapshot({
    source: "local-controller",
    scraperSnapshot,
    localControllerState,
  });

  assert.equal(canonical?.current?.title, "Current Lot");
  assert.equal(canonical?.auctionDisplay?.year, "2020");
  assert.deepEqual(canonical?.auctionDisplay?.photos, ["https://example.test/photo.jpg"]);
});

test("json preview and display bridge use canonical snapshot path", () => {
  const preview = readSrc("src/components/data-engines/webpage-scraper/BagLiveStateJsonPreview.tsx");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const resolver = readSrc("desktop/src/displays/resolve-effective-display-data.ts");

  assert.match(preview, /canonicalSnapshot/);
  assert.match(localData, /getActiveCanonicalProjectSnapshot/);
  assert.match(localData, /effective\.canonicalSnapshot/);
  assert.match(resolver, /buildCanonicalProjectSnapshot/);
});
