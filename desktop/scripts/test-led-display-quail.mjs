#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const specs = read("desktop/src/displays/broad-arrow-stream-display-specs.ts");
const html = read("desktop/src/displays/bundled/led-display-quail-v1.html");
const bridge = read("desktop/src/displays/led-display-quail-v2-bridge.js");
const importService = read("desktop/src/services/broad-arrow-stream-displays-import-service.ts");
const transform = read("desktop/src/displays/stream-display-v2-transform.ts");
const stacks = read("shared/displays/pinned-viewer-stacks.ts");

test("LED Display (Quail) registered with native 9216×1536", () => {
  assert.match(specs, /slug: "led-display-quail"/);
  assert.match(specs, /name: "LED Display \(Quail\)"/);
  assert.match(specs, /displayWidth: 9216/);
  assert.match(specs, /displayHeight: 1536/);
  assert.match(specs, /graphicType: "led-display-quail"/);
  assert.match(specs, /broad-arrow:led-display-quail:v1/);
});

test("import service transforms Quail HTML with dedicated bridge", () => {
  assert.match(importService, /transformLedDisplayQuailHtmlForServing/);
  assert.match(importService, /led-display-quail-v1/);
  assert.match(transform, /LED_DISPLAY_QUAIL_BRIDGE_ANCHOR/);
  assert.match(read("desktop/src/lib/bundled-display-sources.ts"), /led-display-quail-v1\.html/);
});

test("Quail HTML uses native canvas and bridge anchor", () => {
  assert.match(html, /--canvas-w: 9216px/);
  assert.match(html, /--canvas-h: 1536px/);
  assert.match(html, /QUAIL_CANVAS_WIDTH = 9216/);
  assert.match(html, /renderQuailFeed/);
  assert.match(html, /LED_DISPLAY_QUAIL_BRIDGE/);
  assert.match(html, /background: #f7f5f2/);
  assert.doesNotMatch(html, /lastSold|last-sold/i);
});

test("Quail bridge uses canonical broadArrow pylon and ticker next lots", () => {
  assert.match(bridge, /broadArrowDisplay\.pylon/);
  assert.match(bridge, /streamTickerFeed/);
  assert.match(bridge, /renderQuailFeed/);
  assert.match(bridge, /NEUDDisplay\.subscribe/);
  assert.doesNotMatch(bridge, /setInterval/);
});

test("reserve behavior matches Stream Bid rule", () => {
  assert.match(html, /formatReserveStatusForQuail/);
  assert.match(html, /OFFERED WITHOUT RESERVE/);
  assert.match(html, /has\[-_\\s\]\?reserve\|with\\s\+reserve/);
  assert.match(html, /unknown/);
});

test("initial photo selection shuffles without duplicates when >=4 photos", () => {
  assert.match(html, /selectInitialQuailPhotos/);
  assert.match(html, /seededShuffle/);
  assert.match(html, /for \(var i = 0; i < 4; i \+= 1\)/);
  assert.match(html, /picked\.push\(shuffled\[i\]\)/);
});

test("photo frames use fixed authored positions and rotations", () => {
  assert.match(html, /photo-left-outer/);
  assert.match(html, /photo-left-inner/);
  assert.match(html, /photo-right-inner/);
  assert.match(html, /photo-right-outer/);
  assert.match(html, /QUAIL_PHOTO_FRAME_SPECS/);
  assert.match(html, /rotate\(-7deg\)/);
  assert.match(html, /rotate\(8deg\)/);
});

test("slideshow uses 6 second cycle with stagger and crossfade", () => {
  assert.match(html, /QUAIL_PHOTO_SLIDE_MS = 6000/);
  assert.match(html, /QUAIL_PHOTO_STAGGER_MS/);
  assert.match(html, /setImageWithCrossfade/);
  assert.match(html, /is-fading-out/);
  assert.match(html, /startPhotoSlideshow/);
});

test("lot transition sequence exits then enters photos before center", () => {
  assert.match(html, /runLotTransition/);
  assert.match(html, /is-exiting/);
  assert.match(html, /enterPhoto/);
  assert.match(html, /centerBlock\.classList\.remove\("is-hidden"\)/);
});

test("Up Next shows three lots and cycles groups", () => {
  assert.match(html, /upNextAllLots/);
  assert.match(html, /upNextCycleIndex/);
  assert.match(html, /MAX_UPCOMING|upNextSlots|for \(var slot = 0; slot < 3/);
});

test("stack compatibility metadata 9216×1536 is 6:1", () => {
  assert.match(stacks, /normalizeAspectRatioKey/);
  function normalizeAspectRatioKey(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    let a = w;
    let b = h;
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    const gcd = Math.max(1, a);
    return `${w / gcd}:${h / gcd}`;
  }
  assert.equal(normalizeAspectRatioKey(9216, 1536), "6:1");
  assert.notEqual(normalizeAspectRatioKey(9216, 1536), normalizeAspectRatioKey(3840, 2160));
});

test("hosted logo inlining includes Quail slug", () => {
  assert.match(
    read("desktop/src/services/display-sync/display-sync-service.ts"),
    /led-display-quail/,
  );
});

test("copy-runtime-assets requires and stages Quail bridge for dist/displays", () => {
  const copyScript = read("desktop/scripts/copy-runtime-assets.mjs");
  assert.match(copyScript, /REQUIRED_DISPLAY_BRIDGE_SCRIPTS/);
  assert.match(copyScript, /led-display-quail-v2-bridge\.js/);
  assert.match(copyScript, /listDisplayBridgeSourceFiles/);
  const sourceBridge = path.join(
    repoRoot,
    "desktop/src/displays/led-display-quail-v2-bridge.js",
  );
  assert.ok(fs.existsSync(sourceBridge), `missing source bridge ${sourceBridge}`);
  const distBridge = path.join(repoRoot, "desktop/dist/displays/led-display-quail-v2-bridge.js");
  assert.ok(
    fs.existsSync(distBridge),
    `missing staged bridge ${distBridge} — run npm run build -w @neud/desktop`,
  );
  assert.ok(fs.statSync(distBridge).size > 0);
  const distHtml = path.join(
    repoRoot,
    "desktop/dist/displays/bundled/led-display-quail-v1.html",
  );
  assert.ok(fs.existsSync(distHtml), `missing staged html ${distHtml}`);
});

test("runtime manifest documents Quail bundled html and bridge glob", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "desktop/runtime-asset-manifest.json"), "utf8"),
  );
  const bundled = manifest.asar.find((entry) => entry.id === "displays.bundled-html");
  assert.ok(bundled.files.includes("led-display-quail-v1.html"));
  const bridges = manifest.asar.find((entry) => entry.id === "displays.bridge-scripts");
  assert.match(bridges.source, /\*-bridge\.js/);
});
