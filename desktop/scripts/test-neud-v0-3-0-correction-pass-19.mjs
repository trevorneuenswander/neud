#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 19 — Graphic Editor close hotfix (current contracts).
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

test("CLOSE: main intercepts with allowClose + native dirty dialog", () => {
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  const editorIpc = read("desktop/src/ipc/editor.ts");
  const preload = read("desktop/src/preload.ts");

  assert.match(manager, /allowClose/);
  assert.match(manager, /attachGraphicEditorCloseHandler|requestGraphicEditorClose/);
  assert.match(manager, /event\.preventDefault\(\)/);
  assert.match(manager, /Save Changes Before Closing\?/);
  assert.match(manager, /dialog\.showMessageBox/);
  assert.match(manager, /requestGraphicEditorClose/);
  assert.match(editorIpc, /requestGraphicEditorClose|confirmGraphicEditor|neud:editor/);
  assert.match(preload, /neud:app:closeRequested|neud:editor/);
});

test("CLOSE: dirty save dialog offers Save / Don't Save / Cancel", () => {
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  assert.match(manager, /Save and Close/);
  assert.match(manager, /Don't Save/);
  assert.match(manager, /Cancel/);
  assert.match(manager, /Unable to save changes/);
});

test("TITLEBAR: macOS traffic-light inset is no-drag", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(client, /w-\[78px\]/);
  assert.match(client, /showMacTrafficLightInset/);
  const titlebarBlock = client.slice(
    client.indexOf("showMacTrafficLightInset"),
    client.indexOf("Toolbar: left"),
  );
  assert.match(titlebarBlock, /WebkitAppRegion: "no-drag"/);
  assert.match(titlebarBlock, /WebkitAppRegion: "drag"/);
  const outerTitlebar = titlebarBlock.match(
    /className="relative flex h-9 shrink-0 items-center[\s\S]*?\n      >/,
  )?.[0];
  assert.ok(outerTitlebar);
  assert.doesNotMatch(outerTitlebar, /WebkitAppRegion: "drag"/);
});

test("FILE MENU: Close Window uses requestGraphicEditorClose", () => {
  const menu = read("desktop/src/menu/application-menu.ts");
  assert.match(menu, /Close Window/);
  assert.match(menu, /requestGraphicEditorClose/);
  assert.doesNotMatch(menu, /forceClose|confirmClose\(true\)/);
});

test("CLOSE: confirm path sets allowClose then destroys window", () => {
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  assert.match(manager, /if \(record\.allowClose\)/);
  assert.match(manager, /record\.allowClose = true/);
  assert.match(manager, /destroyGraphicEditorWindow/);
});
