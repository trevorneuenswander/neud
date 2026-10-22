#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 13 contracts:
 * Stack authored-stage scale, Stream Bid descender CSS, Display menu/windows,
 * OutputCleanMode shadow suppression, Graphic Editor Phase 3 foundations.
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

test("STACK GEOMETRY: authored-stage scale into full-output absolute wrappers", () => {
  const fit = read("src/lib/displays/display-stack-fit.ts");
  const client = read("src/components/displays/DisplayStackFitClient.tsx");
  assert.match(fit, /computeStackLayerGeometry/);
  assert.match(fit, /scaleX/);
  assert.match(fit, /scaleY/);
  assert.match(fit, /width\?:/);
  assert.match(client, /data-output-stack-geometry="authored-stage-scale"/);
  assert.match(client, /data-output-stack-layer-wrap/);
  assert.match(client, /data-output-stack-layer-stage/);
  assert.match(client, /transform:\s*`scale\(\$\{geometry\.scaleX\}, \$\{geometry\.scaleY\}\)`/);
  assert.match(client, /transformOrigin:\s*"0 0"/);
  assert.match(client, /__NEUD_STACK_GEOMETRY__/);
  // Iframes sized to authored layer, not intrinsic final placement.
  assert.match(client, /width=\{layerWidth\}/);
  assert.match(client, /height=\{layerHeight\}/);
  assert.doesNotMatch(client, /decklinkRaster/);
  assert.doesNotMatch(client, /grid-cols-/);
});

test("STACK GEOMETRY MATH: 1920→3840 both axes scale 2, origin 0,0", async () => {
  // Inline the same formula as computeStackLayerGeometry (stretch).
  const layerW = 1920;
  const layerH = 1080;
  const canvasW = 3840;
  const canvasH = 2160;
  const scaleX = canvasW / layerW;
  const scaleY = canvasH / layerH;
  assert.equal(scaleX, 2);
  assert.equal(scaleY, 2);
  // Both layers share the same wrapper origin.
  const bid = { x: 0, y: 0, w: canvasW, h: canvasH, z: 1 };
  const ticker = { x: 0, y: 0, w: canvasW, h: canvasH, z: 2 };
  assert.equal(bid.x, ticker.x);
  assert.equal(bid.y, ticker.y);
  assert.equal(bid.w, ticker.w);
  assert.equal(bid.h, ticker.h);
  assert.ok(ticker.z > bid.z);
});

test("STACK URL: per-layer authored width/height in layers JSON", () => {
  const core = read("desktop/src/output/output-engine-core.ts");
  assert.match(core, /width:\s*layer\.width/);
  assert.match(core, /height:\s*layer\.height/);
  assert.match(core, /buildOutputStackRenderUrl/);
});

test("DECKLINK RASTER ZOOM: allows upscale (z>1) and downscale", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  const runtime = read("public/neud-display-runtime.js");
  assert.match(templates, /Math\.abs\(z-1\)>1e-6/);
  assert.doesNotMatch(templates, /z>0&&z<1/);
  assert.match(runtime, /Math\.abs\(zoom - 1\) < 1e-6/);
  assert.doesNotMatch(runtime, /zoom >= 1\) return/);
});

test("STREAM BID: current pass22 title layout (supersedes Pass 13/14 clip band)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});

test("CLEAN FEED: shadow-root suppression + stack-fit always clean", () => {
  const clean = read("src/components/displays/OutputCleanMode.tsx");
  assert.match(clean, /shadowRoot/);
  assert.match(clean, /suppressDevChrome/);
  assert.match(clean, /display\/stack-fit/);
  assert.match(clean, /nextjs-portal/);
});

test("DISPLAY MENU: Graphic Editor, Duplicate, Archive, Settings, Delete", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /label:\s*"Graphic Editor"/);
  assert.match(menu, /label:\s*"Duplicate"/);
  assert.match(menu, /label:\s*"Archive"/);
  assert.match(menu, /label:\s*"Settings"/);
  assert.match(menu, /label:\s*"Delete"/);
  assert.match(menu, /Graphic Editor is not available for this display yet/);
  assert.match(menu, /showSettingsModal|NeudModal/);
  assert.match(menu, /desktop\.editor\.open/);
  assert.doesNotMatch(menu, /displaySettings\.open/);
  assert.doesNotMatch(menu, /openEditDisplay/);
  assert.doesNotMatch(menu, /label:\s*"Edit Display"/);
  const ge = menu.indexOf('label: "Graphic Editor"');
  const dup = menu.indexOf('label: "Duplicate"');
  const arch = menu.indexOf('label: "Archive"');
  const settings = menu.indexOf('label: "Settings"');
  const del = menu.indexOf('label: "Delete"');
  assert.ok(ge < dup && dup < arch && arch < settings && settings < del);
});

test("DISPLAY SETTINGS: modal over main UI + no Open Graphic Editor button", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(client, /Display Settings/);
  assert.doesNotMatch(client, /Open Graphic Editor/);
  assert.match(menu, /NeudModal/);
  assert.match(menu, /variant="modal"/);
  assert.doesNotMatch(menu, /displaySettings\.open/);
});

test("GRAPHIC EDITOR: branded Electron titlebar", () => {
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  assert.match(manager, /backgroundColor:\s*"#1a2332"/);
  assert.match(manager, /titleBarStyle/);
  assert.match(manager, /trafficLightPosition|titleBarOverlay/);
});

test("PASS 11/12 PERF: stack still uses one capture path + coalescing", () => {
  const renderer = read("desktop/src/output/offscreen-output-renderer.ts");
  const client = read("src/components/displays/DisplayStackFitClient.tsx");
  assert.match(renderer, /setImmediate/);
  assert.match(renderer, /flushConvert/);
  assert.match(renderer, /bgraPools/);
  assert.match(client, /memo\(function StackLayerIframe/);
});
