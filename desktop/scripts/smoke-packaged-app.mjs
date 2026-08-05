#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findReleaseRoots, scanDirectory } from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const workerRoot = path.join(repoRoot, "workers", "data-engine");
const workerDistLocal = path.join(workerRoot, "dist-local");

const unpackedRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : findReleaseRoots(desktopRoot)[0] ?? null;

assert.ok(unpackedRoot, "Pass unpacked root or build with npm run package:win first.");

const resourcesRoot = path.join(unpackedRoot, "resources");
const workerEntry = path.join(resourcesRoot, "staging", "worker", "dist", "index.js");
const chromeCandidates = [
  path.join(resourcesRoot, "puppeteer", "chrome", "chrome-win64", "chrome.exe"),
  path.join(resourcesRoot, "browser", "chrome-win64", "chrome.exe"),
];

const chromeExe = chromeCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(chromeExe, "Bundled chrome.exe missing from packaged resources");
assert.equal(fs.existsSync(workerEntry), true, "Missing packaged worker entry");

if (!fs.existsSync(path.join(workerDistLocal, "browser", "resolve-puppeteer-browser.js"))) {
  execSync("npm run build:local", { cwd: workerRoot, stdio: "inherit" });
}

process.env.NEUD_PACKAGED = "1";
process.env.NEUD_RESOURCES_PATH = resourcesRoot;
delete process.env.PUPPETEER_CACHE_DIR;
delete process.env.PUPPETEER_EXECUTABLE_PATH;
delete process.env.CHROME_EXECUTABLE_PATH;

const resolver = await import(
  pathToFileURL(path.join(workerDistLocal, "browser", "resolve-puppeteer-browser.js")).href,
);
const puppeteerModule = await import(
  pathToFileURL(
    path.join(workerRoot, "node_modules", "puppeteer", "lib", "esm", "puppeteer", "puppeteer.js"),
  ).href,
);

const resolved = await resolver.resolveAndLaunchPuppeteerBrowser({
  puppeteerModule,
  launchOptions: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

assert.equal(resolved.source, "packaged-bundled");
assert.equal(resolved.executablePath, chromeExe);
assert.ok(resolved.probe.browserLaunchSucceeded);
assert.match(resolved.probe.browserVersion ?? "", /Chrome\//);

const cookiesModule = path.join(
  resourcesRoot,
  "staging",
  "next",
  "node_modules",
  "next",
  "dist",
  "compiled",
  "@edge-runtime",
  "cookies",
);
assert.equal(
  fs.existsSync(cookiesModule),
  true,
  "Packaged Next runtime is missing @edge-runtime/cookies",
);

const puppeteerChrome = path.join(resourcesRoot, "puppeteer", "chrome", "chrome-win64");
assert.equal(
  fs.existsSync(puppeteerChrome),
  true,
  "Bundled Chrome must remain outside app.asar",
);
assert.equal(
  fs.existsSync(path.join(resourcesRoot, "assets", "icon.ico")),
  true,
  "Packaged runtime icon missing from extraResources",
);

const scanRoots = [path.join(resourcesRoot, "puppeteer")];
for (const root of scanRoots) {
  if (!fs.existsSync(root)) continue;
  const findings = scanDirectory(root);
  assert.deepEqual(findings, [], `Secret scan findings under ${root}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      packagedRoot: unpackedRoot,
      chromeExe,
      browserVersion: resolved.probe.browserVersion,
      browserSource: resolved.source,
    },
    null,
    2,
  ),
);
