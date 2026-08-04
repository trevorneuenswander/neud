import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("legacy-live transform changes only polling startup and adds NEUD bridge", async () => {
  const { transformLegacyTickerToLiveBridge, isLegacyTickerLiveHtml } = await import(
    "../dist/displays/legacy-display-v2-transform.js"
  );

  const v1Path = path.join(
    repoRoot,
    "desktop/src/displays/bundled/auction-ticker-overlay-v1.html",
  );
  const v1 = fs.readFileSync(v1Path, "utf8");
  const live = transformLegacyTickerToLiveBridge(v1);

  assert.equal(isLegacyTickerLiveHtml(live), true);
  assert.match(live, /initializeNeudTickerBridge/);
  assert.doesNotMatch(live, /poll\(\);\s*setInterval\(poll,\s*POLL\);/);
  assert.match(live, /async function poll\(\)/);

  const v1HtmlEnd = v1.indexOf("<script>");
  const liveHtmlEnd = live.indexOf("<script>");
  assert.equal(v1.slice(0, v1HtmlEnd), live.slice(0, liveHtmlEnd));

  const v1ScriptPrefix = v1.slice(v1HtmlEnd).replace(
    /poll\(\);\s*setInterval\(poll,\s*POLL\);[\s\S]*$/,
    "",
  );
  const liveScriptPrefix = live
    .slice(liveHtmlEnd)
    .replace(/window\.__NEUD_TICKER_REVISION__[\s\S]*$/, "");
  assert.equal(v1ScriptPrefix, liveScriptPrefix);
});

test("resolveBroadArrowTickerData uses runtime-delivered payload.next", async () => {
  const bridgePath = path.join(
    repoRoot,
    "desktop/src/displays/legacy-ticker-live-bridge.js",
  );
  const bridge = fs.readFileSync(bridgePath, "utf8");

  assert.match(bridge, /Array\.isArray\(payload\.next\)/);
  assert.match(bridge, /__NEUD_TICKER_REVISION__/);
  assert.match(bridge, /\[legacy-live-ticker\] init/);
});

test("legacy normalize receives next lots with lot and title fields", async () => {
  const { mapSnapshotToLowerTickerFeed } = await import(
    "../dist/displays/lower-ticker-data.js"
  );
  const { normalizeBroadArrowDisplayData } = await import(
    "../dist/displays/normalize-broad-arrow-display-data.js"
  );

  const snapshot = {
    next: [
      { lotNumber: "101", title: "1967 Shelby GT500" },
      { lot: "102", description: "1955 Mercedes 300 SL" },
    ],
    updatedAt: "2026-07-26T20:24:00.000Z",
    dataSource: "webpage-scraper",
  };

  const bridgePayload = {
    broadArrowDisplay: normalizeBroadArrowDisplayData(snapshot),
    next: snapshot.next,
  };

  assert.deepEqual(bridgePayload.broadArrowDisplay?.ticker.next, [
    { lot: "101", title: "1967 Shelby GT500" },
    { lot: "102", title: "1955 Mercedes 300 SL" },
  ]);

  const tickerFeed = mapSnapshotToLowerTickerFeed(snapshot);
  assert.equal(tickerFeed.next[0]?.lot, "101");
  assert.equal(tickerFeed.next[0]?.title, "1967 Shelby GT500");
});

test("v3 html upgrades back to untouched legacy visuals with live bridge", async () => {
  const { transformLegacyTickerToLiveBridge, isLegacyTickerV3Html } = await import(
    "../dist/displays/legacy-display-v2-transform.js"
  );

  const v3Fixture = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/bundled/auction-ticker-overlay-v1.html"),
    "utf8",
  );
  const fakeV3 =
    v3Fixture.replace(
      "function applyLotToSlot(slotIndex, lotObj){",
      "function resolveLotNumber() {}\nfunction applyLotToSlot(slotIndex, lotObj){",
    ).replace("</style>", `#variant-ticker { box-sizing: content-box; }\n</style>`);

  assert.equal(isLegacyTickerV3Html(fakeV3), true);

  const live = transformLegacyTickerToLiveBridge(fakeV3);
  assert.doesNotMatch(live, /function resolveLotNumber/);
  assert.doesNotMatch(live, /box-sizing:\s*content-box/);
  assert.match(live, /initializeNeudTickerBridge/);
});
