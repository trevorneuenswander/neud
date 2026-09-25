#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAppUpdateYamlPath,
  readPackagedUpdatePublishConfig,
  getReleaseDir,
} from "./lib/electron-builder-publish-config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const releaseDir = getReleaseDir();

const args = new Set(process.argv.slice(2));
const requireLatestYml = args.has("--require-latest-yml");
const requireLatestMacYml = args.has("--require-latest-mac-yml");
const platform = args.has("--mac") ? "mac" : "win";

const FORBIDDEN_PATTERNS = [
  /token/i,
  /ghp_[A-Za-z0-9]+/,
  /SUPABASE_SERVICE_ROLE/i,
  /service.?role/i,
  /password:/i,
];

function parseSimpleYamlMapping(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+):\s*(.+?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2];
  }
  return values;
}

function assertNoSecrets(label, raw) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.doesNotMatch(raw, pattern, `${label} must not embed credentials`);
  }
}

const expected = readPackagedUpdatePublishConfig();
const appUpdatePath = getAppUpdateYamlPath(platform);

assert.equal(
  fs.existsSync(appUpdatePath),
  true,
  `Missing ${appUpdatePath}. Run ensure-packaged-app-update-config after packaging.`,
);

const appUpdateRaw = fs.readFileSync(appUpdatePath, "utf8");
assertNoSecrets("app-update.yml", appUpdateRaw);

const appUpdate = parseSimpleYamlMapping(appUpdateRaw);
assert.equal(appUpdate.provider, expected.provider);
assert.equal(appUpdate.owner, expected.owner);
assert.equal(appUpdate.repo, expected.repo);
assert.equal(typeof appUpdate.updaterCacheDirName, "string");
assert.ok(appUpdate.updaterCacheDirName.length > 0);

const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = rootPkg.version;

if (requireLatestYml) {
  const versionedInstaller = `NEUD-Setup-${version}-x64.exe`;
  const latestYmlPath = path.join(releaseDir, "latest.yml");
  assert.equal(fs.existsSync(latestYmlPath), true, "Missing desktop/release/latest.yml");
  const latestRaw = fs.readFileSync(latestYmlPath, "utf8");
  assertNoSecrets("latest.yml", latestRaw);
  assert.match(latestRaw, new RegExp(`^version:\\s*${version.replace(/\./g, "\\.")}\\s*$`, "m"));
  assert.match(latestRaw, new RegExp(`^path:\\s*${versionedInstaller}\\s*$`, "m"));

  const installerPath = path.join(releaseDir, versionedInstaller);
  assert.equal(
    fs.existsSync(installerPath),
    true,
    `latest.yml references ${versionedInstaller}, but the installer file is missing`,
  );

  const blockmapPath = `${installerPath}.blockmap`;
  assert.equal(fs.existsSync(blockmapPath), true, `Missing blockmap for ${versionedInstaller}`);
}

if (requireLatestMacYml) {
  const zipName = `NEUD-${version}-arm64.zip`;
  const latestMacPath = path.join(releaseDir, "latest-mac.yml");
  assert.equal(fs.existsSync(latestMacPath), true, "Missing desktop/release/latest-mac.yml");
  const latestRaw = fs.readFileSync(latestMacPath, "utf8");
  assertNoSecrets("latest-mac.yml", latestRaw);
  assert.match(latestRaw, new RegExp(`^version:\\s*${version.replace(/\./g, "\\.")}\\s*$`, "m"));
  assert.match(latestRaw, new RegExp(`^path:\\s*${zipName.replace(/\./g, "\\.")}\\s*$`, "m"));
  assert.equal(fs.existsSync(path.join(releaseDir, zipName)), true, `Missing ${zipName}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      platform,
      appUpdatePath,
      provider: appUpdate.provider,
      owner: appUpdate.owner,
      repo: appUpdate.repo,
      updaterCacheDirName: appUpdate.updaterCacheDirName,
      latestYmlChecked: requireLatestYml,
      latestMacYmlChecked: requireLatestMacYml,
      packageVersion: version,
    },
    null,
    2,
  ),
);
