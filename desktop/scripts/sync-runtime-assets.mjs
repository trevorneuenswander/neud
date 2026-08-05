#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const manifestPath = path.join(desktopRoot, "runtime-asset-manifest.json");
const stagingRoot = path.join(desktopRoot, "staging", "runtime-assets");

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    console.error(`Missing runtime asset manifest: ${manifestPath}`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function syncExtraResourceAsset(asset) {
  const source = path.join(repoRoot, asset.source);
  const target = path.join(stagingRoot, asset.packagedRelativePath);

  if (!fs.existsSync(source)) {
    console.error(`Missing runtime asset source for ${asset.id}: ${source}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);

  const size = fs.statSync(target).size;
  if (size === 0) {
    console.error(`Runtime asset is empty after sync (${asset.id}): ${target}`);
    process.exit(1);
  }

  console.log(`Synced runtime asset ${asset.id} -> ${target}`);
}

function main() {
  const manifest = loadManifest();
  const assets = Array.isArray(manifest.extraResources) ? manifest.extraResources : [];

  fs.mkdirSync(stagingRoot, { recursive: true });

  for (const asset of assets) {
    if (asset.required === false) {
      continue;
    }
    syncExtraResourceAsset(asset);
  }

  console.log(`Runtime assets staged at ${stagingRoot}`);
}

main();
