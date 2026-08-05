#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function resolveUnpackedRoot() {
  const fromEnv = process.env.NEUD_UNPACKED_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  for (const root of findReleaseRoots(desktopRoot)) {
    if (fs.existsSync(path.join(root, "NEUD.exe"))) {
      return root;
    }
  }

  return null;
}

function assertBrowserBundle(resourcesRoot) {
  const candidates = [
    path.join(resourcesRoot, "puppeteer", "chrome", "chrome-win64", "chrome.exe"),
    path.join(resourcesRoot, "browser", "chrome-win64", "chrome.exe"),
  ];

  const chromeExe = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(chromeExe, "Bundled chrome.exe was not found under resources/puppeteer/chrome or resources/browser");

  const browserDir = path.dirname(chromeExe);
  const requiredEntries = ["chrome.exe", "chrome.dll", "resources.pak"];
  for (const entry of requiredEntries) {
    assert.equal(
      fs.existsSync(path.join(browserDir, entry)),
      true,
      `Missing required browser file: ${entry}`,
    );
  }

  const asarPath = path.join(resourcesRoot, "app.asar");
  if (fs.existsSync(asarPath)) {
    const asarContents = fs.readFileSync(asarPath, "utf8");
    assert.doesNotMatch(
      asarContents,
      /"files":\{[^}]*"puppeteer"[^}]*"chrome-win64"/,
    );
  }

  return {
    chromeExe,
    browserDir,
    bytes: fs.readdirSync(browserDir, { recursive: true }).length,
  };
}

const unpackedRoot = resolveUnpackedRoot();
assert.ok(unpackedRoot, "No win-unpacked output found. Run npm run package:win first or set NEUD_UNPACKED_ROOT.");

const resourcesRoot = path.join(unpackedRoot, "resources");
assert.equal(fs.existsSync(resourcesRoot), true, "Missing resources directory in unpacked build");

const browser = assertBrowserBundle(resourcesRoot);
console.log(
  JSON.stringify(
    {
      ok: true,
      unpackedRoot,
      chromeExe: browser.chromeExe,
      browserFileCount: browser.bytes,
    },
    null,
    2,
  ),
);
