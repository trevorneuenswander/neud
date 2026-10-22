import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getStreamBidReserveText,
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
  assert.equal(withReserve?.auctionDisplay?.reserveStatus, "Offered Without Reserve");

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

// ---- B1: Stream Bid reserve status regression tests ----

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadStreamBidFormatter() {
  const html = readFileSync(
    join(desktopRoot, "src/displays/bundled/stream-bid-display-v1.html"),
    "utf8",
  );
  const start = html.indexOf("function textValue(");
  const fmtStart = html.indexOf("function formatReserveStatusForStreamBid");
  const fmtEnd = html.indexOf("function buildHeaderState");
  assert.ok(start >= 0 && fmtStart >= 0 && fmtEnd > fmtStart, "stream bid formatter present");
  const textValueEnd = html.indexOf("\n  }\n", start) + 4;
  const source = `${html.slice(start, textValueEnd)}\n${html.slice(fmtStart, fmtEnd)}\nreturn formatReserveStatusForStreamBid;`;
  return new Function(source)();
}

test("getStreamBidReserveText only returns Offered Without Reserve", () => {
  assert.equal(getStreamBidReserveText("offered_without_reserve"), "Offered Without Reserve");
  assert.equal(getStreamBidReserveText("Offered Without Reserve"), "Offered Without Reserve");
  assert.equal(getStreamBidReserveText("OFFERED WITHOUT RESERVE"), "Offered Without Reserve");
  assert.equal(getStreamBidReserveText("no_reserve"), "Offered Without Reserve");
  for (const value of ["has_reserve", "Has Reserve", "Reserve", "reserve_met", "unknown", "Unknown", "Active", "", null, undefined]) {
    assert.equal(getStreamBidReserveText(value), "", `blank for ${String(value)}`);
  }
});

test("stream bid display never shows Active, Has Reserve, Reserve, or Unknown", () => {
  const format = loadStreamBidFormatter();
  assert.deepEqual(format("Offered Without Reserve"), { display: "Offered Without Reserve", layout: "visible" });
  assert.deepEqual(format("OFFERED WITHOUT RESERVE"), { display: "Offered Without Reserve", layout: "visible" });
  assert.deepEqual(format("offered_without_reserve"), { display: "Offered Without Reserve", layout: "visible" });
  assert.equal(format("Has Reserve").display, "");
  assert.equal(format("has_reserve").display, "");
  for (const value of ["Unknown", "unknown", null, undefined, "", "Active", "active", "Reserve", "Reserve Met", "Live", "ok"]) {
    assert.equal(format(value).display, "", `blank display for ${String(value)}`);
  }
  // Has Reserve keeps row spacing (design unchanged); Unknown/other stay hidden.
  assert.equal(format("Has Reserve").layout, "placeholder");
  assert.equal(format("Unknown").layout, "hidden");
  assert.equal(format("Active").layout, "hidden");
});

test("stream bid bridge does not source reserve text from generic current.status", () => {
  const bridge = readFileSync(join(desktopRoot, "src/displays/stream-bid-v2-bridge.js"), "utf8");
  assert.doesNotMatch(bridge, /current\.status/);
  assert.match(bridge, /current\.reserveStatus/);
});
