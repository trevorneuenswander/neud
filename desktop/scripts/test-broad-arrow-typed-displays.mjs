import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Broad Arrow renderer registry keeps ticker only", () => {
  const registrySource = read("src/lib/displays/broad-arrow/renderer-registry.tsx");
  const keysSource = read("src/lib/displays/broad-arrow/renderer-keys.ts");
  assert.match(registrySource, /BROAD_ARROW_TICKER_RENDERER_KEY/);
  assert.match(registrySource, /BroadArrowTicker/);
  assert.doesNotMatch(registrySource, /BroadArrowPylon/);
  assert.doesNotMatch(keysSource, /"broad-arrow-pylon"/);
  assert.match(keysSource, /"broad-arrow-ticker"/);
});

test("unknown renderer keys fail clearly", () => {
  const source = read("src/lib/displays/broad-arrow/renderer-registry.tsx");
  assert.match(source, /resolveBroadArrowDisplayRenderer/);
  const errorSource = read("src/components/displays/broad-arrow/BroadArrowRendererError.tsx");
  assert.match(errorSource, /Unknown Broad Arrow renderer/);
});

test("canonical JSON normalizes through one shared adapter", () => {
  const source = read("src/lib/displays/broad-arrow/normalizeBroadArrowDisplayData.ts");
  assert.match(source, /mapSnapshotToPylonFeed/);
  assert.match(source, /mapSnapshotToLowerTickerFeed/);
  assert.match(source, /normalizeBroadArrowDisplayData/);

  const pylonSource = read("src/lib/displays/pylon-data.ts");
  const tickerSource = read("src/lib/displays/lower-ticker-data.ts");
  assert.match(pylonSource, /auctionDisplay/);
  assert.match(tickerSource, /snapshot\.next/);
});

test("legacy pylon uses HTML card path instead of TypeScript renderer", () => {
  assert.throws(() => read("src/components/displays/broad-arrow/BroadArrowPylon.tsx"));
  const htmlCardSource = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(htmlCardSource, /display-html/);
  assert.match(htmlCardSource, /DisplayPreviewPanel/);
});

test("renderer slug defaults no longer include auction pylon display", () => {
  const defaults = read("src/lib/displays/broad-arrow/renderer-keys.ts");
  assert.doesNotMatch(defaults, /"auction-pylon-display"/);
  assert.doesNotMatch(defaults, /"auction-ticker-overlay"/);
});

test("retired auction ticker overlay is removed on import", () => {
  const source = read("desktop/src/services/broad-arrow-uploaded-displays-import-service.ts");
  assert.match(source, /removeRetiredAuctionTickerOverlay/);
  const specs = read("desktop/src/displays/broad-arrow-uploaded-display-specs.ts");
  assert.doesNotMatch(
    specs,
    /BROAD_ARROW_UPLOADED_DISPLAY_SPECS[\s\S]*AUCTION_TICKER_OVERLAY_SPEC/,
  );
});

test("legacy import service retires TypeScript auction pylon display", () => {
  const source = read("desktop/src/services/broad-arrow-legacy-displays-import-service.ts");
  const specs = read("desktop/src/displays/broad-arrow-legacy-display-specs.ts");
  assert.match(source, /removeRetiredAuctionPylonDisplay/);
  assert.match(source, /LEGACY_PYLON_SPEC/);
  assert.match(specs, /broad-arrow-legacy-pylon-html/);
});

test("typed displays use direct React preview instead of HTML iframe bridge", () => {
  const cardSource = read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx");
  assert.match(cardSource, /BroadArrowTypedDisplayPreview/);
  assert.doesNotMatch(cardSource, /DisplayPreviewPanel/);
  assert.doesNotMatch(cardSource, /postMessage/);
});

test("live display route uses HTML output and viewer paths", () => {
  const liveSource = read("src/components/displays/DisplayLivePageClient.tsx");
  assert.match(liveSource, /HtmlDisplayOutputView/);
  assert.match(liveSource, /HtmlDisplayLiveView/);
});

test("refresh rate and display size selects expose pointer cursor styling", () => {
  const refreshSource = read("src/components/displays/DisplayRefreshRateSelect.tsx");
  const sizeSource = read("src/components/displays/DisplaySizeSelect.tsx");
  assert.match(refreshSource, /cursor-pointer/);
  assert.match(sizeSource, /cursor-pointer/);
});

test("legacy pylon bundled v1 source remains present", () => {
  const legacyPylon = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  assert.match(legacyPylon, /Auction Pylon Display/);
  assert.match(legacyPylon, /Pylon HTML v1\.24/);
});
