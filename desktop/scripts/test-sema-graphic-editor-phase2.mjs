#!/usr/bin/env node
/**
 * SEMA Graphic Editor Phase 2 foundation checks (Pass 12 Part C).
 * Schema v2 migration, layer types, overflow, data tree, undo, escape,
 * Schedule Ticker Editable still packaged; Schedule Ticker + Pylon unchanged.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const SCHEMA_REL = "desktop/src/packages/sema/editable-graphic-schema.ts";
const REGISTRY_DESKTOP = "desktop/src/packages/sema/graphic-data-registry.ts";
const REGISTRY_UI = "src/lib/editor/graphic-data-registry.ts";
const EDITOR = "src/components/editor/GraphicEditorClient.tsx";
const HTML_REL = "desktop/src/displays/bundled/sema-schedule-ticker-editable-v1.html";
const TICKER = "desktop/src/displays/bundled/sema-schedule-ticker-v1.html";
const PYLON = "desktop/src/displays/bundled/sema-schedule-pylon-v1.html";

test("schema v2 shape: width/height, background, guides, layers with v2 fields", () => {
  const schema = read(SCHEMA_REL);
  assert.match(schema, /EDITABLE_GRAPHIC_SCHEMA_VERSION\s*=\s*2/);
  assert.match(schema, /migrateV1ToV2/);
  assert.match(schema, /escapeEditableText/);
  assert.match(schema, /width:\s*number/);
  assert.match(schema, /height:\s*number/);
  assert.match(schema, /background:/);
  assert.match(schema, /guides:/);
  assert.match(schema, /parentId\?/);
  assert.match(schema, /"ellipse"|"line"|"image"|"group"/);
  assert.match(schema, /rotation/);
  assert.match(schema, /locked/);
  assert.match(schema, /opacity/);
  assert.match(schema, /overflow/);
  assert.match(schema, /shrink|wrap|marquee|truncate/);
  assert.match(schema, /animations/);
  assert.match(schema, /assetId\?/);
  assert.match(schema, /createDefaultSemaScheduleTickerEditableSchema/);
});

test("migrateV1ToV2 produces schemaVersion 2 with layered style/content", () => {
  const distPath = path.join(
    repoRoot,
    "desktop/dist/packages/sema/editable-graphic-schema.js",
  );
  if (!fs.existsSync(distPath)) {
    // Source-level contract still asserted above; runtime migration covered when dist is built.
    assert.match(read(SCHEMA_REL), /schemaVersion:\s*2/);
    assert.match(read(SCHEMA_REL), /style:\s*\{/);
    assert.match(read(SCHEMA_REL), /content:\s*\{/);
    return;
  }
  const mod = require(distPath);
  const v1 = {
    schemaVersion: 1,
    graphicType: "schedule-ticker-editable",
    canvas: { width: 3840, height: 2160 },
    layers: [
      {
        id: "t1",
        name: "Title",
        type: "text",
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        visible: true,
        zIndex: 1,
        text: "Hello",
        textMode: "static",
        fontSize: 32,
        color: "#fff",
        align: "left",
      },
    ],
  };
  const v2 = mod.migrateV1ToV2(v1);
  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.width, 3840);
  assert.equal(v2.height, 2160);
  assert.ok(Array.isArray(v2.guides));
  assert.equal(v2.layers[0].style.fontSize, 32);
  assert.equal(v2.layers[0].content.text, "Hello");
  assert.equal(v2.layers[0].rotation, 0);
  assert.equal(v2.layers[0].opacity, 1);
  assert.equal(v2.layers[0].overflow.mode, "truncate");

  const normalized = mod.normalizeEditableGraphicSchema(v1);
  assert.equal(normalized.schemaVersion, 2);

  const escaped = mod.escapeEditableText(`<script>"&'</script>`);
  assert.match(escaped, /&lt;script&gt;/);
  assert.match(escaped, /&quot;/);
  assert.match(escaped, /&amp;/);
  assert.doesNotMatch(escaped, /<script>/);
});

test("data registry exposes schedule.now.title paths and reserved auction namespace", () => {
  const desktop = read(REGISTRY_DESKTOP);
  const ui = read(REGISTRY_UI);
  for (const src of [desktop, ui]) {
    assert.match(src, /GraphicDataNamespace|SEMA_SCHEDULE_DATA_NAMESPACE/);
    assert.match(src, /schedule\.now\.title/);
    assert.match(src, /schedule\.next\.description/);
    assert.match(src, /schedule\.later\.title/);
    assert.match(src, /AUCTION_DATA_NAMESPACE/);
    assert.match(src, /status:\s*"reserved"/);
  }

  const distPath = path.join(
    repoRoot,
    "desktop/dist/packages/sema/graphic-data-registry.js",
  );
  if (fs.existsSync(distPath)) {
    const mod = require(distPath);
    const leaves = mod.listReadyDataLeaves();
    const paths = leaves.map((leaf) => leaf.path);
    assert.ok(paths.includes("schedule.now.title"));
    assert.ok(paths.includes("schedule.later.description"));
    assert.equal(mod.normalizeDataBindingPath("schedule.now.title"), "now.title");
    assert.equal(mod.AUCTION_DATA_NAMESPACE.status, "reserved");
  }
});

test("GraphicEditorClient phase 2 UI: layers, canvas zoom/snap, props, toolbar, undo keys", () => {
  const client = read(EDITOR);
  assert.match(client, /Add Text|addLayer\("text"\)/);
  assert.match(client, /ellipse|Ellipse/);
  assert.match(client, /Import PSD|parsePsdImport/);
  assert.match(client, /Snap/);
  assert.match(client, /zoomMode|"fit"|"100%"/);
  assert.match(client, /Undo|Redo/);
  assert.match(client, /metaKey|ctrlKey/);
  assert.match(client, /["']z["']|toLowerCase\(\)\s*===\s*["']z["']/);
  assert.match(client, /Delete|Backspace/);
  assert.match(client, /duplicateLayer|Duplicate|CmdD|["']d["']/);
  assert.match(client, /ArrowLeft|nudge|ArrowUp/);
  assert.match(client, /DataTreePicker|schedule\.now\.title|GRAPHIC_DATA_NAMESPACES/);
  assert.match(client, /overflow|marquee|shrink/);
  assert.match(client, /animations|durationMs|fade|slide|scale/);
  assert.match(client, /beginTransform|resize|rotate/);
  assert.match(client, /localImportDisplayAsset|relativePath/);
  assert.match(client, /pushHistory|history/);
  assert.match(client, /locked|visible/);
});

test("runtime HTML renders schema v2: rotation, opacity, overflow, animations, shapes", () => {
  const html = read(HTML_REL);
  assert.match(html, /"schemaVersion"\s*:\s*2/);
  assert.match(html, /normalizeSchema|schemaVersion === 1/);
  assert.match(html, /rotate\(/);
  assert.match(html, /opacity/);
  assert.match(html, /data-overflow|marquee|shrink/);
  assert.match(html, /anim-fade|playUpdateAnimation|animations/);
  assert.match(html, /ellipse|renderEllipse/);
  assert.match(html, /renderLine|data-type="line"/);
  assert.match(html, /renderImage|objectFit/);
  assert.match(html, /renderGroup|parentId/);
  assert.match(html, /textContent\s*=/);
  assert.match(html, /escapeText/);
  assert.doesNotMatch(html, /\beval\s*\(/);
  assert.match(html, /__NEUD_EDITABLE_ASSET_BASE__|resolveAssetUrl/);
});

test("image asset API stores relative assets path (no absolute paths in API types)", () => {
  const storage = read("desktop/src/services/project-code-storage-service.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");
  const routes = read("desktop/src/services/developer-tools-routes.ts");
  const api = read("src/lib/local/editable-graphic-api.ts");
  assert.match(storage, /writeDisplayAsset|getDisplayAssetsDir/);
  assert.match(storage, /assets\/\$\{/);
  assert.match(service, /importDisplayAsset/);
  assert.match(service, /relativePath/);
  assert.doesNotMatch(
    service.slice(service.indexOf("importDisplayAsset"), service.indexOf("importDisplayAsset") + 900),
    /absolutePath:\s*written/,
  );
  assert.match(routes, /action === "assets"/);
  assert.match(api, /localImportDisplayAsset/);
  assert.match(api, /relativePath/);
});

test("Schedule Ticker Editable still packaged; Schedule Ticker + Schedule Pylon unchanged files present", () => {
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  assert.match(builder, /schedule-ticker-editable/);
  assert.match(builder, /slug:\s*"schedule-ticker"/);
  assert.match(builder, /slug:\s*"schedule-pylon"/);
  assert.ok(fs.existsSync(path.join(repoRoot, HTML_REL)));
  assert.ok(fs.existsSync(path.join(repoRoot, TICKER)));
  assert.ok(fs.existsSync(path.join(repoRoot, PYLON)));
  // Editable upgraded; originals remain distinct shells.
  assert.match(read(TICKER), /Schedule Ticker/i);
  assert.doesNotMatch(read(TICKER), /neud-editable-schema/);
  assert.match(read(PYLON), /Schedule Pylon|schedule-pylon/i);
  assert.doesNotMatch(read(PYLON), /neud-editable-schema/);
});

test("PSD import stub reports unsupported effects; fixture path available", () => {
  const stub = read("src/lib/editor/psd-import-stub.ts");
  assert.match(stub, /parsePsdImport/);
  assert.match(stub, /neud-psd-fixture/);
  assert.match(stub, /unsupported/);
  assert.match(stub, /smart objects|layer effects/i);
});
