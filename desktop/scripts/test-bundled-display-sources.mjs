#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

test("bundled display helper resolves packaged path through app.getAppPath", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "lib", "bundled-display-sources.ts"),
    "utf8",
  );
  assert.match(source, /app\.getAppPath\(\)/);
  assert.match(source, /dist", "displays", "bundled"/);
  assert.match(source, /BUNDLED_DISPLAY_HTML_FILES/);
  assert.doesNotMatch(source, /process\.cwd\(\)/);
});

test("stream display import service uses centralized bundled display reader", () => {
  const source = fs.readFileSync(
    path.join(
      desktopRoot,
      "src",
      "services",
      "broad-arrow-stream-displays-import-service.ts",
    ),
    "utf8",
  );
  assert.match(source, /readBundledDisplaySourceFromReference/);
  assert.doesNotMatch(source, /readBundledHtml/);
  assert.doesNotMatch(source, /this\.repoRoot, relativePath/);
});

test("legacy and uploaded display import services use centralized bundled display reader", () => {
  for (const file of [
    "broad-arrow-legacy-displays-import-service.ts",
    "broad-arrow-uploaded-displays-import-service.ts",
  ]) {
    const source = fs.readFileSync(path.join(desktopRoot, "src", "services", file), "utf8");
    assert.match(source, /readBundledDisplaySourceFromReference/);
    assert.doesNotMatch(source, /readBundledV1Html/);
  }
});

test("manifest lists all bundled display HTML files", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(desktopRoot, "runtime-asset-manifest.json"), "utf8"),
  );
  const bundled = (manifest.asar ?? []).find((entry) => entry.id === "displays.bundled-html");
  assert.ok(bundled);
  assert.deepEqual(bundled.files, [
    "stream-bid-display-v1.html",
    "stream-ticker-v1.html",
    "led-display-quail-v1.html",
    "legacy-pylon-v1.html",
    "auction-ticker-overlay-v1.html",
    "auction-pylon-display-v1.html",
    "auction-ticker-legacy-live-v1-2026-07-26-132400.html",
  ]);
});

test("canonical bundled display HTML sources exist", () => {
  const bundledDir = path.join(desktopRoot, "src", "displays", "bundled");
  for (const fileName of fs.readdirSync(bundledDir)) {
    if (!fileName.endsWith(".html")) continue;
    const contents = fs.readFileSync(path.join(bundledDir, fileName), "utf8");
    assert.ok(contents.trim().length > 0, `${fileName} must not be empty`);
  }
});

test("dist bundled display copies exist after desktop build when dist is present", () => {
  const distDir = path.join(desktopRoot, "dist", "displays", "bundled");
  if (!fs.existsSync(distDir)) {
    return;
  }

  for (const fileName of [
    "stream-bid-display-v1.html",
    "stream-ticker-v1.html",
  ]) {
    const distPath = path.join(distDir, fileName);
    assert.equal(fs.existsSync(distPath), true, `Missing ${distPath}`);
  }
});
