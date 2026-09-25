#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReleaseDir } from "./lib/packaged-platform-paths.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const releaseDir = getReleaseDir();

const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = rootPkg.version;

const zipName = `NEUD-${version}-arm64-mac.zip`;
const dmgName = `NEUD-${version}-arm64.dmg`;
const latestMacYml = "latest-mac.yml";

function requireFile(name) {
  const fullPath = path.join(releaseDir, name);
  assert.equal(fs.existsSync(fullPath), true, `Missing release artifact: ${name}`);
  return fullPath;
}

assert.equal(fs.existsSync(releaseDir), true, "desktop/release/ does not exist. Run package:mac first.");

const zipPath = requireFile(zipName);
requireFile(dmgName);
const latestMacPath = requireFile(latestMacYml);

const latestRaw = fs.readFileSync(latestMacPath, "utf8");
assert.match(latestRaw, new RegExp(`^version:\\s*${version.replace(/\./g, "\\.")}\\s*$`, "m"));
assert.match(latestRaw, new RegExp(`^path:\\s*${zipName.replace(/\./g, "\\.")}\\s*$`, "m"));

console.log(
  JSON.stringify(
    {
      ok: true,
      version,
      releaseDir,
      artifacts: {
        zip: zipName,
        dmg: dmgName,
        latestMacYml,
      },
      zipBytes: fs.statSync(zipPath).size,
    },
    null,
    2,
  ),
);
