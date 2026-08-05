#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const manifestPath = path.join(desktopRoot, "runtime-asset-manifest.json");

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function resolveUnpackedRoot() {
  const fromEnv = process.env.NEUD_UNPACKED_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return findReleaseRoots(desktopRoot)[0] ?? null;
}

const unpackedRoot = resolveUnpackedRoot();
assert.ok(
  unpackedRoot,
  "Build win-unpacked with electron-builder --win dir first, or set NEUD_UNPACKED_ROOT.",
);

const resourcesRoot = path.join(unpackedRoot, "resources");
const runtimeAssetsRoot = path.join(resourcesRoot, "runtime-assets");
const manifest = readManifest();
const missing = [];

for (const asset of manifest.extraResources ?? []) {
  if (asset.required === false) {
    continue;
  }

  const packagedPath = path.join(runtimeAssetsRoot, asset.packagedRelativePath);
  if (!fs.existsSync(packagedPath)) {
    missing.push({
      id: asset.id,
      expected: packagedPath,
    });
    continue;
  }

  const contents = fs.readFileSync(packagedPath, "utf8");
  assert.ok(
    contents.trim().length > 0,
    `Runtime asset ${asset.id} is empty at ${packagedPath}`,
  );
}

assert.deepEqual(
  missing,
  [],
  `Missing runtime-assets in win-unpacked before NSIS packaging:\n${missing
    .map((entry) => `  - ${entry.id}: ${entry.expected}`)
    .join("\n")}`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      unpackedRoot,
      runtimeAssetsRoot,
      verifiedAssets: (manifest.extraResources ?? [])
        .filter((asset) => asset.required !== false)
        .map((asset) => asset.id),
    },
    null,
    2,
  ),
);
