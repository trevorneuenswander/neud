#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("pinned graphicOnly uses output shell without preview=1", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(canvas, /outputShell: graphicOnly/);
  assert.match(canvas, /outputShell = options\?\.outputShell === true/);
  assert.match(canvas, /if \(outputShell\) \{\s*url\.searchParams\.delete\("preview"\)/);
  assert.match(canvas, /url\.searchParams\.set\("preview", "1"\)/);
});

test("pinned management region keeps bg-surface", () => {
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.match(slot, /data-pinned-preview-region/);
  assert.match(slot, /bg-surface/);
});

test("pinned preview wrapper stays transparent layout shell", () => {
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.match(slot, /data-pinned-preview-wrapper/);
  assert.match(slot, /bg-transparent/);
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(canvas, /data-pinned-display-window/);
  assert.match(canvas, /transparentShellStyle/);
  assert.match(canvas, /className="border-0 bg-transparent"/);
});

test("output view forwards pinnedPreview to revision HTML", () => {
  const output = read("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  assert.match(output, /pinnedPreview = search\.get\("pinnedPreview"\) === "1"/);
  assert.match(output, /previewSample = search\.get\("previewSample"\)/);
  const mode = read("src/lib/displays/display-view-mode.ts");
  assert.match(mode, /pinnedPreview\?: boolean/);
  assert.match(mode, /params\.set\("pinnedPreview", "1"\)/);
});

test("Local URL output path unchanged", () => {
  const output = read("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  assert.match(output, /outputMode: true/);
  assert.match(output, /background: "transparent"/);
});

test("fullscreen BrowserWindow is opaque, resizable, and aspect-locked", () => {
  const manager = read("desktop/src/services/display-preview-window-manager.ts");
  assert.match(manager, /resizable: true/);
  assert.match(manager, /transparent: false/);
  assert.doesNotMatch(manager, /transparent: true/);
  assert.match(manager, /window\.setAspectRatio\(windowAspectRatio\)/);
  assert.match(manager, /const windowAspectRatio = displayWidth \/ displayHeight/);
  assert.match(manager, /function resolveViewerMinimumSize/);
  assert.match(manager, /Math\.round\(\(minWidth \* displayHeight\) \/ displayWidth\)/);
});

test("window-fit uses management checkerboard shell", () => {
  const client = read("src/components/displays/DisplayWindowFitClient.tsx");
  const shell = read("src/components/displays/useDisplayWindowFitViewerStyles.ts");
  assert.match(client, /useDisplayWindowFitViewerStyles/);
  assert.doesNotMatch(client, /useDisplayViewportShellStyles/);
  assert.match(shell, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(shell, /neud-window-fit-viewer/);
});

test("window-fit iframe remains transparent", () => {
  const client = read("src/components/displays/DisplayWindowFitClient.tsx");
  assert.match(client, /bg-transparent/);
  assert.match(client, /backgroundColor: "transparent"/);
});

test("contain scale helper unchanged", async () => {
  const { computeDisplayViewerContainScale } = await import(
    "../../src/lib/displays/display-viewer-scale.ts"
  );
  assert.equal(computeDisplayViewerContainScale(1920, 1080, 3840, 2160), 0.5);
});

test("Online Viewer and output views avoid checkerboard token", () => {
  const output = read("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  assert.doesNotMatch(output, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  const hosted = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.doesNotMatch(hosted, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
});
