#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 15 contracts.
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

test("STREAM BID: current pass22 title layout (supersedes Pass 15 SVG markers)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});

test("GRAPHIC EDITOR: no app Close button; display name titlebar; traffic lights centered", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  assert.doesNotMatch(editor, /iconBtn\("Close"/);
  assert.doesNotMatch(editor, /NEUD Graphic Editor/);
  assert.match(editor, /displayName/);
  assert.match(editor, /document\.title\s*=\s*name/);
  assert.match(editor, /bg-\[#1a2332\]/);
  // Title bar height matches AppTitleBar (h-9 / 2.25rem).
  assert.match(editor, /h-9/);
  assert.doesNotMatch(manager, /trafficLightPosition/);
  assert.match(manager, /titleBarStyle|hiddenInset/);
});

test("GRAPHIC EDITOR: toolbar aligns with canvas; icon tools present", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  const icons = read("src/components/editor/editor-toolbar-icons.tsx");
  assert.match(editor, /grid-cols-\[280px_1fr_320px\]/);
  assert.match(editor, /EditorUndoIcon/);
  assert.match(editor, /EditorRedoIcon/);
  assert.match(editor, /EditorSelectIcon/);
  assert.match(editor, /EditorTextIcon/);
  assert.match(editor, /EditorRectIcon/);
  assert.match(editor, /EditorEllipseIcon/);
  assert.match(editor, /EditorLineIcon/);
  assert.match(editor, /EditorImageIcon/);
  assert.match(icons, /EditorUndoIcon/);
  assert.match(icons, /EditorSelectIcon/);
  assert.match(icons, /EditorImageIcon/);
});

test("GRAPHIC EDITOR: Sample/Live in Data Source; animations only in Animations tab", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(editor, /Preview Data/);
  assert.match(editor, /setDataMode\("sample"\)/);
  assert.match(editor, /setDataMode\("live"\)/);
  assert.doesNotMatch(editor, /Sample Data/);
  assert.doesNotMatch(editor, /Live Data/);
  // Animations config lives under rightTab === "animations"
  const animTabIdx = editor.indexOf('rightTab === "animations"');
  const propsTabIdx = editor.indexOf('rightTab === "properties"');
  assert.ok(animTabIdx > 0 && propsTabIdx > 0);
  const propsBlock = editor.slice(propsTabIdx, animTabIdx);
  assert.doesNotMatch(propsBlock, /Preset/);
  assert.doesNotMatch(propsBlock, /Duration/);
  assert.match(editor.slice(animTabIdx), /Preset/);
  assert.match(editor.slice(animTabIdx), /Easing/);
  // Timeline-lite panel was folded into Animations controls; Preset/Easing remain.
});

test("GRAPHIC EDITOR: left Layers only; right three tabs", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(editor, /Layers/);
  assert.doesNotMatch(editor, /leftTab/);
  assert.match(editor, /rightTab/);
  assert.match(editor, /\["properties", "Properties"\]/);
  assert.match(editor, /\["data", "Data Source"\]/);
  assert.match(editor, /\["animations", "Animations"\]/);
});
