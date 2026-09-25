#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { stagePackagedBrowser } from "./stage-packaged-browser.mjs";
import {
  extractAsar,
  findReleaseRoots,
  scanDirectory,
} from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const workerRoot = path.join(repoRoot, "workers", "data-engine");
const workerDistLocal = path.join(workerRoot, "dist-local");

function buildWorkerIfNeeded() {
  if (!fs.existsSync(path.join(workerDistLocal, "browser", "resolve-puppeteer-browser.js"))) {
    execSync("npm run build:local", { cwd: workerRoot, stdio: "inherit" });
  }
}

function buildStagingIfNeeded() {
  const stagedChrome = path.join(
    desktopRoot,
    "staging",
    "puppeteer",
    "chrome",
    "chrome-win64",
    "chrome.exe",
  );
  if (!fs.existsSync(stagedChrome)) {
    execSync("node desktop/scripts/stage-packaged-browser.mjs", {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
}

async function importWorkerResolver() {
  buildWorkerIfNeeded();
  return import(pathToFileURL(path.join(workerDistLocal, "browser", "resolve-puppeteer-browser.js")).href);
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("stage-packaged-browser copies compatible Chrome for Testing into staging", () => {
  const result = stagePackagedBrowser();
  assert.equal(fs.existsSync(result.stagedExecutable), true);
  assert.equal(result.profile.platformKey, "win32-x64");
  assert.match(result.expectedBuildId, /^\d+\.\d+\.\d+\.\d+$/);
  assert.ok(result.manifest.stagedBytes > 50_000_000);
});

test("runtime resolver selects packaged Chrome from resourcesPath", async () => {
  buildStagingIfNeeded();
  const resolver = await importWorkerResolver();
  const resourcesPath = desktopRoot;
  const simulatedPackagedChrome = path.join(
    resourcesPath,
    "staging",
    "puppeteer",
    "chrome",
    "chrome-win64",
    "chrome.exe",
  );
  assert.equal(fs.existsSync(simulatedPackagedChrome), true);

  await withEnv(
    {
      NEUD_PACKAGED: "1",
      NEUD_RESOURCES_PATH: path.join(resourcesPath, "staging"),
      PUPPETEER_EXECUTABLE_PATH: undefined,
      CHROME_EXECUTABLE_PATH: undefined,
      PUPPETEER_CACHE_DIR: undefined,
    },
    async () => {
      const resolved = await resolver.resolvePuppeteerBrowser();
      assert.equal(resolved.source, "packaged-bundled");
      assert.equal(resolved.executablePath, simulatedPackagedChrome);
      assert.equal(resolved.diagnostics.browserExecutablePresent, true);
      assert.equal(resolved.diagnostics.browserExecutablePathCategory, "packaged-resources");
      assert.equal(resolved.diagnostics.packagedMode, true);
      assert.doesNotMatch(resolved.diagnostics.resolvedExecutablePath ?? "", /Users[\\/]/i);
    },
  );
});

test("packaged resolver does not depend on Puppeteer cache or system Chrome", async () => {
  buildStagingIfNeeded();
  const resolver = await importWorkerResolver();

  await withEnv(
    {
      NEUD_PACKAGED: "1",
      NEUD_RESOURCES_PATH: path.join(desktopRoot, "staging"),
      PUPPETEER_CACHE_DIR: path.join(process.env.USERPROFILE ?? "C:\\missing", ".cache", "puppeteer"),
      PUPPETEER_EXECUTABLE_PATH: "C:\\missing\\chrome.exe",
      CHROME_EXECUTABLE_PATH: "C:\\missing\\chrome.exe",
    },
    async () => {
      const resolved = await resolver.resolvePuppeteerBrowser();
      assert.equal(resolved.source, "packaged-bundled");
      assert.match(resolved.executablePath, /puppeteer[\\/]chrome[\\/]chrome-win64[\\/]chrome\.exe$/i);
    },
  );
});

test("missing packaged browser returns actionable error in packaged mode", async () => {
  const resolver = await importWorkerResolver();

  await withEnv(
    {
      NEUD_PACKAGED: "1",
      NEUD_RESOURCES_PATH: path.join(desktopRoot, ".tmp-missing-browser-audit"),
      PUPPETEER_CACHE_DIR: undefined,
      PUPPETEER_EXECUTABLE_PATH: undefined,
      CHROME_EXECUTABLE_PATH: undefined,
    },
    async () => {
      await assert.rejects(
        () => resolver.resolvePuppeteerBrowser(),
        (error) => {
          assert.match(String(error.message), /bundled Chrome executable/i);
          assert.equal(error.code, "NEUD_BROWSER_EXECUTABLE_MISSING");
          assert.equal(error.diagnostics.firstBrowserFailureStage, "packaged_browser_missing");
          return true;
        },
      );
    },
  );
});

test("packaged resolver launches Chrome without network download", async () => {
  buildStagingIfNeeded();
  const resolver = await importWorkerResolver();
  const puppeteerModule = await import(
    pathToFileURL(
      path.join(workerRoot, "node_modules", "puppeteer", "lib", "esm", "puppeteer", "puppeteer.js"),
    ).href,
  );

  await withEnv(
    {
      NEUD_PACKAGED: "1",
      NEUD_RESOURCES_PATH: path.join(desktopRoot, "staging"),
      PUPPETEER_CACHE_DIR: undefined,
      PUPPETEER_EXECUTABLE_PATH: undefined,
      CHROME_EXECUTABLE_PATH: undefined,
    },
    async () => {
      const resolved = await resolver.resolveAndLaunchPuppeteerBrowser({
        puppeteerModule,
        launchOptions: {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        },
      });
      assert.equal(resolved.source, "packaged-bundled");
      assert.equal(resolved.probe.browserLaunchSucceeded, true);
      assert.ok(resolved.probe.browserVersion);
    },
  );
});

test("unpacked packaged app layout includes resources/puppeteer/chrome/chrome.exe when release output exists", async () => {
  buildStagingIfNeeded();

  if (process.env.NEUD_BUILD_RELEASE !== "1") {
    return;
  }

  let releaseRoots = findReleaseRoots(desktopRoot);
  if (releaseRoots.length === 0) {
    execSync("npm run build:desktop", { cwd: repoRoot, stdio: "inherit" });
    execSync("npx electron-builder --win dir --config electron-builder.yml", {
      cwd: desktopRoot,
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    });
    releaseRoots = findReleaseRoots(desktopRoot);
  }

  assert.ok(releaseRoots.length > 0);

  let foundChrome = false;
  for (const root of releaseRoots) {
    const chromeExe = path.join(root, "resources", "puppeteer", "chrome", "chrome-win64", "chrome.exe");
    if (fs.existsSync(chromeExe)) {
      foundChrome = true;
      assert.ok(fs.statSync(chromeExe).size > 1_000_000);
    }
  }

  assert.equal(foundChrome, true, "Expected resources/puppeteer/chrome/chrome-win64/chrome.exe in win-unpacked output");
});

test("installer contents contain no secrets when release output exists", async () => {
  if (process.env.NEUD_BUILD_RELEASE !== "1") {
    return;
  }

  const scanRoots = [];
  for (const root of findReleaseRoots(desktopRoot)) {
    scanRoots.push(path.join(root, "resources", "puppeteer"));
    scanRoots.push(path.join(root, "resources", "browser"));
    scanRoots.push(path.join(root, "resources", "staging", "worker"));
  }

  for (const root of scanRoots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    const findings = scanDirectory(root);
    assert.deepEqual(findings, [], `release scan findings under ${root}: ${JSON.stringify(findings.slice(0, 3), null, 2)}`);
  }
});

test("engine-manager passes packaged browser env vars to workers", () => {
  const source = fs.readFileSync(path.join(desktopRoot, "src", "services", "engine-manager.ts"), "utf8");
  assert.match(source, /NEUD_PACKAGED = "1"/);
  assert.match(source, /NEUD_RESOURCES_PATH = process\.resourcesPath/);
  assert.match(source, /delete env\.PUPPETEER_CACHE_DIR/);
});
