#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 20 — Graphic Editor main-process close.
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

test("CLOSE: main owns dialog, snapshot, and allowClose", () => {
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  const editorIpc = read("desktop/src/ipc/editor.ts");
  const persist = read("desktop/src/services/editor-editable-schema-persist.ts");
  const preload = read("desktop/src/preload.ts");

  assert.match(manager, /allowClose/);
  assert.match(manager, /latestSchemaSnapshot/);
  assert.match(manager, /saveInProgress/);
  assert.match(manager, /\[editor-close\]/);
  assert.match(manager, /dialog\.showMessageBox/);
  assert.match(manager, /Save Changes Before Closing\?/);
  assert.match(manager, /Save and Close/);
  assert.match(manager, /Don't Save/);
  assert.match(manager, /requestGraphicEditorClose/);
  assert.match(manager, /window\.destroy\(\)/);
  assert.doesNotMatch(manager, /closeRequested/);
  assert.doesNotMatch(manager, /confirmGraphicEditorWindowCloseFromContents/);

  assert.match(editorIpc, /persistEditableGraphicSchema/);
  assert.match(editorIpc, /configureGraphicEditorClosePersistence/);
  assert.match(editorIpc, /editor:dirtyStateChanged/);
  assert.match(editorIpc, /editor:snapshotUpdated/);
  assert.match(editorIpc, /neud:editor:requestClose/);
  assert.doesNotMatch(editorIpc, /confirmClose/);

  assert.match(persist, /saveEditableGraphicSchema/);
  assert.match(preload, /dirtyStateChanged/);
  assert.match(preload, /snapshotUpdated/);
  assert.match(preload, /requestClose/);
  assert.doesNotMatch(preload, /neud:editor:confirmClose/);
  assert.doesNotMatch(preload, /neud:editor:closeRequested/);
});

test("CLOSE: renderer reports dirty/snapshot only — no beforeunload or modal", () => {
  const client = read("src/components/editor/GraphicEditorClient.tsx");
  const types = read("src/lib/desktop/types.ts");

  assert.match(client, /dirtyStateChanged/);
  assert.match(client, /snapshotUpdated/);
  assert.doesNotMatch(client, /beforeunload/);
  assert.doesNotMatch(client, /Save Changes Before Closing\?/);
  assert.doesNotMatch(client, /confirmClose/);
  assert.doesNotMatch(client, /onCloseRequested/);
  assert.match(types, /dirtyStateChanged/);
  assert.match(types, /snapshotUpdated/);
  assert.doesNotMatch(types, /confirmClose/);
  const editorTypes = types.slice(types.indexOf("editor?:"));
  assert.doesNotMatch(editorTypes, /onCloseRequested/);
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

test("FILE MENU: Close Window uses main requestGraphicEditorClose", () => {
  const menu = read("desktop/src/menu/application-menu.ts");
  const client = read("src/components/editor/GraphicEditorClient.tsx");

  assert.match(menu, /Close Window/);
  assert.match(menu, /requestGraphicEditorClose\(editorWindow\)/);
  assert.doesNotMatch(client, /case "closeWindow"/);
});
