#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 12 contracts.
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

test("STREAM BID: Pass 15 SVG title path; no mask-image linear-gradient", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /lot-title-svg|title-region/);
  assert.doesNotMatch(html, /mask-image:\s*linear-gradient/);
});

test("STACK: absolute overlay layers + stretch fill + target raster for computer/decklink", () => {
  const client = read("src/components/displays/DisplayStackFitClient.tsx");
  assert.match(client, /position:\s*"absolute"/);
  assert.match(client, /data-output-stack-overlay="absolute"/);
  assert.match(client, /data-output-stack-geometry="authored-stage-scale"/);
  assert.match(client, /fillMode=\{programOutput \? "stretch" : "contain"\}/);
  assert.match(client, /computerOutput \|\| decklinkOutput/);
  assert.doesNotMatch(client, /grid-cols-/);
  assert.doesNotMatch(client, /flex-row/);
});

test("STACK/OUTPUT: stretch scale helper + ScaledCanvas fillMode", () => {
  const scale = read("src/lib/displays/display-viewer-scale.ts");
  const canvas = read("src/components/displays/DisplayViewerScaledCanvas.tsx");
  const measurements = read("src/lib/displays/display-viewer-measurements.ts");
  assert.match(scale, /computeDisplayViewerStretchScale/);
  assert.match(measurements, /fillMode/);
  assert.match(canvas, /fillMode/);
  assert.match(canvas, /scale\(\$\{scaleX\}, \$\{scaleY\}\)/);
});

test("CLEAN FEED: OutputCleanMode hides Next issue bubbles on output routes", () => {
  const clean = read("src/components/displays/OutputCleanMode.tsx");
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(clean, /nextjs-portal/);
  assert.match(clean, /data-next-badge-root/);
  assert.match(clean, /data-neud-output-clean/);
  assert.match(shell, /OutputCleanMode/);
  assert.match(templates, /neud-output-clean-mode/);
});

test("DISPLAY MENU: Graphic Editor, Duplicate, Archive, Settings, Delete (Pass 13)", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /label:\s*"Graphic Editor"/);
  assert.match(menu, /label:\s*"Duplicate"/);
  assert.match(menu, /label:\s*"Archive"/);
  assert.match(menu, /label:\s*"Settings"/);
  assert.match(menu, /label:\s*"Delete"/);
  assert.match(menu, /openGraphicEditor/);
  assert.match(menu, /openDisplaySettings/);
  assert.match(menu, /schedule-ticker-editable/);
  assert.match(menu, /desktop\.editor\.open/);
  const edit = menu.indexOf('label: "Graphic Editor"');
  const dup = menu.indexOf('label: "Duplicate"');
  const arch = menu.indexOf('label: "Archive"');
  const settings = menu.indexOf('label: "Settings"');
  const del = menu.indexOf('label: "Delete"');
  assert.ok(edit < dup && dup < arch && arch < settings && settings < del);
});

test("DISPLAY SETTINGS: page titled Display Settings; Graphic Editor only from menu", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  assert.match(client, /Display Settings/);
  assert.doesNotMatch(client, /Open Graphic Editor/);
});

test("DECKLINK STACK: Pass 11 coalescing retained", () => {
  const renderer = read("desktop/src/output/offscreen-output-renderer.ts");
  assert.match(renderer, /setImmediate/);
  assert.match(renderer, /flushConvert/);
  assert.match(renderer, /bgraPools/);
});

test("GRAPHIC EDITOR PHASE 2: schema v2 + editor foundation present", () => {
  const schema = read("desktop/src/packages/sema/editable-graphic-schema.ts");
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(schema, /schemaVersion:\s*2|EDITABLE_GRAPHIC_SCHEMA_VERSION\s*=\s*2|migrateV1ToV2/);
  assert.match(editor, /rotation|overflow|undo|Add Text|schedule\.now/i);
});
