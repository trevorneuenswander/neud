#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  PACKAGED_CHROME_PROFILES,
  getPrimaryPackagedBrowserPath,
  readPackagedBrowserManifest,
  resolvePackagedBrowserExecutable,
  resolvePackagingProfile,
  resolvePackagingProfileForPackagedRuntime,
  resolveRuntimePlatformKey,
} from "../../shared/browser/packaged-chrome-profile.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function withPlatform(platform, fn) {
  const original = process.platform;
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, "platform", { configurable: true, value: original });
  }
}

test("win32/x64 resolves chrome-win64/chrome.exe", () => {
  const profile = resolvePackagingProfile({ os: "win32", arch: "x64" });
  assert.equal(profile.platformKey, "win32-x64");
  const executable = getPrimaryPackagedBrowserPath("C:\\Resources", profile);
  assert.match(executable, /chrome-win64[\\/]chrome\.exe$/i);
});

test("darwin/arm64 resolves Chrome for Testing .app executable", () => {
  const profile = resolvePackagingProfile({ os: "darwin", arch: "arm64" });
  assert.equal(profile.platformKey, "darwin-arm64");
  const executable = getPrimaryPackagedBrowserPath("/Resources", profile);
  assert.match(
    executable,
    /chrome-mac-arm64[\\/]Google Chrome for Testing\.app[\\/]Contents[\\/]MacOS[\\/]Google Chrome for Testing$/,
  );
});

test("darwin does not fall back to Windows profile", () => {
  withPlatform("darwin", () => {
    const profile = resolvePackagingProfile({ arch: "arm64" });
    assert.equal(profile.platformKey, "darwin-arm64");
    assert.notEqual(profile.chromeBundleDirName, "chrome-win64");
  });
});

test("unsupported linux platform throws", () => {
  assert.throws(
    () => resolvePackagingProfile({ os: "linux", arch: "x64" }),
    /Unsupported NEUD packaged browser platform/,
  );
});

test("packaged manifest platform must match runtime platform", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-browser-manifest-"));
  const bundleRoot = path.join(tempRoot, "puppeteer", "chrome", "chrome-mac-arm64");
  fs.mkdirSync(bundleRoot, { recursive: true });
  fs.writeFileSync(
    path.join(bundleRoot, "browser-manifest.json"),
    `${JSON.stringify({ platformKey: "win32-x64", expectedBuildId: "141.0.7390.54" })}\n`,
  );

  assert.throws(
    () => resolvePackagingProfileForPackagedRuntime(tempRoot, { os: "darwin", arch: "arm64" }),
    /Packaged browser platform mismatch: runtime darwin-arm64, manifest win32-x64/,
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("packaged runtime prefers manifest darwin-arm64 profile", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-browser-manifest-"));
  const bundleRoot = path.join(tempRoot, "puppeteer", "chrome", "chrome-mac-arm64");
  fs.mkdirSync(bundleRoot, { recursive: true });
  fs.writeFileSync(
    path.join(bundleRoot, "browser-manifest.json"),
    `${JSON.stringify({
      platformKey: "darwin-arm64",
      expectedBuildId: "141.0.7390.54",
      chromeBundleDirName: "chrome-mac-arm64",
    })}\n`,
  );

  const profile = resolvePackagingProfileForPackagedRuntime(tempRoot, {
    os: "darwin",
    arch: "arm64",
  });
  assert.equal(profile.platformKey, "darwin-arm64");
  assert.equal(readPackagedBrowserManifest(tempRoot)?.platformKey, "darwin-arm64");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("resolveRuntimePlatformKey maps darwin x64 Node to darwin-arm64 package", () => {
  assert.equal(resolveRuntimePlatformKey("darwin", "x64"), "darwin-arm64");
});

test("staged mac manifest in repo declares darwin-arm64 when present", () => {
  const manifestPath = path.join(
    repoRoot,
    "desktop",
    "staging",
    "puppeteer",
    "chrome",
    "chrome-mac-arm64",
    "browser-manifest.json",
  );
  if (!fs.existsSync(manifestPath)) {
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.platformKey, "darwin-arm64");
});

test("worker dist-local profile includes darwin-arm64 after sync", () => {
  const workerProfilePath = path.join(
    repoRoot,
    "workers",
    "data-engine",
    "src",
    "browser",
    "packaged-chrome-profile.js",
  );
  const source = fs.readFileSync(workerProfilePath, "utf8");
  assert.match(source, /darwin-arm64/);
  assert.match(source, /resolvePackagingProfileForPackagedRuntime/);
  assert.equal(
    Boolean(PACKAGED_CHROME_PROFILES["darwin-arm64"]),
    true,
    "shared profile must expose darwin-arm64",
  );
});

test("process.resourcesPath style root resolves mac bundle path shape", () => {
  const profile = resolvePackagingProfile({ platformKey: "darwin-arm64" });
  const resourcesPath = "/Applications/NEUD.app/Contents/Resources";
  const executable = resolvePackagedBrowserExecutable(resourcesPath, profile);
  assert.equal(executable, null);
  const expected = getPrimaryPackagedBrowserPath(resourcesPath, profile);
  assert.match(
    expected.replace(/\\/g, "/"),
    /\/Applications\/NEUD\.app\/Contents\/Resources\/puppeteer\/chrome\/chrome-mac-arm64\//,
  );
});
