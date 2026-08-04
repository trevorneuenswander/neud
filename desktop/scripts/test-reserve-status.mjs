import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReserveStatus,
  resolveMergedReserveStatusLabel,
  resolveMergedReserveStatusLabelOrUnknown,
  resolveLotReserveStatusLabel,
  serializeReserveStatusForStorage,
} from "../dist/bag/reserve-status.js";
import { orderedLotsFromDataset } from "../dist/bag/live-state/bag-manual-lot-navigation.js";
import { resolveLocalControllerDisplayData } from "../dist/displays/resolve-local-controller-display-data.js";
import { buildNewAuctionGraphicPayload } from "../dist/displays/new-auction-graphic-data.js";

test("normalizeReserveStatus maps common source values", () => {
  assert.equal(normalizeReserveStatus("Reserve Met"), "has_reserve");
  assert.equal(normalizeReserveStatus("Offered Without Reserve"), "offered_without_reserve");
  assert.equal(normalizeReserveStatus("reserve_not_met"), "has_reserve");
  assert.equal(normalizeReserveStatus(null), "unknown");
  assert.equal(normalizeReserveStatus("garbage"), "unknown");
});

test("serializeReserveStatusForStorage preserves canonical values", () => {
  assert.equal(serializeReserveStatusForStorage("has_reserve"), "has_reserve");
  assert.equal(serializeReserveStatusForStorage("Reserve Not Met"), "has_reserve");
  assert.equal(serializeReserveStatusForStorage(undefined), "unknown");
});

test("orderedLotsFromDataset merges reserve status from downloaded lots", () => {
  const automaticLots = [{ lotNumber: "101", title: "Automatic" }];
  const dataset = {
    lots: [{ lot: "101", title: "Downloaded", reserveStatus: "reserve_met" }],
  };
  const ordered = orderedLotsFromDataset(automaticLots, dataset);
  assert.equal(ordered[0]?.lotNumber, "101");
  assert.equal(ordered[0]?.reserveStatus, "Has Reserve");
});

test("orderedLotsFromDataset leaves reserve unknown for legacy files without reserve", () => {
  const dataset = { lots: [{ lot: "101", title: "Legacy lot" }] };
  const ordered = orderedLotsFromDataset([], dataset);
  assert.equal(ordered[0]?.reserveStatus, undefined);
});

test("resolveLocalControllerDisplayData uses dataset reserve and unknown fallback", () => {
  const withReserve = resolveLocalControllerDisplayData({
    submitted: {
      currentLot: { lotNumber: "101", title: "Test Lot" },
    },
    dataset: {
      lots: [{ lot: "101", title: "Test Lot", reserveStatus: "no_reserve" }],
    },
  });
  assert.equal(withReserve?.currentLot?.reserveStatus, "Offered Without Reserve");
  assert.equal(withReserve?.auctionDisplay?.reserveStatus, "OFFERED WITHOUT RESERVE");

  const legacy = resolveLocalControllerDisplayData({
    submitted: {
      currentLot: { lotNumber: "101", title: "Test Lot" },
    },
    dataset: {
      lots: [{ lot: "101", title: "Test Lot" }],
    },
  });
  assert.equal(legacy?.currentLot?.reserveStatus, "Unknown");
});

test("resolveMergedReserveStatusLabel prefers submitted over dataset", () => {
  assert.equal(
    resolveMergedReserveStatusLabel("offered_without_reserve", { reserveStatus: "has_reserve" }),
    "OFFERED WITHOUT RESERVE",
  );
  assert.equal(
    resolveMergedReserveStatusLabelOrUnknown(undefined, { reserveStatus: "has_reserve" }),
    "Has Reserve",
  );
});

test("resolveLotReserveStatusLabel only returns visible reserve labels", () => {
  assert.equal(
    resolveLotReserveStatusLabel({ reserveStatus: "has_reserve" }, null),
    undefined,
  );
  assert.equal(
    resolveLotReserveStatusLabel({ reserveStatus: "offered_without_reserve" }, null),
    "OFFERED WITHOUT RESERVE",
  );
});

test("webpage scraper and local controller produce the same reserve field shape", () => {
  const scraperPayload = buildNewAuctionGraphicPayload({
    source: "webpage-scraper",
    scraperSnapshot: {
      auctionDisplay: {
        lot: "101",
        title: "Ferrari",
        reserveStatus: "Offered Without Reserve",
        biddingPrice: "$1,000,000",
        currencies: [],
        photos: [],
      },
      lots: [],
    },
    localControllerState: null,
  });

  const localPayload = buildNewAuctionGraphicPayload({
    source: "local-controller",
    scraperSnapshot: null,
    localControllerState: resolveLocalControllerDisplayData({
      submitted: {
        currentLot: {
          lotNumber: "101",
          title: "Ferrari",
          reserveStatus: "Offered Without Reserve",
        },
      },
    }),
    submittedState: {
      currentLot: {
        lotNumber: "101",
        title: "Ferrari",
        reserveStatus: "Offered Without Reserve",
      },
    },
  });

  assert.equal(scraperPayload.current.reserveStatus, "OFFERED WITHOUT RESERVE");
  assert.equal(localPayload.current.reserveStatus, "OFFERED WITHOUT RESERVE");
});
