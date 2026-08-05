import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const workerRoot = path.join(repoRoot, "workers", "data-engine");
const stagingBrowserRoot = path.join(repoRoot, "desktop", "staging", "puppeteer", "chrome", "chrome-win64");
const manifestPath = path.join(repoRoot, "desktop", "staging", "puppeteer", "chrome", "browser-manifest.json");

function readExpectedChromeBuildId() {
  const revisionsPath = require.resolve("puppeteer-core/lib/cjs/puppeteer/revisions.js", {
    paths: [workerRoot],
  });
  const revisionsSource = fs.readFileSync(revisionsPath, "utf8");
  const match = revisionsSource.match(/chrome:\s*'([^']+)'/);
  if (!match) {
    throw new Error("Unable to read expected Chrome build id from puppeteer-core revisions.");
  }
  return match[1];
}

function resolveDefaultPuppeteerCacheDir() {
  return process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), ".cache", "puppeteer");
}

function findCachedChromeWin64Dir(buildId) {
  const cacheDir = resolveDefaultPuppeteerCacheDir();
  const candidates = [
    path.join(cacheDir, "chrome", `win64-${buildId}`, "chrome-win64"),
    path.join(cacheDir, "chrome", buildId, "chrome-win64"),
  ];

  for (const candidate of candidates) {
    const chromeExe = path.join(candidate, "chrome.exe");
    if (fs.existsSync(chromeExe)) {
      return candidate;
    }
  }

  return null;
}

function ensureChromeInstalled(buildId) {
  const existing = findCachedChromeWin64Dir(buildId);
  if (existing) {
    return existing;
  }

  execSync("npx puppeteer browsers install chrome", {
    cwd: workerRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: resolveDefaultPuppeteerCacheDir(),
    },
  });

  const installed = findCachedChromeWin64Dir(buildId);
  if (!installed) {
    throw new Error(
      `Chrome for Testing ${buildId} was not found after browser:install. Expected under ${resolveDefaultPuppeteerCacheDir()}.`,
    );
  }

  return installed;
}

function copyRecursive(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const fromPath = path.join(source, entry.name);
    const toPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

function measureDirectoryBytes(rootDir) {
  let total = 0;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      total += measureDirectoryBytes(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

export function stagePackagedBrowser(options = {}) {
  const expectedBuildId = options.expectedBuildId ?? readExpectedChromeBuildId();
  const sourceDir = ensureChromeInstalled(expectedBuildId);
  const chromeExe = path.join(sourceDir, "chrome.exe");

  if (!fs.existsSync(chromeExe)) {
    throw new Error(`Packaged browser staging source is missing chrome.exe: ${chromeExe}`);
  }

  fs.rmSync(stagingBrowserRoot, { recursive: true, force: true });
  copyRecursive(sourceDir, stagingBrowserRoot);

  const stagedChromeExe = path.join(stagingBrowserRoot, "chrome.exe");
  if (!fs.existsSync(stagedChromeExe)) {
    throw new Error(`Packaged browser staging failed to copy chrome.exe to ${stagingBrowserRoot}`);
  }

  const manifest = {
    browser: "chrome",
    platform: "win64",
    expectedBuildId,
    packagedRelativePath: "puppeteer/chrome/chrome-win64/chrome.exe",
    resourcesRelativePath: "puppeteer/chrome/chrome-win64/chrome.exe",
    stagedAt: new Date().toISOString(),
    stagedBytes: measureDirectoryBytes(stagingBrowserRoot),
    stagedFileCount: fs.readdirSync(stagingBrowserRoot, { recursive: true }).length,
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    expectedBuildId,
    stagingBrowserRoot,
    stagedChromeExe,
    manifest,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = stagePackagedBrowser();
  console.log(
    `Staged Chrome for Testing ${result.expectedBuildId} at ${result.stagingBrowserRoot} (${Math.round(result.manifest.stagedBytes / (1024 * 1024))} MB)`,
  );
}
