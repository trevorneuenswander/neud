#!/usr/bin/env node
/**
 * SEMA graphic editor MVP checks (Pass 11 Item 4 companion).
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

test("editor window manager opens a BrowserWindow (not a modal)", () => {
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  assert.match(manager, /new BrowserWindow/);
  assert.match(manager, /openGraphicEditorWindow/);
  assert.doesNotMatch(manager, /modal:\s*true/);
  assert.match(manager, /loadURL/);
});

test("editor save path writes settings and does not auto-publish", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const api = read("src/lib/local/editable-graphic-api.ts");
  const client = read("src/components/editor/GraphicEditorClient.tsx");

  assert.match(service, /saveEditableGraphicSchema/);
  assert.match(service, /editableGraphicSchema:\s*schema/);
  assert.match(service, /published:\s*false/);
  assert.doesNotMatch(
    service.slice(
      service.indexOf("saveEditableGraphicSchema"),
      service.indexOf("saveEditableGraphicSchema") + 1200,
    ),
    /publishDisplay\(/,
  );
  assert.match(api, /method:\s*"PUT"/);
  assert.match(client, /Draft saved \(not published\)|Saved to display settings \(not published\)/);
});

test("editor uses live SEMA sample or local fallback without mutating state", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  const api = read("src/lib/local/editable-graphic-api.ts");
  assert.match(client, /LOCAL_SEMA_EDITOR_SAMPLE_SCHEDULE/);
  assert.match(client, /preview=1/);
  assert.match(api, /LOCAL_SEMA_EDITOR_SAMPLE_SCHEDULE/);
  assert.doesNotMatch(client, /sema\/advance|sema\/now|setManualFields/);
});

test("DisplayEditMenu gates Graphic Editor on editorSchemaVersion / graphicType", () => {
  const editMenu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(editMenu, /label:\s*"Graphic Editor"/);
  assert.match(editMenu, /version === 1 \|\| version === 2/);
  assert.match(editMenu, /graphicType === "schedule-ticker-editable"/);
  assert.match(editMenu, /supportsGraphicEditor/);
  assert.match(editMenu, /Graphic Editor is not available for this display yet/);
});
