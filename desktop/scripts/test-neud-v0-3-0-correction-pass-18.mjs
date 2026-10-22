#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 18 — Graphic Editor save/import + menu/toolbar/titlebar.
 *
 * Stream Bid Pass 18 canvas acceptance: test-stream-bid-descender-fixture.mjs
 * Editor Electron-equivalent integration: test-neud-graphic-editor-electron-integration.mjs
 * Editor functional audit matrix (8A–8M): test-neud-graphic-editor-functional-audit.mjs
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

test("SAVE: IPC instrumentation + preload exposure", () => {
  const api = read("src/lib/local/editable-graphic-api.ts");
  const editorIpc = read("desktop/src/ipc/editor.ts");
  const preload = read("desktop/src/preload.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");
  const client = read("src/components/editor/GraphicEditorClient.tsx");

  assert.match(api, /\[neud-editor-save\]/);
  assert.match(editorIpc, /\[neud-editor-save\]/);
  assert.match(service, /\[neud-editor-save\]/);
  assert.match(client, /\[neud-editor-save\]/);
  assert.match(editorIpc, /neud:editor:saveEditableSchema/);
  assert.match(preload, /saveEditableSchema/);
  assert.match(api, /desktop\?\.editor\?\.saveEditableSchema/);
});

test("IMPORT: IPC + absolute asset URL base", () => {
  const api = read("src/lib/local/editable-graphic-api.ts");
  const editorIpc = read("desktop/src/ipc/editor.ts");
  const preload = read("desktop/src/preload.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");

  assert.match(editorIpc, /neud:editor:importDisplayAsset/);
  assert.match(preload, /importDisplayAsset/);
  assert.match(api, /importDisplayAsset/);
  assert.match(api, /resolveDesktopLocalApiConfig|displayAssetApiOrigin/);
  assert.match(api, /primeDisplayAssetUrlBase/);
  assert.match(service, /sanitizeImportedDisplayAssetBuffer/);
});

test("FILE MENU: editor-only wiring + focus restore", () => {
  const menu = read("desktop/src/menu/application-menu.ts");
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  const preload = read("desktop/src/preload.ts");

  assert.match(menu, /installGraphicEditorApplicationMenu/);
  assert.match(menu, /Save Draft/);
  assert.match(menu, /Import/);
  assert.match(menu, /NEUD Graphic/);
  assert.doesNotMatch(menu, /PSD/);
  assert.match(manager, /installGraphicEditorApplicationMenu/);
  assert.match(manager, /restoreMainApplicationMenu/);
  assert.match(preload, /onMenuAction/);
  assert.match(client, /onMenuAction/);
});

test("TOOLBAR: Undo/Redo left, Group right; no Save/Import/Export", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  const leftIdx = client.indexOf("justify-between gap-1 border-r border-neutral-800");
  assert.ok(leftIdx > 0);
  const leftBlock = client.slice(leftIdx, leftIdx + 700);
  assert.match(leftBlock, /EditorUndoIcon/);
  assert.match(leftBlock, /EditorRedoIcon/);
  assert.match(leftBlock, /iconBtn\("Group"/);
  assert.doesNotMatch(client, /iconBtn\("Save Draft"/);
  assert.doesNotMatch(client, /iconBtn\("Save As"/);
  assert.doesNotMatch(client, /Import \.neudgraphic/);
  assert.doesNotMatch(client, /Export \.neudgraphic/);
  assert.doesNotMatch(client, /Import PSD/);
});

test("TITLEBAR: h-9 + shell height + editor shell opt-out", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  const capabilities = read("src/lib/desktop/shell-capabilities.ts");

  assert.match(client, /h-9/);
  assert.match(client, /desktopTitleBarCssHeight/);
  assert.match(capabilities, /2\.25rem/);
  assert.match(shell, /isGraphicEditorRoute|startsWith\("\/editor"\)/);
  assert.match(manager, /height:\s*36/);
});

test("KEYBOARD: Cmd/Ctrl+S and Shift+S", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(client, /event\.key\.toLowerCase\(\) === "s" && !event\.shiftKey/);
  assert.match(client, /event\.key\.toLowerCase\(\) === "s" && event\.shiftKey/);
});

test("DEAD CONTROLS: Timeline-lite + PSD hidden from UI", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  assert.doesNotMatch(client, /Timeline-lite/);
  assert.doesNotMatch(client, /psdInputRef/);
});

test("DIRTY STATE: save failure stays unsaved", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(client, /Draft — Unsaved/);
  assert.match(client, /setDraftStatus\("dirty"\)/);
  const saveCatch = client.slice(client.indexOf("async function save"), client.indexOf("function exportNeudGraphicPackage"));
  assert.match(saveCatch, /setDraftStatus\("dirty"\)/);
});

test("PASS 18+: Stream Bid uses pass22 layout + fixture scripts", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});
