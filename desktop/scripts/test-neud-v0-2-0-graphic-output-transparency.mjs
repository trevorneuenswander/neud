#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("four-surface contract: output vs management paths diverge correctly", () => {
  const outputView = read("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  const liveView = read("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  const canvasPreview = read("src/components/displays/DisplayCanvasPreview.tsx");
  const displayCard = read("src/components/displays/DisplayCard.tsx");
  const livePage = read("src/components/displays/DisplayLivePageClient.tsx");

  assert.match(outputView, /outputMode: true/);
  assert.match(outputView, /background: "transparent"/);
  assert.match(liveView, /DISPLAY_GRAPHIC_OUTPUT_BACKGROUND/);
  assert.match(canvasPreview, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(displayCard, /buildDisplayWindowFitPath/);
  assert.match(read("src/components/displays/DisplayWindowFitClient.tsx"), /allowUpscale/);
  assert.match(read("src/lib/displays/display-viewer-scale.ts"), /computeDisplayViewerContainScale/);
  assert.match(livePage, /viewMode === "viewer"[\s\S]*HtmlDisplayLiveView/);
  assert.match(livePage, /HtmlDisplayOutputView/);
});

test("fullscreen window-fit uses checkerboard; hosted output stays transparent", () => {
  const hosted = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const manager = read("desktop/src/services/display-preview-window-manager.ts");
  const windowFit = read("src/components/displays/useDisplayWindowFitViewerStyles.ts");
  assert.match(hosted, /isFullscreenOutput[\s\S]*fixed inset-0[\s\S]*bg-transparent/);
  assert.match(manager, /transparent: false/);
  assert.match(windowFit, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
});

test("graphic output helper cleanup avoids pinned-only stylesheet injection", () => {
  const helper = read("src/lib/displays/apply-graphic-only-iframe-transparency.ts");
  assert.doesNotMatch(helper, /!important/);
  assert.doesNotMatch(helper, /MANAGEMENT_PREVIEW_TRANSPARENCY_STYLE_ID/);
});
