#!/usr/bin/env node
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PACKAGED_CHROME_PROFILES,
  resolvePackagingProfile,
  resolvePackagedChromeExecutablePath,
} from "../../shared/browser/packaged-chrome-profile.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("packaged chrome profiles include win32-x64 and darwin-arm64", () => {
  assert.ok(PACKAGED_CHROME_PROFILES["win32-x64"]);
  assert.ok(PACKAGED_CHROME_PROFILES["darwin-arm64"]);
  assert.equal(PACKAGED_CHROME_PROFILES["win32-x64"].chromeBundleDirName, "chrome-win64");
  assert.equal(PACKAGED_CHROME_PROFILES["darwin-arm64"].chromeBundleDirName, "chrome-mac-arm64");
});

test("darwin arm64 Chrome executable path uses Google Chrome for Testing.app bundle", () => {
  const profile = resolvePackagingProfile({ platformKey: "darwin-arm64" });
  const executable = resolvePackagedChromeExecutablePath("/tmp/bundle", profile);
  assert.match(executable, /Google Chrome for Testing\.app[\\/]Contents[\\/]MacOS[\\/]Google Chrome for Testing$/);
});

test("Windows packaged browser profile remains chrome-win64/chrome.exe", () => {
  const profile = resolvePackagingProfile({ platformKey: "win32-x64" });
  const executable = resolvePackagedChromeExecutablePath("C:\\Resources\\chrome-win64", profile);
  assert.match(executable, /chrome-win64[\\/]chrome\.exe$/i);
});

test("app paths use Electron userData rather than hardcoded APPDATA", () => {
  const appPaths = read("desktop/src/services/app-paths.ts");
  assert.match(appPaths, /app\.getPath\("userData"\)/);
  assert.doesNotMatch(appPaths, /APPDATA/);
});

test("startup bootstrap fallback supports macOS Library/Application Support", () => {
  const fallback = read("desktop/src/platform/fallback-user-data.ts");
  assert.match(fallback, /"Library", "Application Support", "NEUD"/);
});

test("process manager uses taskkill only on win32", () => {
  const pm = read("desktop/src/services/process-manager.ts");
  assert.match(pm, /process\.platform === "win32"/);
  assert.match(pm, /taskkill/);
  assert.match(pm, /process\.kill\(-pid, "SIGKILL"\)/);
});

test("electron-builder configures mac dmg and zip arm64 artifacts", () => {
  const config = read("desktop/electron-builder.yml");
  assert.match(config, /artifactName: NEUD-\$\{version\}-arm64\.\$\{ext\}/);
  assert.match(config, /target: dmg/);
  assert.match(config, /target: zip/);
  assert.match(config, /arch:[\s\S]*- arm64/);
  assert.match(config, /icon: build\/icon\.icns/);
  assert.match(config, /entitlements: build\/entitlements\.mac\.plist/);
});

test("appId remains com.hildreths.neud across platforms", () => {
  const config = read("desktop/electron-builder.yml");
  assert.match(config, /^appId: com\.hildreths\.neud/m);
});

test("mac package scripts exist without altering package:win", () => {
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.match(desktopPkg.scripts["package:mac"], /electron-builder --mac/);
  assert.match(desktopPkg.scripts["package:mac"], /ensure-macos-icon\.mjs/);
  assert.match(desktopPkg.scripts["package:mac"], /prepare-release-artifacts-mac\.mjs/);
  assert.doesNotMatch(desktopPkg.scripts["package:win"], /package:mac/);
});

test("browser staging writes platform-aware browser-manifest.json", () => {
  const stage = read("desktop/scripts/stage-packaged-browser.mjs");
  assert.match(stage, /platformKey/);
  assert.match(stage, /packaged-chrome-profile/);
});

test("resolve puppeteer browser uses shared packaged chrome profile", () => {
  const resolver = read("workers/data-engine/src/browser/resolve-puppeteer-browser.js");
  assert.match(resolver, /packaged-chrome-profile/);
  assert.match(resolver, /resolvePackagingProfile/);
});

test("signing secrets are not hardcoded in electron-builder config", () => {
  const config = read("desktop/electron-builder.yml");
  assert.doesNotMatch(config, /APPLE_APP_SPECIFIC_PASSWORD:/);
  assert.doesNotMatch(config, /APPLE_ID:/);
});

test("macOS entitlements include JIT and network client permissions", () => {
  const entitlements = read("desktop/build/entitlements.mac.plist");
  assert.match(entitlements, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(entitlements, /com\.apple\.security\.network\.client/);
});

test("GitHub Actions macOS workflow is defined", () => {
  const workflow = read(".github/workflows/build-macos.yml");
  assert.match(workflow, /runs-on: macos-14/);
  assert.match(workflow, /build:desktop/);
  assert.match(workflow, /package:mac -w @neud\/desktop/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY/);
});

test("application menu uses native macOS app menu roles", () => {
  const menu = read("desktop/src/menu/application-menu.ts");
  assert.match(menu, /process\.platform === "darwin"/);
  assert.match(menu, /role: "about"/);
  assert.match(menu, /role: "hide"/);
});

test("auto-update verify supports latest-mac.yml", () => {
  const verify = read("desktop/scripts/verify-packaged-auto-update-config.mjs");
  assert.match(verify, /latest-mac\.yml/);
  assert.match(verify, /require-latest-mac-yml/);
});
