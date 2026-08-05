#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const manifestPath = path.join(desktopRoot, "runtime-asset-manifest.json");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("runtime asset manifest lists required display browser scripts", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const ids = (manifest.extraResources ?? []).map((entry) => entry.id);
  assert.deepEqual(ids, [
    "display.normalize-display-snapshot",
    "display.display-runtime-publisher",
    "display.hosted-bridge-inbound",
  ]);
});

test("templates.ts uses centralized runtime asset loader", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "developer-tools", "templates.ts"),
    "utf8",
  );
  assert.match(source, /from "\.\.\/lib\/runtime-assets"/);
  assert.match(source, /readSharedRuntimeBrowserScript\(/);
  assert.doesNotMatch(source, /shared\/display-runtime\/browser/);
});

test("runtime-assets resolver rejects path traversal", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "lib", "runtime-assets.ts"),
    "utf8",
  );
  assert.match(source, /includes\("\.\."\)/);
  assert.match(source, /SHARED_RUNTIME_BROWSER_SCRIPT_NAMES/);
  assert.match(source, /process\.resourcesPath/);
});

test("development shared runtime browser scripts exist at canonical sources", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const asset of manifest.extraResources ?? []) {
    const source = path.join(repoRoot, asset.source);
    assert.equal(fs.existsSync(source), true, `Missing source ${source}`);
    assert.ok(fs.readFileSync(source, "utf8").trim().length > 0);
  }
});

test("normalize-display-snapshot source contains expected runtime exports", () => {
  const source = readSource("shared/display-runtime/browser/normalize-display-snapshot.js");
  assert.match(source, /normalizeDisplaySnapshot|DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION/);
});

test("stage-standalone re-syncs runtime-assets after staging wipe", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "scripts", "stage-standalone.mjs"),
    "utf8",
  );
  assert.match(source, /sync-runtime-assets\.mjs/);
});

test("sync-runtime-assets copies manifest assets into staging", () => {
  const stagingRoot = path.join(desktopRoot, "staging", "runtime-assets");
  if (!fs.existsSync(stagingRoot)) {
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const asset of manifest.extraResources ?? []) {
    if (asset.required === false) {
      continue;
    }
    const stagedPath = path.join(stagingRoot, asset.packagedRelativePath);
    assert.equal(fs.existsSync(stagedPath), true, `Missing staged asset ${asset.id}`);
    assert.ok(fs.readFileSync(stagedPath, "utf8").trim().length > 0);
  }
});

test("verify-win-unpacked-runtime-assets checks manifest files before NSIS", () => {
  const verifyScript = fs.readFileSync(
    path.join(desktopRoot, "scripts", "verify-win-unpacked-runtime-assets.mjs"),
    "utf8",
  );
  assert.match(verifyScript, /runtime-asset-manifest\.json/);
  assert.match(verifyScript, /runtime-assets/);
  assert.match(verifyScript, /packagedRelativePath/);

  const packageJson = fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8");
  assert.match(
    packageJson,
    /electron-builder --win dir[\s\S]*verify-win-unpacked-runtime-assets\.mjs[\s\S]*electron-builder --win nsis --prepackaged/,
  );
});

test("electron-builder stages runtime-assets through extraResources", () => {
  const config = fs.readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");
  assert.match(config, /staging\/runtime-assets/);
  assert.match(config, /to: runtime-assets/);
});
