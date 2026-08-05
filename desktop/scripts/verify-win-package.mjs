#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findReleaseRoots, scanDirectory } from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function findInstaller(releaseDir) {
  if (!fs.existsSync(releaseDir)) {
    return null;
  }

  return fs
    .readdirSync(releaseDir)
    .filter((name) => /^NEUD-Setup-.*-x64\.exe$/i.test(name))
    .map((name) => path.join(releaseDir, name))[0] ?? null;
}

const releaseDir = path.join(desktopRoot, "release");
const unpackedRoots = findReleaseRoots(desktopRoot);
assert.ok(unpackedRoots.length > 0, "Missing win-unpacked output under desktop/release");

const unpackedRoot = unpackedRoots[0];
const resourcesRoot = path.join(unpackedRoot, "resources");

assert.equal(fs.existsSync(path.join(unpackedRoot, "NEUD.exe")), true);
assert.equal(fs.existsSync(resourcesRoot), true);

const latestYml = fs
  .readdirSync(releaseDir)
  .find((name) => name.toLowerCase() === "latest.yml");
if (latestYml) {
  const contents = fs.readFileSync(path.join(releaseDir, latestYml), "utf8");
  assert.match(contents, /^version:/m);
  assert.match(contents, /^path:/m);
}

const forbiddenPatterns = [
  /\.env\.local$/i,
  /service-role/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
];

for (const root of [resourcesRoot, unpackedRoot]) {
  const findings = scanDirectory(root);
  assert.deepEqual(findings, [], `Secret scan findings under ${root}: ${JSON.stringify(findings.slice(0, 3))}`);
}

const installer = findInstaller(releaseDir);
const unpackedBytes = walkFiles(unpackedRoot).reduce((total, fullPath) => {
  try {
    return total + fs.statSync(fullPath).size;
  } catch {
    return total;
  }
}, 0);

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      unpackedRoot,
      installer: installer ?? null,
      installerBytes: installer ? fs.statSync(installer).size : null,
      unpackedBytes,
      latestYml: latestYml ?? null,
    },
    null,
    2,
  ),
);
