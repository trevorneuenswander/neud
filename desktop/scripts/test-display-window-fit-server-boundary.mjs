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

test("parseDisplayWindowFitDimensions lives in server-safe module", () => {
  const helper = read("src/lib/displays/display-window-fit.ts");
  assert.match(helper, /export function parseDisplayWindowFitDimensions/);
  assert.match(helper, /export function parseDisplayWindowFitTarget/);
  assert.doesNotMatch(helper, /"use client"/);
  assert.doesNotMatch(helper, /from "react"/);
  assert.match(helper, /DEFAULT_DISPLAY_WIDTH/);
});

test("window-fit server page imports server-safe parser only", () => {
  const page = read("src/app/display/window-fit/page.tsx");
  assert.match(page, /from "@\/lib\/displays\/display-window-fit"/);
  assert.match(page, /parseDisplayWindowFitDimensions/);
  assert.doesNotMatch(page, /export function parseDisplayWindowFitDimensions/);
  assert.doesNotMatch(
    read("src/components/displays/DisplayWindowFitClient.tsx"),
    /parseDisplayWindowFitDimensions/,
  );
  const client = read("src/components/displays/DisplayWindowFitClient.tsx");
  assert.doesNotMatch(client, /export function parseDisplayWindowFitDimensions/);
});

test("DisplayWindowFitClient receives numeric dimension props", () => {
  const page = read("src/app/display/window-fit/page.tsx");
  assert.match(page, /displayWidth=\{displayWidth\}/);
  assert.match(page, /displayHeight=\{displayHeight\}/);
  assert.match(page, /targetUrl=\{target\}/);
});

test("fullscreen contain scale helper unchanged", async () => {
  const scaleModule = read("src/lib/displays/display-viewer-scale.ts");
  assert.match(scaleModule, /computeDisplayViewerContainScale/);
  assert.match(
    scaleModule,
    /return Math\.min\(\s*viewportWidth \/ displayWidth,\s*viewportHeight \/ displayHeight,/,
  );
  const { computeDisplayViewerContainScale } = await import(
    "../../src/lib/displays/display-viewer-scale.ts"
  );
  assert.equal(computeDisplayViewerContainScale(1920, 1080, 3840, 2160), 0.5);
  assert.equal(computeDisplayViewerContainScale(3840, 2160, 1920, 1080), 2);
});

test("electron viewer window stays resizable with display aspect lock", () => {
  const manager = read("desktop/src/services/display-preview-window-manager.ts");
  assert.match(manager, /resizable: true/);
  assert.match(manager, /fullscreen: false/);
  assert.match(manager, /setAspectRatio\(windowAspectRatio\)/);
  assert.doesNotMatch(manager, /setResizable\(false\)/);
  assert.doesNotMatch(manager, /minHeight: Math\.round\(FULLSCREEN_MIN_WIDTH/);
});

test("window-fit shell uses checkerboard; scaled iframe stays transparent", () => {
  const client = read("src/components/displays/DisplayWindowFitClient.tsx");
  const shell = read("src/components/displays/useDisplayWindowFitViewerStyles.ts");
  assert.match(client, /allowUpscale/);
  assert.match(shell, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(client, /bg-transparent/);
  assert.doesNotMatch(client, /neud-viewer-transparency-grid/);
});
