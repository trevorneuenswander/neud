#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 14 contracts.
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

test("STREAM BID: current pass22 title layout (supersedes Pass 14 HTML clip path)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});

test("DISPLAY SETTINGS: modal over main window, not BrowserWindow", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  const modal = read("src/components/ui/NeudModal.tsx");
  assert.match(menu, /NeudModal/);
  assert.match(menu, /showSettingsModal/);
  assert.match(menu, /variant="modal"/);
  assert.match(menu, /size="xl"/);
  assert.doesNotMatch(menu, /displaySettings\.open/);
  assert.match(modal, /xl:\s*"max-w-6xl"/);
});

test("GRAPHIC EDITOR: dark workspace + NEUD titlebar only", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(editor, /NEUD titlebar|Pass 16:|Pass 15: NEUD|Pass 14: NEUD|bg-\[#1a2332\]/);
  assert.match(editor, /bg-\[#1a2332\]/);
  assert.match(editor, /bg-neutral-950/);
  assert.match(editor, /displayName/);
  // Left pane is Layers only — no left-side Properties/Data/Animations tabs
  assert.match(editor, /Layers/);
  assert.match(editor, /rightTab/);
  assert.doesNotMatch(editor, /leftTab/);
});

test("GRAPHIC EDITOR: right pane tabs Properties / Data Source / Animations", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(editor, /\["properties", "Properties"\]/);
  assert.match(editor, /\["data", "Data Source"\]/);
  assert.match(editor, /\["animations", "Animations"\]/);
  assert.match(editor, /rightTab === "properties"/);
  assert.match(editor, /rightTab === "data"/);
  assert.match(editor, /rightTab === "animations"/);
});

test("GRAPHIC EDITOR: context menu has no reorder actions; drag reorder present", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(editor, /Duplicate Layer/);
  assert.match(editor, /Delete Layer/);
  assert.match(editor, /Group Selected/);
  assert.match(editor, /Ungroup/);
  assert.doesNotMatch(editor, /Bring Forward/);
  assert.doesNotMatch(editor, /Send Backward/);
  assert.doesNotMatch(editor, /Bring to Front/);
  assert.doesNotMatch(editor, /Send to Back/);
  assert.match(editor, /DndContext/);
  assert.match(editor, /SortableContext/);
  assert.match(editor, /DragOverlay/);
  assert.match(editor, /SortableEditorLayerRow/);
  assert.match(editor, /Visibility/);
});
