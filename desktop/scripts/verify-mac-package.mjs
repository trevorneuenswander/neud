#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  resolvePackagedBrowserExecutable,
  resolvePackagingProfile,
} from "../../shared/browser/packaged-chrome-profile.js";
import {
  findMacAppBundleRoot,
  getMacResourcesDir,
  getReleaseDir,
} from "./lib/packaged-platform-paths.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const releaseDir = getReleaseDir();

const appBundle = findMacAppBundleRoot();
assert.ok(appBundle, "Missing NEUD.app under desktop/release. Run package:mac first.");

const macExecutable = path.join(appBundle, "Contents", "MacOS", "NEUD");
assert.equal(fs.existsSync(macExecutable), true, `Missing macOS executable: ${macExecutable}`);

const resourcesRoot = getMacResourcesDir(appBundle);
assert.ok(resourcesRoot, "Missing Contents/Resources in NEUD.app");

const profile = resolvePackagingProfile({ platformKey: "darwin-arm64" });
const chromeExe = resolvePackagedBrowserExecutable(resourcesRoot, profile);
assert.ok(chromeExe, "Bundled macOS Chrome for Testing is missing from NEUD.app resources");

const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = rootPkg.version;
const plistPath = path.join(appBundle, "Contents", "Info.plist");
assert.equal(fs.existsSync(plistPath), true, "Missing Info.plist");

const plist = execSync(`plutil -convert json -o - "${plistPath}"`, { encoding: "utf8" });
const info = JSON.parse(plist);
assert.match(String(info.CFBundleShortVersionString ?? ""), new RegExp(`^${version.replace(/\./g, "\\.")}`));

const appUpdatePath = path.join(resourcesRoot, "app-update.yml");
assert.equal(fs.existsSync(appUpdatePath), true, "Missing app-update.yml in macOS Resources");

const asarPath = path.join(resourcesRoot, "app.asar");
if (fs.existsSync(asarPath)) {
  const asarListing = execSync(`npx --yes @electron/asar list "${asarPath}"`, {
    encoding: "utf8",
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
  assert.match(asarListing, /038_user_pinned_viewer_stacks\.sql/);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      appBundle,
      macExecutable,
      version,
      chromeExe,
      appUpdatePath,
      bundleIdentifier: info.CFBundleIdentifier ?? null,
    },
    null,
    2,
  ),
);
