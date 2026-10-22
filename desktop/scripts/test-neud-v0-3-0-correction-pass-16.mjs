#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 16 + Graphic Editor Phase 4 contracts.
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

test("STREAM BID: current pass22 title layout (supersedes Pass 16 markers)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});

test("SAVE DRAFT: desktop IPC path + failed-to-fetch classifier", () => {
  const api = read("src/lib/local/editable-graphic-api.ts");
  const origin = read("src/lib/local/local-api-origin.ts");
  const editorIpc = read("desktop/src/ipc/editor.ts");
  const preload = read("desktop/src/preload.ts");
  assert.match(api, /saveEditableSchema/);
  assert.match(api, /getEditableSchema/);
  assert.match(editorIpc, /neud:editor:saveEditableSchema/);
  assert.match(editorIpc, /neud:editor:getEditableSchema/);
  assert.match(preload, /saveEditableSchema/);
  assert.match(origin, /failed to fetch/);
});

test("TITLEBAR + TOOLBAR: standard height, centered title, left Save/Group", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  const manager = read("desktop/src/services/graphic-editor-window-manager.ts");
  assert.match(editor, /h-9/);
  assert.match(editor, /displayName/);
  assert.match(editor, /absolute inset-0 flex flex-col items-center justify-center/);
  assert.match(editor, /Draft — Unsaved|Draft — Saved/);
  assert.doesNotMatch(editor, /iconBtn\("Close"/);
  assert.doesNotMatch(manager, /trafficLightPosition/);
  // Undo/Redo + Group on left strip; canvas Select remains available.
  const leftIdx = editor.indexOf("grid-cols-[280px_1fr_320px]");
  const undoIdx = editor.indexOf('iconBtn("Undo"');
  const selectIdx = editor.indexOf('iconBtn("Select"');
  assert.ok(leftIdx > 0 && undoIdx > leftIdx && selectIdx > undoIdx);
});

test("PHASE 4: modules + creation contract present", () => {
  assert.ok(fs.existsSync(path.join(repoRoot, "docs/graphic-editor-creation-contract.md")));
  assert.ok(fs.existsSync(path.join(repoRoot, "src/lib/editor/phase4-types.ts")));
  assert.ok(fs.existsSync(path.join(repoRoot, "src/lib/editor/neudgraphic-package.ts")));
  assert.ok(fs.existsSync(path.join(repoRoot, "src/lib/editor/autosave-recovery.ts")));
  assert.ok(fs.existsSync(path.join(repoRoot, "src/components/editor/CollapsibleSection.tsx")));
  assert.ok(fs.existsSync(path.join(repoRoot, "src/components/editor/TransformHud.tsx")));
  assert.ok(fs.existsSync(path.join(repoRoot, "src/components/editor/ColorField.tsx")));
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(editor, /CollapsibleSection/);
  assert.match(editor, /TransformHud/);
  assert.match(editor, /Capture Live as Sample/);
  assert.match(editor, /Stagger Animation/);
  assert.match(editor, /Exported \.neudgraphic|\.neudgraphic/);
  assert.match(editor, /Pixel Perfect/);
  assert.match(editor, /estimateGraphicBudget/);
  const contract = read("docs/graphic-editor-creation-contract.md");
  assert.match(contract, /AI Assistant/);
  assert.match(contract, /EditableGraphic/);
});
