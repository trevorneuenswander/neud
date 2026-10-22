import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getStreamBidReserveText,
  normalizeReserveStatus,
} from "../reserve-status";

describe("Stream Bid reserve status", () => {
  it("blanks Has Reserve and Unknown", () => {
    assert.equal(getStreamBidReserveText("has_reserve"), "");
    assert.equal(getStreamBidReserveText("Has Reserve"), "");
    assert.equal(getStreamBidReserveText("unknown"), "");
    assert.equal(getStreamBidReserveText("Unknown"), "");
    assert.equal(getStreamBidReserveText(""), "");
    assert.equal(getStreamBidReserveText(null), "");
  });

  it("shows only Offered Without Reserve exactly", () => {
    assert.equal(
      getStreamBidReserveText("offered_without_reserve"),
      "Offered Without Reserve",
    );
    assert.equal(
      getStreamBidReserveText("Offered Without Reserve"),
      "Offered Without Reserve",
    );
    assert.equal(getStreamBidReserveText("no_reserve"), "Offered Without Reserve");
  });

  it("never surfaces Active / Reserve lifecycle labels on Stream Bid", () => {
    assert.equal(normalizeReserveStatus("Active"), "unknown");
    assert.equal(getStreamBidReserveText("Active"), "");
    assert.equal(getStreamBidReserveText("Reserve"), "");
    assert.equal(getStreamBidReserveText("Sold"), "");
  });
});
