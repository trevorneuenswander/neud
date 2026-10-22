#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 11 contracts:
 * DeckLink stack performance, clean feed, Stream Bid descenders, graphic editor prototype.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("DECKLINK STACK: single offscreen window + coalesced latest-frame convert", () => {
  const renderer = read("desktop/src/output/offscreen-output-renderer.ts");
  assert.match(renderer, /private readonly windows = new Map/);
  assert.match(renderer, /setImmediate/);
  assert.match(renderer, /pending\.set/);
  assert.match(renderer, /flushConvert/);
  assert.match(renderer, /bgraPools/);
  assert.match(renderer, /quality:\s*"good"/);
  assert.match(renderer, /attachOutputCleanFeedGuards/);
  assert.doesNotMatch(renderer, /quality:\s*"best"/);
});

test("DECKLINK STACK: stack-fit consumes outputWidth/Height at mode raster", () => {
  const page = read("src/app/display/stack-fit/page.tsx");
  const client = read("src/components/displays/DisplayStackFitClient.tsx");
  assert.match(page, /outputWidth/);
  assert.match(page, /outputHeight/);
  // Pass 13: outer authored-stage scale replaces per-iframe decklinkRaster zoom.
  assert.match(client, /authored-stage-scale|computeStackLayerGeometry|data-output-stack-layer-stage/);
  assert.match(client, /data-output-stack-target-raster/);
  assert.match(client, /useTargetRaster/);
  assert.match(client, /outputWidth/);
});

test("DECKLINK STACK: layer HTML early zoom + runtime zoom for decklinkRaster", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  const runtime = read("public/neud-display-runtime.js");
  assert.match(templates, /decklinkRaster/);
  assert.match(templates, /data-neud-decklink-raster-zoom/);
  assert.match(runtime, /applyDeckLinkStackRasterZoom|decklinkRaster/);
});

test("DECKLINK STACK: engine still one stack-fit URL with output dims", () => {
  const engine = read("desktop/src/output/output-engine-core.ts");
  assert.match(engine, /buildOutputStackRenderUrl/);
  assert.match(engine, /outputWidth:\s*mode\.width/);
  assert.match(engine, /outputHeight:\s*mode\.height/);
});

test("DECKLINK STACK: skip duplicate revision pushFrame", () => {
  const port = read("desktop/src/output/native-decklink-port.ts");
  assert.match(port, /lastPushedRevision/);
  assert.match(port, /next\.revision === lastPushedRevision/);
});

test("DECKLINK: BGRA normalize reuses out buffer", () => {
  const model = read("desktop/src/output/decklink-model.ts");
  assert.match(model, /out\?: Buffer/);
  assert.match(model, /allocUnsafe/);
});

test("CLEAN FEED: output + offscreen suppress dialogs and load errors", () => {
  const clean = read("desktop/src/output/output-clean-feed.ts");
  const host = read("desktop/src/output/output-window-host.ts");
  const renderer = read("desktop/src/output/offscreen-output-renderer.ts");
  assert.match(clean, /attachOutputCleanFeedGuards/);
  assert.match(clean, /"dialog"/);
  assert.match(clean, /preventDefault/);
  assert.match(clean, /did-fail-load/);
  assert.match(clean, /render-process-gone/);
  assert.match(clean, /background:#000/);
  assert.match(host, /attachOutputCleanFeedGuards/);
  assert.match(renderer, /attachOutputCleanFeedGuards/);
  // Must not suppress dialogs on the operator main window globally.
  const main = read("desktop/src/main.ts");
  assert.doesNotMatch(main, /attachOutputCleanFeedGuards/);
});

test("STREAM BID: current pass22 title layout (supersedes Pass 15 layout markers)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});

test("GRAPHIC EDITOR: Schedule Ticker Editable package + editor window", () => {
  const editable = read("desktop/src/displays/bundled/sema-schedule-ticker-editable-v1.html");
  const schema = read("desktop/src/packages/sema/editable-graphic-schema.ts");
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  const windowMgr = read("desktop/src/services/graphic-editor-window-manager.ts");
  const editMenu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(editable, /schedule-ticker-editable|Schedule Ticker Editable/i);
  assert.match(schema, /EDITABLE_GRAPHIC_SCHEMA_VERSION\s*=\s*2/);
  assert.match(schema, /now\.title/);
  assert.match(editor, /DATA_BINDINGS|now\.title|Graphic Editor|DataTreePicker/i);
  assert.match(windowMgr, /BrowserWindow/);
  assert.match(editMenu, /Graphic Editor/);
});

test("GRAPHIC EDITOR: gated by editorSchemaVersion / graphicType", () => {
  const editMenu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(editMenu, /editorSchemaVersion/);
  assert.match(editMenu, /schedule-ticker-editable/);
});
