#!/usr/bin/env node
/**
 * Post-package step: verify release artifacts and create stable download alias.
 *
 * Produces NEUD-Setup-latest-x64.exe alongside the versioned installer for
 * GitHub /releases/latest/download/ links used by the Vercel portal.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const desktopRoot = path.join(repoRoot, "desktop");
const releaseDir = path.join(desktopRoot, "release");

const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = rootPkg.version;

const versionedInstaller = `NEUD-Setup-${version}-x64.exe`;
const versionedBlockmap = `${versionedInstaller}.blockmap`;
const stableInstaller = "NEUD-Setup-latest-x64.exe";
const latestYmlName = "latest.yml";

function requireFile(name) {
  const fullPath = path.join(releaseDir, name);
  assert.equal(fs.existsSync(fullPath), true, `Missing release artifact: ${name}`);
  return fullPath;
}

assert.equal(fs.existsSync(releaseDir), true, "desktop/release/ does not exist. Run package:win first.");

const installerPath = requireFile(versionedInstaller);
requireFile(versionedBlockmap);
const latestYmlPath = requireFile(latestYmlName);

const latestYml = fs.readFileSync(latestYmlPath, "utf8");
assert.match(latestYml, new RegExp(`^version:\\s*${version.replace(/\./g, "\\.")}\\s*$`, "m"));
assert.match(latestYml, new RegExp(`^path:\\s*${versionedInstaller}\\s*$`, "m"));
assert.match(
  latestYml,
  new RegExp(`url:\\s*${versionedInstaller}`, "m"),
  "latest.yml files[].url must reference the versioned installer",
);

const stablePath = path.join(releaseDir, stableInstaller);
fs.copyFileSync(installerPath, stablePath);

const installerBytes = fs.statSync(installerPath).size;
const stableBytes = fs.statSync(stablePath).size;
assert.equal(installerBytes, stableBytes, "Stable installer copy size mismatch");

console.log(
  JSON.stringify(
    {
      ok: true,
      version,
      releaseDir,
      artifacts: {
        versionedInstaller,
        versionedBlockmap,
        stableInstaller,
        latestYml: latestYmlName,
      },
      installerBytes,
    },
    null,
    2,
  ),
);
