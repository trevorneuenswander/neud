#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findMacAppBundleRoot, getMacResourcesDir } from "./lib/packaged-platform-paths.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(desktopRoot, "runtime-asset-manifest.json");

const appBundle = findMacAppBundleRoot();
assert.ok(appBundle, "Missing NEUD.app. Run electron-builder --mac dir first.");

const resourcesRoot = getMacResourcesDir(appBundle);
assert.ok(resourcesRoot, "Missing Contents/Resources");

const runtimeAssetsRoot = path.join(resourcesRoot, "runtime-assets");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const missing = [];

for (const asset of manifest.extraResources ?? []) {
  if (asset.required === false) continue;
  const packagedPath = path.join(runtimeAssetsRoot, asset.packagedRelativePath);
  if (!fs.existsSync(packagedPath)) {
    missing.push(packagedPath);
  }
}

assert.equal(missing.length, 0, `Missing runtime assets:\n${missing.join("\n")}`);

console.log(
  JSON.stringify(
    {
      ok: true,
      appBundle,
      runtimeAssetsRoot,
      verifiedAssets: (manifest.extraResources ?? [])
        .filter((asset) => asset.required !== false)
        .map((asset) => asset.id),
    },
    null,
    2,
  ),
);
