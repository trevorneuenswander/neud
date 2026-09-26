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
import {
  hasAsarFile,
  listAsarFiles,
  readAsarFile,
} from "./lib/asar-inspection.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const releaseDir = getReleaseDir();

const STARTUP_DIAGNOSTICS_ASAR_PATH = "dist/services/startup-diagnostics.js";
const PACKAGED_CHROME_PROFILE_ASAR_PATH = "dist/lib/browser/packaged-chrome-profile.js";

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
  const asarFiles = listAsarFiles(asarPath);
  assert.ok(
    asarFiles.some((entry) => entry.includes("038_user_pinned_viewer_stacks.sql")),
    "app.asar must include SQL migrations",
  );
  assert.equal(
    hasAsarFile(asarPath, PACKAGED_CHROME_PROFILE_ASAR_PATH),
    true,
    "app.asar must ship synced packaged Chrome profile for Electron main",
  );
  assert.equal(
    hasAsarFile(asarPath, STARTUP_DIAGNOSTICS_ASAR_PATH),
    true,
    "app.asar must ship startup-diagnostics",
  );

  const startupDiagnostics = readAsarFile(asarPath, STARTUP_DIAGNOSTICS_ASAR_PATH);
  assert.ok(
    startupDiagnostics.length > 0,
    "startup-diagnostics.js must be readable from app.asar (not empty)",
  );
  assert.doesNotMatch(
    startupDiagnostics,
    /\.\.\/\.\.\/\.\.\/shared\//,
    "startup-diagnostics must not escape app.asar to repo shared/",
  );
  assert.match(startupDiagnostics, /\.\.\/lib\/browser\/packaged-chrome-profile\.js/);
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
      releaseDir,
    },
    null,
    2,
  ),
);
