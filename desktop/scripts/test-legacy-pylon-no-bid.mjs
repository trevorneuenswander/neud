#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  hasCanonicalBid,
  normalizeDisplayBid,
  parseCanonicalBid,
} from "../dist/displays/display-bid-normalization.js";
import { mapLiveStateToPylonFeed, mapSnapshotToPylonFeed } from "../dist/displays/pylon-data.js";
import { resolveLocalControllerDisplayData } from "../dist/displays/resolve-local-controller-display-data.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const INVALID_BID_INPUTS = [
  null,
  undefined,
  "",
  "—",
  "$",
  "$0",
  "$0.00",
  "0",
  0,
  Number.NaN,
  "$NaN",
  "null",
  "undefined",
  "No Bid",
];

function hasBidValue(value) {
  const v = (value || "").toString().trim();
  if (!v) return false;
  if (v === "—") return false;
  if (/^\$?\s*0(?:\.00)?$/i.test(v)) return false;
  return /\d/.test(v);
}

function simulatePylonBidState(auctionDisplay) {
  const showBid = hasBidValue(auctionDisplay.biddingPrice);
  return {
    bidSectionCollapsed: !showBid,
    currencyRowCount: showBid
      ? (Array.isArray(auctionDisplay.currencies) ? auctionDisplay.currencies : []).length
      : 0,
  };
}

test("parseCanonicalBid rejects invalid no-bid values", () => {
  for (const value of INVALID_BID_INPUTS) {
    assert.equal(parseCanonicalBid(value), null, `Expected null for ${String(value)}`);
    assert.equal(hasCanonicalBid(value), false, `Expected false for ${String(value)}`);
    assert.equal(normalizeDisplayBid(value), "—", `Expected em dash for ${String(value)}`);
  }
});

test("normalizeDisplayBid formats valid manual bids", () => {
  assert.equal(normalizeDisplayBid(125000), "$ 125,000");
  assert.equal(normalizeDisplayBid("$125,000"), "$ 125,000");
  assert.equal(normalizeDisplayBid("125000"), "$ 125,000");
});

test("local controller no-bid payload normalizes to em dash and empty currencies", () => {
  const resolved = resolveLocalControllerDisplayData({
    submitted: {
      currentLot: {
        lotNumber: "112",
        title: "No Bid Lot",
        currentBid: null,
        currentBidLabel: "",
      },
      auctionDisplay: {
        biddingPrice: "$NaN",
        currencies: ["EUR  €115,000", "GBP  £98,000"],
      },
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.auctionDisplay?.biddingPrice, "—");
  assert.deepEqual(resolved.auctionDisplay?.currencies, []);

  const pylonFeed = mapLiveStateToPylonFeed(resolved);
  assert.equal(pylonFeed.auctionDisplay.biddingPrice, "—");
  assert.deepEqual(pylonFeed.auctionDisplay.currencies, []);

  const dom = simulatePylonBidState(pylonFeed.auctionDisplay);
  assert.equal(dom.bidSectionCollapsed, true);
  assert.equal(dom.currencyRowCount, 0);
});

test("scraper and local controller no-bid payloads match", () => {
  const scraper = mapSnapshotToPylonFeed({
    auctionDisplay: {
      lot: "Lot 112",
      title: "Example Lot",
      biddingPrice: "—",
      currencies: [],
    },
  });

  const local = mapLiveStateToPylonFeed(
    resolveLocalControllerDisplayData({
      submitted: {
        currentLot: {
          lotNumber: "112",
          title: "Example Lot",
          currentBid: null,
          currentBidLabel: "",
        },
        auctionDisplay: {
          currencies: [],
        },
      },
    }),
  );

  assert.equal(scraper.auctionDisplay.biddingPrice, "—");
  assert.equal(local.auctionDisplay.biddingPrice, "—");
  assert.deepEqual(scraper.auctionDisplay.currencies, []);
  assert.deepEqual(local.auctionDisplay.currencies, []);
  assert.equal(simulatePylonBidState(scraper.auctionDisplay).bidSectionCollapsed, true);
  assert.equal(simulatePylonBidState(local.auctionDisplay).bidSectionCollapsed, true);
});

test("valid manual bid expands pylon bid state", () => {
  const pylonFeed = mapLiveStateToPylonFeed(
    resolveLocalControllerDisplayData({
      submitted: {
        currentLot: {
          lotNumber: "111",
          title: "Bid Lot",
          currentBid: 125000,
          currentBidLabel: "$ 125,000",
        },
        auctionDisplay: {
          biddingPrice: "$ 125,000",
          currencies: ["EUR  €115,000", "GBP  £98,000"],
        },
      },
    }),
  );

  assert.equal(pylonFeed.auctionDisplay.biddingPrice, "$ 125,000");
  assert.ok(pylonFeed.auctionDisplay.currencies.length > 0);
  const dom = simulatePylonBidState(pylonFeed.auctionDisplay);
  assert.equal(dom.bidSectionCollapsed, false);
});

test("legacy pylon bridge normalizes invalid local controller bids", () => {
  const bridgeSource = readSrc("desktop/src/displays/legacy-pylon-live-bridge.js");
  const renderCalls = [];
  const sandbox = {
    renderCalls,
    statusEl: { textContent: "" },
    ENDPOINT: null,
    POLL: 1000,
    console,
    setTimeout,
    setInterval,
    clearInterval,
    clearTimeout() {},
    window: {},
  };

  sandbox.window = {
    addEventListener() {},
    postMessage() {},
    location: { origin: "http://127.0.0.1:3000", href: "http://127.0.0.1:3000" },
    parent: { postMessage() {} },
    render(feed) {
      renderCalls.push(feed);
    },
    NEUDDisplay: {
      getSnapshot: () => ({
        broadArrowDisplay: {
          pylon: {
            lot: "Lot 112",
            title: "Example Lot",
            biddingPrice: "$NaN",
            currencies: ["EUR  €115,000"],
          },
        },
      }),
      subscribe(callback) {
        callback({
          broadArrowDisplay: {
            pylon: {
              lot: "Lot 112",
              title: "Example Lot",
              biddingPrice: "$NaN",
              currencies: ["EUR  €115,000"],
            },
          },
        });
        return () => {};
      },
      signalReady() {},
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(bridgeSource, sandbox);

  assert.ok(renderCalls.length >= 1);
  const auctionDisplay = renderCalls[0].auctionDisplay;
  assert.equal(auctionDisplay.biddingPrice, "—");
  assert.equal(auctionDisplay.currencies.length, 0);
  assert.equal(simulatePylonBidState(auctionDisplay).bidSectionCollapsed, true);
});

test("local controller service clears stale currencies on lot submit", () => {
  const service = readSrc("desktop/src/bag/live-state/bag-local-controller-service.ts");
  assert.match(service, /initialBidAmount != null\s*\?\s*this\.providers\.buildBidCurrencyStrings/);
  assert.doesNotMatch(service, /baseSubmitted\.auctionDisplay\?\.currencies/);
  assert.match(service, /clearSubmittedBid/);
  assert.match(service, /stripAllLotBids/);
});

test("manual bid submit can be cleared from controller UI", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /submittedBidAmount === null/);
});
