import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  findCachedChromeBundleDir,
  isUsableChromeExecutable,
  resolvePackagedChromeExecutablePath,
  resolvePackagingProfile,
} from "../../shared/browser/packaged-chrome-profile.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const workerRoot = path.join(repoRoot, "workers", "data-engine");

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

function ensureChromeInstalled(buildId, profile) {
  const cacheDir = resolveDefaultPuppeteerCacheDir();
  const existing = findCachedChromeBundleDir(cacheDir, buildId, profile);
  if (existing) {
    return existing;
  }

  execSync("npx puppeteer browsers install chrome", {
    cwd: workerRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir,
    },
  });

  const installed = findCachedChromeBundleDir(cacheDir, buildId, profile);
  if (!installed) {
    throw new Error(
      `Chrome for Testing ${buildId} was not found after browser:install. Expected under ${cacheDir} for ${profile.platformKey}.`,
    );
  }

  return installed;
}

function copyRecursive(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    // Preserve Chrome .app framework symlinks; dereferencing breaks macOS bundles.
    verbatimSymlinks: true,
  });
}

function ensureChromeLaunchPermissions(executablePath) {
  if (process.platform !== "darwin" || !executablePath) {
    return;
  }
  try {
    fs.chmodSync(executablePath, 0o755);
  } catch {
    // Best-effort; isUsableChromeExecutable validates the staged binary below.
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
  const profile = resolvePackagingProfile({
    platformKey: options.platformKey,
    os: options.os,
    arch: options.arch,
  });
  const expectedBuildId = options.expectedBuildId ?? readExpectedChromeBuildId();
  const stagingBrowserRoot = path.join(
    repoRoot,
    "desktop",
    "staging",
    "puppeteer",
    "chrome",
    profile.chromeBundleDirName,
  );
  const manifestPath = path.join(stagingBrowserRoot, "browser-manifest.json");

  const sourceDir = ensureChromeInstalled(expectedBuildId, profile);
  const sourceExecutable = resolvePackagedChromeExecutablePath(sourceDir, profile);
  ensureChromeLaunchPermissions(sourceExecutable);

  if (!isUsableChromeExecutable(sourceExecutable)) {
    throw new Error(
      `Packaged browser staging source is missing executable: ${sourceExecutable}`,
    );
  }

  fs.rmSync(stagingBrowserRoot, { recursive: true, force: true });
  copyRecursive(sourceDir, stagingBrowserRoot);

  const stagedExecutable = resolvePackagedChromeExecutablePath(stagingBrowserRoot, profile);
  ensureChromeLaunchPermissions(stagedExecutable);
  if (!isUsableChromeExecutable(stagedExecutable)) {
    throw new Error(
      `Packaged browser staging failed to copy executable to ${stagingBrowserRoot}`,
    );
  }

  const manifest = {
    browser: "chrome",
    platformKey: profile.platformKey,
    os: profile.os,
    arch: profile.arch,
    expectedBuildId,
    chromeBundleDirName: profile.chromeBundleDirName,
    executableRelativePath: profile.executableRelativePath,
    packagedRelativeDir: profile.packagedRelativeDir,
    packagedRelativeExecutable: path
      .join(profile.packagedRelativeDir, profile.executableRelativePath)
      .replace(/\\/g, "/"),
    stagedAt: new Date().toISOString(),
    stagedBytes: measureDirectoryBytes(stagingBrowserRoot),
    stagedFileCount: fs.readdirSync(stagingBrowserRoot, { recursive: true }).length,
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    expectedBuildId,
    profile,
    stagingBrowserRoot,
    stagedExecutable,
    manifest,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = stagePackagedBrowser();
  console.log(
    `Staged Chrome for Testing ${result.expectedBuildId} (${result.profile.platformKey}) at ${result.stagingBrowserRoot} (${Math.round(result.manifest.stagedBytes / (1024 * 1024))} MB)`,
  );
}
