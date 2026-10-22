#!/usr/bin/env node
/**
 * NEUD Graphic Editor Pass 17 UX contracts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  computeShapeDrawBounds,
  isShapeDrawLargeEnough,
  hitTestTopLayer,
  MIN_SHAPE_DRAW_SIZE,
} from "../../src/lib/editor/canvas-tools.ts";
import {
  HANDLE_VISUAL_PX,
  HANDLE_HIT_PX,
  handleVisualSize,
  resizeHandleCursor,
} from "../../src/lib/editor/transform-handles.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("shape draw bounds: shift square + alt from center", () => {
  const square = computeShapeDrawBounds(0, 0, 80, 40, { constrainSquare: true });
  assert.equal(square.width, 80);
  assert.equal(square.height, 80);

  const centered = computeShapeDrawBounds(100, 100, 120, 110, { fromCenter: true });
  assert.equal(centered.x, 80);
  assert.equal(centered.y, 90);
  assert.equal(centered.width, 40);
  assert.equal(centered.height, 20);

  const both = computeShapeDrawBounds(50, 50, 70, 60, {
    constrainSquare: true,
    fromCenter: true,
  });
  assert.equal(both.width, both.height);
  assert.equal(both.x, 50 - both.width / 2);
});

test("shape draw minimum size threshold", () => {
  assert.ok(MIN_SHAPE_DRAW_SIZE >= 4);
  assert.equal(isShapeDrawLargeEnough({ x: 0, y: 0, width: 2, height: 10 }), false);
  assert.equal(isShapeDrawLargeEnough({ x: 0, y: 0, width: 8, height: 8 }), true);
});

test("hit test prefers topmost unlocked layer", () => {
  const layers = [
    {
      id: "a",
      zIndex: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visible: true,
      locked: true,
    },
    {
      id: "b",
      zIndex: 2,
      x: 10,
      y: 10,
      width: 80,
      height: 80,
      visible: true,
      locked: false,
    },
  ];
  const hit = hitTestTopLayer(layers, 50, 50);
  assert.equal(hit?.id, "b");
});

test("transform handles: zoom-independent sizing + cursors", () => {
  assert.equal(handleVisualSize(0.25), HANDLE_VISUAL_PX / 0.25);
  assert.equal(handleVisualSize(2), HANDLE_VISUAL_PX / 2);
  assert.ok(HANDLE_HIT_PX > HANDLE_VISUAL_PX);
  assert.equal(resizeHandleCursor("nw"), "nwse-resize");
  assert.equal(resizeHandleCursor("ne"), "nesw-resize");
});

test("Pass 17 toolbar + draw tool wiring in GraphicEditorClient", () => {
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  const icons = read("src/components/editor/editor-toolbar-icons.tsx");
  assert.match(icons, /EditorZoomOutIcon/);
  assert.match(icons, /EditorZoomInIcon/);
  assert.match(editor, /EditorZoomOutIcon/);
  assert.match(editor, /iconBtn\("Zoom Out"/);
  const groupIdx = editor.indexOf('iconBtn("Group"');
  const undoLeftIdx = editor.indexOf('iconBtn("Undo"', groupIdx);
  const selectIdx = editor.indexOf('iconBtn("Select"');
  assert.ok(groupIdx > 0 && undoLeftIdx > groupIdx && undoLeftIdx < selectIdx);
  const canvasUndoIdx = editor.indexOf('iconBtn("Undo"', selectIdx);
  assert.equal(canvasUndoIdx, -1);
  assert.match(editor, /setActiveTool\("rect"\)/);
  assert.match(editor, /setActiveTool\("ellipse"\)/);
  assert.match(editor, /shapeDraw/);
  assert.match(editor, /onStagePointerDown/);
  assert.match(editor, /clearSelection/);
  assert.match(editor, /handleStyle\(handle, canvasScale\)/);
});
