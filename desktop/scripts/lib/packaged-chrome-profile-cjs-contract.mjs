import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function assertCommonJsPackagedChromeProfileModule(module) {
  assert.equal(typeof module.resolvePackagingProfileForPackagedRuntime, "function");
  assert.equal(typeof module.resolvePackagingProfile, "function");
  assert.equal(typeof module.PACKAGED_CHROME_PROFILES, "object");

  const darwin = module.PACKAGED_CHROME_PROFILES["darwin-arm64"];
  const win32 = module.PACKAGED_CHROME_PROFILES["win32-x64"];
  assert.ok(darwin, "darwin-arm64 profile must exist");
  assert.ok(win32, "win32-x64 profile must exist");
  assert.match(String(darwin.executableRelativePath), /Google Chrome for Testing/i);
  assert.equal(win32.chromeBundleDirName, "chrome-win64");
  assert.equal(win32.executableRelativePath, "chrome.exe");
}

export function requireCommonJsPackagedChromeProfileAt(absolutePath) {
  const resolved = path.resolve(absolutePath);
  const module = require(resolved);
  assertCommonJsPackagedChromeProfileModule(module);
  return module;
}

export function readDesktopDistPackagedChromeProfilePath(desktopRoot) {
  return path.join(desktopRoot, "dist", "lib", "browser", "packaged-chrome-profile.js");
}

export function repoRootsFromImportMeta(importMetaUrl) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..", "..");
  return { repoRoot, desktopRoot: path.join(repoRoot, "desktop") };
}
