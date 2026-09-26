#!/usr/bin/env node
/**
 * Ensures packaged Electron main-process modules resolve inside app.asar (no repo shared/ escape).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findMacAppBundleRoot,
  getMacResourcesDir,
  getReleaseDir,
} from "./lib/packaged-platform-paths.mjs";
import { hasAsarFile, readAsarFile, requireCommonJsModuleFromAsar } from "./lib/asar-inspection.mjs";
import {
  assertCommonJsPackagedChromeProfileModule,
  readDesktopDistPackagedChromeProfilePath,
  requireCommonJsPackagedChromeProfileAt,
} from "./lib/packaged-chrome-profile-cjs-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

const PACKAGED_CHROME_PROFILE_ASAR_PATH = "dist/lib/browser/packaged-chrome-profile.js";
const STARTUP_DIAGNOSTICS_ASAR_PATH = "dist/services/startup-diagnostics.js";

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

  const profilePath = readDesktopDistPackagedChromeProfilePath(desktopRoot);
  assert.equal(fs.existsSync(profilePath), true, `Missing ${profilePath} in desktop dist`);

  const profileSource = fs.readFileSync(profilePath, "utf8");
  assert.doesNotMatch(
    profileSource,
    /^\s*import\s/m,
    "desktop dist Chrome profile must not use top-level ESM import syntax",
  );
  assert.doesNotMatch(
    profileSource,
    /^\s*export\s/m,
    "desktop dist Chrome profile must not use top-level ESM export syntax",
  );

  requireCommonJsPackagedChromeProfileAt(profilePath);

  const distStartup = path.join(desktopRoot, "dist", "services", "startup-diagnostics.js");
  const resolvedFromStartup = path.resolve(
    path.dirname(distStartup),
    "../lib/browser/packaged-chrome-profile.js",
  );
  assert.equal(resolvedFromStartup, profilePath);
  requireCommonJsPackagedChromeProfileAt(resolvedFromStartup);
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

  assert.equal(
    hasAsarFile(asarPath, PACKAGED_CHROME_PROFILE_ASAR_PATH),
    true,
    "app.asar must contain packaged Chrome profile module",
  );
  assert.equal(
    hasAsarFile(asarPath, STARTUP_DIAGNOSTICS_ASAR_PATH),
    true,
    "app.asar must contain startup-diagnostics",
  );

  const startupSource = readAsarFile(asarPath, STARTUP_DIAGNOSTICS_ASAR_PATH);
  assert.ok(startupSource.length > 0, "startup-diagnostics must be readable from app.asar");
  assert.doesNotMatch(startupSource, /\.\.\/\.\.\/\.\.\/shared\//);
  assert.match(startupSource, /\.\.\/lib\/browser\/packaged-chrome-profile\.js/);

  const profileSource = readAsarFile(asarPath, PACKAGED_CHROME_PROFILE_ASAR_PATH);
  assert.doesNotMatch(profileSource, /^\s*import\s/m);
  assert.doesNotMatch(profileSource, /^\s*export\s/m);
  assert.match(profileSource, /resolvePackagingProfileForPackagedRuntime/);
  assert.match(profileSource, /darwin-arm64/);
  assert.match(profileSource, /win32-x64/);

  const asarModule = requireCommonJsModuleFromAsar(asarPath, PACKAGED_CHROME_PROFILE_ASAR_PATH);
  assertCommonJsPackagedChromeProfileModule(asarModule);
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
        commonJsLoadVerified: true,
      },
      null,
      2,
    ),
  );
}

main();
