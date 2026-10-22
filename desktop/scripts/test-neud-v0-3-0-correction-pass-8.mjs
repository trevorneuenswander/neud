#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 8 contracts.
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

test("DeckLink build preserves real addon when SDK unset", () => {
  const build = read("desktop/scripts/build-decklink-addon.mjs");
  assert.match(build, /isRealDeckLinkAddonBinary/);
  assert.match(build, /Preserving existing real addon/);
  assert.match(build, /DeckLinkSDK/);
  assert.match(build, /forceStub/);
  assert.match(build, /neud_decklink\.meta\.json/);
});

test("native DeckLink port distinguishes stub / Desktop Video / load failure", () => {
  const port = read("desktop/src/output/native-decklink-port.ts");
  assert.match(port, /EXTERNAL_NATIVE_ADDON_FAILED/);
  assert.match(port, /EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE/);
  assert.match(port, /EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE/);
  assert.match(port, /adapter\.stub/);
  assert.match(port, /getAdapterInfo/);
});

test("operator-facing external device unavailable states are distinct", () => {
  const labels = read("src/lib/output/output-adapter-labels.ts");
  assert.match(labels, /EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE/);
  assert.match(labels, /EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE/);
  assert.match(labels, /EXTERNAL_NATIVE_ADDON_FAILED/);
  assert.match(labels, /EXTERNAL_NO_DEVICES/);
  assert.match(labels, /operatorFacingExternalDeviceUnavailable/);
  const ui = read("src/components/output/OutputManager.tsx");
  assert.match(ui, /operatorFacingExternalDeviceUnavailable/);
});

test("computer display presentation forces square corners", () => {
  const host = read("desktop/src/output/output-window-host.ts");
  assert.match(host, /roundedCorners:\s*false/);
  assert.match(host, /hasShadow:\s*false/);
  const mac = read("desktop/native/mac-output/mac-output.mm");
  assert.match(mac, /cornerRadius\s*=\s*0/);
  assert.match(mac, /hasShadow\s*=\s*NO/);
  const fit = read("src/components/displays/useDisplayWindowFitViewerStyles.ts");
  assert.match(fit, /borderRadius\s*=\s*"0"/);
  assert.match(fit, /100vw/);
  assert.match(fit, /100vh/);
});

test("Stream Bid title uses current pass22 layout (supersedes Pass 15 SVG markers)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});

test("Schedule Ticker bottom edge is flush to canvas", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(html, /\.bar\s*\{[^}]*bottom:\s*0/s);
  assert.doesNotMatch(html, /--bar-y:/);
});

test("SEMA Schedule Pylon is packaged beside Schedule Ticker", () => {
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/src/displays/bundled/sema-schedule-pylon-v1.html")));
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  assert.match(builder, /Schedule Pylon/);
  assert.match(builder, /schedule-pylon/);
  assert.match(builder, /sema-schedule-pylon/);
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  assert.match(hydration, /resolveDisplayIdentity/);
  assert.match(hydration, /sema-schedule-pylon/);
  const manifest = read("desktop/runtime-asset-manifest.json");
  assert.match(manifest, /sema-schedule-pylon-v1\.html/);
  const sources = read("desktop/src/lib/bundled-display-sources.ts");
  assert.match(sources, /sema-schedule-pylon-v1\.html/);
});
