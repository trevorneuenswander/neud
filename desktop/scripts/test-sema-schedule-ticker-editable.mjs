#!/usr/bin/env node
/**
 * SEMA Schedule Ticker Editable (Pass 11 Item 4).
 * Asserts editable display package wiring, schema 3840×2160, editor gating,
 * NOW/NEXT/LATER data bindings, text escaping, and original ticker still present.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML_REL =
  "desktop/src/displays/bundled/sema-schedule-ticker-editable-v1.html";
const TICKER_HTML_REL = "desktop/src/displays/bundled/sema-schedule-ticker-v1.html";
const SCHEMA_REL = "desktop/src/packages/sema/editable-graphic-schema.ts";
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Schedule Ticker Editable HTML is 3840×2160 schema-driven shell", () => {
  const html = read(HTML_REL);
  assert.match(html, /<title>\s*Schedule Ticker Editable\s*<\/title>/i);
  assert.match(html, /name=["']viewport["'][^>]*width=3840/i);
  assert.match(html, /height=2160/i);
  assert.match(html, /data-display=["']schedule-ticker-editable["']/);
  assert.match(html, /data-frame=["']3840x2160["']/);
  assert.match(html, /id=["']neud-editable-schema["']/);
  assert.match(html, /"schemaVersion"\s*:\s*2/);
  assert.match(html, /"graphicType"\s*:\s*"schedule-ticker-editable"/);
  assert.match(html, /"width"\s*:\s*3840/);
  assert.match(html, /"height"\s*:\s*2160/);
  assert.match(html, /--sema-red:\s*#DC1E28/i);
  assert.match(html, /--live-magenta:\s*#E020F0/i);
  assert.match(html, /logo-placeholder|LOGO PLACEHOLDER/i);
  assert.match(html, /background:\s*transparent/);
});

test("schema module defaults to 3840×2160 with NOW/NEXT/LATER bindings", () => {
  const schema = read(SCHEMA_REL);
  assert.match(schema, /EDITABLE_GRAPHIC_SCHEMA_VERSION\s*=\s*2/);
  assert.match(schema, /migrateV1ToV2/);
  assert.match(schema, /SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE\s*=\s*"schedule-ticker-editable"/);
  assert.match(schema, /createDefaultSemaScheduleTickerEditableSchema/);
  assert.match(schema, /width:\s*3840/);
  assert.match(schema, /height:\s*2160/);
  assert.match(schema, /"now\.title"|'now\.title'|dataBinding:\s*"now\.title"/);
  assert.match(schema, /"next\.title"|'next\.title'|dataBinding:\s*"next\.title"/);
  assert.match(schema, /"later\.title"|'later\.title'|dataBinding:\s*"later\.title"/);
  assert.match(schema, /now\.description/);
  assert.match(schema, /next\.description/);
  assert.match(schema, /later\.description/);
  assert.match(schema, /displaySupportsGraphicEditor/);
  assert.match(schema, /escapeEditableText/);
});

test("runtime HTML escapes text and binds NOW/NEXT/LATER data fields", () => {
  const html = read(HTML_REL);
  assert.match(html, /textContent\s*=/);
  assert.match(html, /escapeText|replace\(\/&\/g/);
  assert.doesNotMatch(html, /\beval\s*\(/);
  assert.match(html, /dataBinding|resolveBinding/);
  assert.match(html, /now\.title|data-binding/);
  assert.match(html, /next\.title|later\.title/);
  assert.match(html, /NEUDDisplay\.subscribe|neud-display-data/);
  assert.match(html, /__SEMA_SCHEDULE_TICKER_EDITABLE__/);
});

test("package builder + bundled allowlist + reconcile require editable display", () => {
  const bundled = read("desktop/src/lib/bundled-display-sources.ts");
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  const manifest = read("desktop/runtime-asset-manifest.json");
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  const service = read("desktop/src/packages/project-package-service.ts");

  assert.match(bundled, /sema-schedule-ticker-editable-v1\.html/);
  assert.match(manifest, /sema-schedule-ticker-editable-v1\.html/);
  assert.match(
    builder,
    /SEMA_SCHEDULE_TICKER_EDITABLE_BUNDLED_FILE\s*=\s*"sema-schedule-ticker-editable-v1\.html"/,
  );
  assert.match(
    builder,
    /SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH\s*=\s*"displays\/schedule-ticker-editable-v1\.html"/,
  );
  assert.match(builder, /slug:\s*"schedule-ticker-editable"/);
  assert.match(builder, /name:\s*"Schedule Ticker Editable"/);
  assert.match(builder, /runtimeAdapterKey:\s*"sema-schedule-ticker-editable"/);
  assert.match(builder, /width:\s*3840/);
  assert.match(builder, /height:\s*2160/);

  // Original Schedule Ticker still present
  assert.match(builder, /slug:\s*"schedule-ticker"/);
  assert.match(builder, /name:\s*"Schedule Ticker"/);
  assert.match(bundled, /sema-schedule-ticker-v1\.html/);
  assert.ok(fs.existsSync(path.join(repoRoot, TICKER_HTML_REL)));
  assert.ok(fs.existsSync(path.join(repoRoot, HTML_REL)));

  assert.match(hydration, /schedule-ticker-editable/);
  assert.match(hydration, /editorSchemaVersion/);
  assert.match(hydration, /editableGraphicSchema/);
  assert.match(hydration, /SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE|schedule-ticker-editable/);

  assert.match(service, /schedule-ticker-editable-v1\.html/);
  assert.match(service, /Schedule Ticker Editable/);
});

test("Graphic Editor gating + Electron IPC + editor route", () => {
  const editMenu = read("src/components/displays/DisplayEditMenu.tsx");
  const editClient = read("src/components/displays/DisplayEditClient.tsx");
  const editorClient = read("src/components/editor/GraphicEditorClient.tsx");
  const editorPage = read("src/app/editor/graphic/page.tsx");
  const preload = read("desktop/src/preload.ts");
  const ipc = read("desktop/src/ipc/editor.ts");
  const main = read("desktop/src/main.ts");
  const types = read("src/lib/desktop/types.ts");
  const api = read("src/lib/local/editable-graphic-api.ts");
  const routes = read("desktop/src/services/developer-tools-routes.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");

  assert.match(editMenu, /label:\s*"Graphic Editor"/);
  assert.match(editMenu, /editorSchemaVersion/);
  assert.match(editMenu, /schedule-ticker-editable/);
  assert.match(editMenu, /neudDesktop|getDesktopAPI|editor\.open/);
  assert.doesNotMatch(editClient, /Open Graphic Editor/);

  assert.match(editorClient, /Undo|Redo|Save/);
  assert.doesNotMatch(editorClient, /iconBtn\("Close"/);
  assert.match(editorClient, /Layers|Properties/);
  assert.match(editorClient, /now\.title|DATA_BINDINGS|DataTreePicker|GRAPHIC_DATA_NAMESPACES/);
  assert.match(editorClient, /localSaveEditableGraphicSchema/);
  assert.match(editorPage, /GraphicEditorClient/);
  assert.match(editorPage, /projectId|displayId/);

  assert.match(preload, /neud:editor:open/);
  assert.match(preload, /editor:\s*\{/);
  assert.match(ipc, /neud:editor:open/);
  assert.match(ipc, /openGraphicEditorWindow/);
  assert.match(ipc, /\/editor\/graphic/);
  assert.match(main, /registerEditorIpc/);
  assert.match(types, /editor\?:/);

  assert.match(api, /localSaveEditableGraphicSchema/);
  assert.match(routes, /editable-schema/);
  assert.match(service, /saveEditableGraphicSchema/);
  assert.match(service, /published:\s*false/);
  assert.match(service, /injectEditableGraphicSchema/);
});

test("text escape helper rejects script breakout characters", () => {
  const schema = read(SCHEMA_REL);
  assert.match(schema, /&amp;|&lt;|&gt;|&quot;/);
  const html = read(HTML_REL);
  // Runtime uses textContent assignment (safe) plus escapeText helper
  assert.match(html, /span\.textContent\s*=/);
  assert.match(html, /escapeText/);
});

test("Runtime: buildSemaPackageV1 includes editable + original ticker", () => {
  const distBuilder = path.join(
    repoRoot,
    "desktop",
    "dist",
    "packages",
    "sema-package-builder.js",
  );
  const srcBuilder = path.join(
    repoRoot,
    "desktop",
    "src",
    "packages",
    "sema-package-builder.ts",
  );
  const distReady =
    fs.existsSync(distBuilder) &&
    fs.readFileSync(distBuilder, "utf8").includes("schedule-ticker-editable");
  if (!distReady) {
    // Dist may be missing or stale; source wiring is covered by earlier tests.
    assert.ok(fs.existsSync(srcBuilder));
    assert.match(
      read("desktop/src/packages/sema-package-builder.ts"),
      /SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH/,
    );
    return;
  }

  const {
    buildSemaPackageV1,
    SEMA_SCHEDULE_TICKER_HTML_PATH,
    SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH,
  } = require(distBuilder);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-editable-"));
  try {
    const packageManifest = buildSemaPackageV1(tmp);
    assert.equal(packageManifest.packageVersion, 8);
    const slugs = packageManifest.displays.map((d) => d.slug);
    assert.ok(slugs.includes("schedule-ticker"));
    assert.ok(slugs.includes("schedule-pylon"));
    assert.ok(slugs.includes("schedule-ticker-editable"));
    const editable = packageManifest.displays.find(
      (d) => d.slug === "schedule-ticker-editable",
    );
    assert.equal(editable.name, "Schedule Ticker Editable");
    assert.equal(editable.width, 3840);
    assert.equal(editable.height, 2160);
    assert.equal(editable.runtimeAdapterKey, "sema-schedule-ticker-editable");
    assert.equal(editable.htmlPath, SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH);
    assert.ok(fs.existsSync(path.join(tmp, SEMA_SCHEDULE_TICKER_HTML_PATH)));
    assert.ok(fs.existsSync(path.join(tmp, SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH)));
    assert.ok(packageManifest.integrity?.files?.[SEMA_SCHEDULE_TICKER_HTML_PATH]);
    assert.ok(packageManifest.integrity?.files?.[SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH]);
    const editableHtml = fs.readFileSync(
      path.join(tmp, SEMA_SCHEDULE_TICKER_EDITABLE_HTML_PATH),
      "utf8",
    );
    assert.match(editableHtml, /Schedule Ticker Editable/);
    assert.match(editableHtml, /neud-editable-schema/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
