import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePackagedBrowserExecutable,
  resolvePackagingProfile,
} from "../../shared/browser/packaged-chrome-profile.js";
import {
  getWinUnpackedResourcesDir,
  findMacAppBundleRoot,
  getMacResourcesDir,
} from "./lib/packaged-platform-paths.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveResourcesRoot() {
  const macResources = getMacResourcesDir(findMacAppBundleRoot());
  if (macResources && fs.existsSync(macResources)) {
    return { resourcesRoot: macResources, platformKey: "darwin-arm64" };
  }

  const winResources = getWinUnpackedResourcesDir();
  if (fs.existsSync(winResources)) {
    return { resourcesRoot: winResources, platformKey: "win32-x64" };
  }

  return null;
}

const layout = resolveResourcesRoot();
assert.ok(layout, "No packaged resources found. Run package:win or package:mac first.");

const profile = resolvePackagingProfile({ platformKey: layout.platformKey });
const resourcesRoot = layout.resourcesRoot;

const chromeExe = resolvePackagedBrowserExecutable(resourcesRoot, profile);
assert.ok(
  chromeExe,
  `Bundled Chrome executable was not found under ${profile.packagedRelativeDir}`,
);

const manifestPath = path.join(
  desktopRoot,
  "staging",
  "puppeteer",
  "chrome",
  profile.chromeBundleDirName,
  "browser-manifest.json",
);

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.platformKey, profile.platformKey);
  assert.match(JSON.stringify(manifest), new RegExp(profile.chromeBundleDirName));
}

console.log(
  JSON.stringify(
    {
      ok: true,
      platformKey: profile.platformKey,
      resourcesRoot,
      chromeExe,
      browserDir: path.dirname(chromeExe),
    },
    null,
    2,
  ),
);
