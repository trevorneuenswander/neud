#!/usr/bin/env node
/**
 * Ensures packaged Electron main-process modules resolve inside app.asar (no repo shared/ escape).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  findMacAppBundleRoot,
  getMacResourcesDir,
  getReleaseDir,
} from "./lib/packaged-platform-paths.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

const PACKAGED_CHROME_PROFILE_ASAR_PATH = "dist/lib/browser/packaged-chrome-profile.js";
const STARTUP_DIAGNOSTICS_ASAR_PATH = "dist/services/startup-diagnostics.js";

function listAsar(asarPath) {
  return execSync(`npx --yes @electron/asar list "${asarPath}"`, {
    encoding: "utf8",
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function readAsarFile(asarPath, entryPath) {
  return execSync(`npx --yes @electron/asar extract-file "${asarPath}" "${entryPath}"`, {
    encoding: "utf8",
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function verifyDistMainProcessSources() {
  const startupDiagnostics = fs.readFileSync(
    path.join(desktopRoot, "dist", "services", "startup-diagnostics.js"),
    "utf8",
  );
  const installedBrowser = fs.readFileSync(
    path.join(desktopRoot, "dist", "services", "installed-browser-diagnostic-service.js"),
    "utf8",
  );

  for (const [label, source] of [
    ["startup-diagnostics", startupDiagnostics],
    ["installed-browser-diagnostic-service", installedBrowser],
  ]) {
    assert.doesNotMatch(
      source,
      /\.\.\/\.\.\/\.\.\/shared\//,
      `${label} must not require repo shared/ at runtime`,
    );
    assert.match(
      source,
      /packaged-chrome-profile\.js/,
      `${label} must require packaged Chrome profile module`,
    );
  }

  const profilePath = path.join(desktopRoot, "dist", "lib", "browser", "packaged-chrome-profile.js");
  assert.equal(fs.existsSync(profilePath), true, `Missing ${profilePath} in desktop dist`);
}

function verifyMacPackagedAsar() {
  const appBundle = findMacAppBundleRoot();
  if (!appBundle) {
    console.log(
      JSON.stringify({
        ok: true,
        skipped: "mac_app_bundle",
        message: "No NEUD.app in desktop/release; skipped packaged asar checks.",
      }),
    );
    return;
  }

  const resourcesRoot = getMacResourcesDir(appBundle);
  const asarPath = path.join(resourcesRoot, "app.asar");
  assert.equal(fs.existsSync(asarPath), true, `Missing app.asar at ${asarPath}`);

  const listing = listAsar(asarPath);
  assert.match(
    listing,
    new RegExp(PACKAGED_CHROME_PROFILE_ASAR_PATH.replace(/\./g, "\\.")),
    "app.asar must contain packaged Chrome profile module",
  );
  assert.match(
    listing,
    new RegExp(STARTUP_DIAGNOSTICS_ASAR_PATH.replace(/\./g, "\\.")),
    "app.asar must contain startup-diagnostics",
  );

  const startupSource = readAsarFile(asarPath, STARTUP_DIAGNOSTICS_ASAR_PATH);
  assert.doesNotMatch(startupSource, /\.\.\/\.\.\/\.\.\/shared\//);
  assert.match(startupSource, /\.\.\/lib\/browser\/packaged-chrome-profile\.js/);

  const profileSource = readAsarFile(asarPath, PACKAGED_CHROME_PROFILE_ASAR_PATH);
  assert.match(profileSource, /resolvePackagingProfileForPackagedRuntime/);
  assert.match(profileSource, /darwin-arm64/);
  assert.match(profileSource, /win32-x64/);
}

function main() {
  verifyDistMainProcessSources();
  verifyMacPackagedAsar();

  console.log(
    JSON.stringify(
      {
        ok: true,
        releaseDir: getReleaseDir(),
        packagedChromeProfile: PACKAGED_CHROME_PROFILE_ASAR_PATH,
      },
      null,
      2,
    ),
  );
}

main();
