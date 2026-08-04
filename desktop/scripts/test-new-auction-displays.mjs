import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDemoNewAuctionGraphicPayload,
  buildNewAuctionGraphicPayload,
} from "../dist/displays/new-auction-graphic-data.js";

test("new auction graphic adapter normalizes scraper snapshot", () => {
  const payload = buildNewAuctionGraphicPayload({
    source: "webpage-scraper",
    scraperSnapshot: {
      auctionDisplay: {
        lot: "999",
        title: "Ferrari 275 GTB/4",
        year: "1967",
        reserveStatus: "Offered Without Reserve",
        biddingPrice: "$44,000,000",
        currencies: ["EUR 38635520", "GBP 33456000", "CHF 36960000", "JPY 6512000000"],
        photos: ["https://example.com/photo.jpg"],
      },
      next: [{ lot: "1000", title: "Mercedes-Benz 300 SL" }],
    },
    localControllerState: null,
    revision: 1,
    enabled: true,
    status: "ok",
  });

  assert.equal(payload.current.lot, "Lot 999");
  assert.equal(payload.current.title, "1967 Ferrari 275 GTB/4");
  assert.equal(payload.current.biddingPrice, "$44,000,000");
  assert.equal(payload.current.currencies.EUR, "38,635,520");
  assert.equal(payload.next.length, 1);
});

test("new auction graphic adapter maps positional local-controller currencies", () => {
  const payload = buildNewAuctionGraphicPayload({
    source: "local-controller",
    scraperSnapshot: null,
    localControllerState: {
      currentLot: {
        lotNumber: "101",
        title: "Test Lot",
        currentBid: 25000,
        currentBidLabel: "$25,000",
      },
      auctionDisplay: {
        currencies: ["23,000", "19,750", "22,000", "3,750,000"],
      },
    },
    submittedState: {
      auctionDisplay: {
        currencies: ["23,000", "19,750", "22,000", "3,750,000"],
      },
    },
    revision: 1,
    enabled: true,
    status: "ok",
  });

  assert.equal(payload.current.currencies.EUR, "23,000");
  assert.equal(payload.current.currencies.GBP, "19,750");
  assert.equal(payload.current.currencies.CHF, "22,000");
  assert.equal(payload.current.currencies.JPY, "3,750,000");
});

test("new auction graphic adapter hides invalid bids", () => {
  const payload = buildNewAuctionGraphicPayload({
    source: "webpage-scraper",
    scraperSnapshot: {
      auctionDisplay: {
        lot: "999",
        title: "Test Lot",
        biddingPrice: "$0",
        currencies: [],
        photos: [],
      },
    },
    localControllerState: null,
  });

  assert.equal(payload.current.biddingPrice, null);
});

test("demo payload is valid", () => {
  const payload = buildDemoNewAuctionGraphicPayload();
  assert.equal(payload.current.lot, "Lot 999");
  assert.equal(payload.next.length, 3);
});
