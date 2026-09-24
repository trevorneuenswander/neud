#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function computeDisplayViewerScale(
  viewportWidth,
  viewportHeight,
  displayWidth,
  displayHeight,
) {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    displayWidth <= 0 ||
    displayHeight <= 0
  ) {
    return 1;
  }
  return Math.min(1, viewportWidth / displayWidth, viewportHeight / displayHeight);
}

test("formatDisplayVersion renders compact v labels", () => {
  const format = readSrc("src/lib/displays/display-version-format.ts");
  assert.match(format, /return `v\$\{versionNumber\}`/);
  assert.match(format, /DISPLAY_VERSION_UNAVAILABLE_LABEL = "v—"/);
});

test("computeDisplayViewerScale fits 1920x1080 canvases without cropping", () => {
  const scaleSource = readSrc("src/lib/displays/display-viewer-scale.ts");
  assert.match(scaleSource, /Math\.min\(1, viewportWidth \/ displayWidth, viewportHeight \/ displayHeight\)/);

  const displayWidth = 1920;
  const displayHeight = 1080;

  assert.equal(
    computeDisplayViewerScale(1920, 1080, displayWidth, displayHeight),
    1,
  );
  assert.equal(
    Number(
      computeDisplayViewerScale(1600, 900, displayWidth, displayHeight).toFixed(4),
    ),
    0.8333,
  );
  assert.equal(
    Number(
      computeDisplayViewerScale(1280, 720, displayWidth, displayHeight).toFixed(4),
    ),
    0.6667,
  );
  assert.equal(
    Number(
      computeDisplayViewerScale(1000, 700, displayWidth, displayHeight).toFixed(4),
    ),
    0.5208,
  );
  assert.equal(
    Number(
      computeDisplayViewerScale(800, 600, displayWidth, displayHeight).toFixed(4),
    ),
    0.4167,
  );
});

test("3840x2160 display scales down inside smaller viewports", () => {
  const displayWidth = 3840;
  const displayHeight = 2160;
  const scale = computeDisplayViewerScale(1920, 1080, displayWidth, displayHeight);
  assert.equal(Number(scale.toFixed(4)), 0.5);
});

test("HtmlDisplayLiveView uses DisplayViewerScaledCanvas with measured viewport", () => {
  const liveView = readSrc("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  const canvas = readSrc("src/components/displays/DisplayViewerScaledCanvas.tsx");
  const measurements = readSrc("src/lib/displays/display-viewer-measurements.ts");
  assert.match(liveView, /DisplayViewerScaledCanvas/);
  assert.match(liveView, /h-screen w-screen overflow-hidden/);
  assert.match(canvas, /ResizeObserver/);
  assert.match(canvas, /display-viewer-viewport/);
  assert.match(canvas, /display-viewer-scaled-bounds/);
  assert.match(canvas, /display-viewer-canvas/);
  assert.match(canvas, /buildDisplayViewerMeasurements/);
  assert.match(canvas, /displayViewerDebug/);
  assert.match(canvas, /Rendered Display Bounds: \{measurements\.displayWidth\}/);
  assert.match(canvas, /On-Screen Bounds:/);
  assert.match(measurements, /export type DisplayViewerMeasurements/);
});

test("display viewer measurements keep rendered bounds at configured canvas size", () => {
  const displayWidth = 1920;
  const displayHeight = 1080;

  const fit720p = buildDisplayViewerMeasurements(1280, 720, displayWidth, displayHeight);
  assert.equal(fit720p.displayWidth, 1920);
  assert.equal(fit720p.displayHeight, 1080);
  assert.equal(Number(fit720p.scale.toFixed(4)), 0.6667);
  assert.equal(fit720p.scaledWidth, 1280);
  assert.equal(fit720p.scaledHeight, 720);

  const fitCustom = buildDisplayViewerMeasurements(1000, 700, displayWidth, displayHeight);
  assert.equal(Number(fitCustom.scale.toFixed(4)), 0.5208);
  assert.equal(fitCustom.displayWidth, 1920);
  assert.equal(fitCustom.displayHeight, 1080);
  assert.equal(Number(fitCustom.scaledWidth.toFixed(1)), 1000);
  assert.equal(fitCustom.scaledHeight, 562.5);

  const uhd = buildDisplayViewerMeasurements(1280, 720, 3840, 2160);
  assert.equal(uhd.displayWidth, 3840);
  assert.equal(uhd.displayHeight, 2160);
  assert.equal(Number(uhd.scale.toFixed(4)), 0.3333);
  assert.equal(uhd.scaledWidth, 1280);
  assert.equal(uhd.scaledHeight, 720);
});

function buildDisplayViewerMeasurements(
  viewportWidth,
  viewportHeight,
  displayWidth,
  displayHeight,
) {
  const scale = computeDisplayViewerScale(
    viewportWidth,
    viewportHeight,
    displayWidth,
    displayHeight,
  );
  return {
    viewportWidth,
    viewportHeight,
    displayWidth,
    displayHeight,
    scale,
    scaledWidth: displayWidth * scale,
    scaledHeight: displayHeight * scale,
  };
}

test("display version UI uses shared compact formatter", () => {
  const badge = readSrc("src/components/displays/DisplayVersionBadge.tsx");
  const versionList = readSrc("src/components/developer-tools/DisplayVersionList.tsx");
  const labels = readSrc("src/lib/developer-tools/revision-labels.ts");
  assert.match(badge, /formatDisplayVersion/);
  assert.match(versionList, /formatDisplayVersion/);
  assert.match(labels, /formatDisplayVersion/);
  assert.doesNotMatch(badge, /Version —/);
  assert.doesNotMatch(versionList, /Make .* the active version\?/);
  assert.match(versionList, /Make \{pendingActivation\.versionLabel\} active\?/);
});

test("no user-facing Version 1 labels remain in display version components", () => {
  const files = [
    "src/components/displays/DisplayVersionBadge.tsx",
    "src/components/developer-tools/DisplayVersionList.tsx",
    "src/lib/displays/display-version-format.ts",
  ];
  for (const file of files) {
    const source = readSrc(file);
    assert.doesNotMatch(source, /Version \$\{/);
    assert.doesNotMatch(source, /`Version \$\{/);
    assert.doesNotMatch(source, /Version —/);
  }
});

test("activity messages use compact v labels", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /Activated \$\{versionTag\}/);
  assert.match(service, /Renamed \$\{versionTag\} description/);
  assert.match(service, /Saved \$\{versionTag\}:/);
});
