import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDisplayDocument } from "../templates";

describe("Local URL output background opacity", () => {
  it("does not force transparent on Stream Bid Local URL output", () => {
    const html = buildDisplayDocument({
      html: "<div>bid</div>",
      outputMode: true,
      displayInfo: { slug: "stream-bid-display" },
      viewportWidth: 3840,
      viewportHeight: 2160,
    });
    assert.doesNotMatch(html, /background:\s*transparent\s*!important/i);
  });

  it("keeps transparent force for Stream Ticker Local URL output", () => {
    const html = buildDisplayDocument({
      html: "<div>ticker</div>",
      outputMode: true,
      displayInfo: { slug: "stream-ticker" },
      viewportWidth: 3840,
      viewportHeight: 2160,
    });
    assert.match(html, /background:\s*transparent\s*!important/i);
  });

  it("does not force transparent on Lot Photos Local URL output", () => {
    const html = buildDisplayDocument({
      html: "<div>photos</div>",
      outputMode: true,
      displayInfo: { slug: "lot-photos" },
      viewportWidth: 3840,
      viewportHeight: 2160,
    });
    assert.doesNotMatch(html, /background:\s*transparent\s*!important/i);
  });
});
