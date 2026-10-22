#!/usr/bin/env node
/**
 * Graphic Editor Phase 5 — working UI wiring contracts.
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

test("Phase 5 foundation modules exist", () => {
  for (const file of [
    "src/lib/editor/editor-history.ts",
    "src/lib/editor/rulers.ts",
    "src/lib/editor/inline-text-tokens.ts",
    "src/lib/editor/text-styles.ts",
    "src/lib/editor/editor-components.ts",
    "src/lib/editor/font-management.ts",
    "src/lib/editor/named-drafts.ts",
    "src/lib/editor/operator-controls.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(repoRoot, file)), file);
  }
});

test("Phase 5 UI panels wired in GraphicEditorClient", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(editor, /EditorHistoryPanel/);
  assert.match(editor, /EditorRulers/);
  assert.match(editor, /AssetLibraryPanel/);
  assert.match(editor, /EditorDesignPanel/);
  assert.match(editor, /NamedDraftsPanel/);
  assert.match(editor, /VersionCompareModal/);
  assert.match(editor, /InlineTokenEditor/);
  assert.match(editor, /snapMove/);
  assert.match(editor, /parseNeudGraphicPackage/);
  assert.match(editor, /Save As Draft|NamedDraftsPanel/);
  assert.match(editor, /beginCanvasGuideDrag/);
  assert.match(editor, /beginGuideEditSession/);
  const rulers = read("src/components/editor/EditorRulers.tsx");
  assert.match(rulers, /onGuideSessionStart/);
  assert.match(read("src/lib/editor/rulers.ts"), /isGuideOffCanvas/);
});

test("schema Phase 5 document fields", () => {
  const src = read("src/lib/editor/editable-graphic-types.ts");
  assert.match(src, /textStyles\?/);
  assert.match(src, /operatorSections\?/);
  assert.match(src, /projectAssets\?/);
  assert.match(src, /fontFallbacks\?/);
  assert.match(src, /textStyleId\?/);
});
