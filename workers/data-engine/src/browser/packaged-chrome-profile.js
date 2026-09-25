import fs from "node:fs";
import path from "node:path";

/** @typedef {"win32-x64" | "darwin-arm64"} PackagedChromePlatformKey */

/**
 * Authoritative Chrome-for-Testing bundle layout per NEUD packaging target.
 * Used by browser staging, runtime resolution, and package verification.
 */
export const PACKAGED_CHROME_PROFILES = {
  "win32-x64": {
    platformKey: "win32-x64",
    os: "win32",
    arch: "x64",
    chromeBundleDirName: "chrome-win64",
    executableRelativePath: "chrome.exe",
    packagedRelativeDir: "puppeteer/chrome/chrome-win64",
    /** Matches @puppeteer/browsers BrowserPlatform.WIN64 cache folder names. */
    puppeteerCacheFolderPrefix: "win64",
    systemChromeCandidates: (env) => [
      path.join(env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(
        env["PROGRAMFILES(X86)"] || "",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      path.join(env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    ],
  },
  "darwin-arm64": {
    platformKey: "darwin-arm64",
    os: "darwin",
    arch: "arm64",
    chromeBundleDirName: "chrome-mac-arm64",
    executableRelativePath: path.join(
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing",
    ),
    packagedRelativeDir: "puppeteer/chrome/chrome-mac-arm64",
    /** Matches @puppeteer/browsers BrowserPlatform.MAC_ARM cache folder names. */
    puppeteerCacheFolderPrefix: "mac_arm",
    systemChromeCandidates: () => [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      path.join(
        process.env.HOME || "",
        "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ),
    ],
  },
};

/**
 * @param {{ os?: string; arch?: string; platformKey?: PackagedChromePlatformKey }} [options]
 */
export function resolvePackagingProfile(options = {}) {
  if (options.platformKey) {
    const profile = PACKAGED_CHROME_PROFILES[options.platformKey];
    if (!profile) {
      throw new Error(`Unknown packaged Chrome platform key: ${options.platformKey}`);
    }
    return profile;
  }

  const os = options.os ?? process.platform;
  const arch = options.arch ?? process.arch;

  if (os === "win32") {
    return PACKAGED_CHROME_PROFILES["win32-x64"];
  }

  if (os === "darwin") {
    if (arch === "arm64") {
      return PACKAGED_CHROME_PROFILES["darwin-arm64"];
    }
    throw new Error(
      `Unsupported macOS architecture for NEUD v0.3.0 Item 1: ${arch}. Use Apple Silicon (arm64).`,
    );
  }

  throw new Error(`Unsupported NEUD packaged browser platform: ${os}/${arch}`);
}

export function resolvePackagedChromeExecutablePath(bundleRootDir, profile) {
  return path.join(bundleRootDir, profile.executableRelativePath);
}

export function isUsableChromeExecutable(candidate) {
  if (!candidate || typeof candidate !== "string") {
    return false;
  }
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function findCachedChromeBundleDir(cacheDir, buildId, profile) {
  const prefix = profile.puppeteerCacheFolderPrefix;
  const bundleName = profile.chromeBundleDirName;
  const candidates = [
    path.join(cacheDir, "chrome", `${prefix}-${buildId}`, bundleName),
    path.join(cacheDir, "chrome", buildId, bundleName),
  ];

  if (profile.platformKey === "darwin-arm64") {
    candidates.unshift(path.join(cacheDir, "chrome", `mac-arm64-${buildId}`, bundleName));
  }

  for (const candidate of candidates) {
    const executable = resolvePackagedChromeExecutablePath(candidate, profile);
    if (isUsableChromeExecutable(executable)) {
      return candidate;
    }
  }

  return null;
}

export function buildPackagedBrowserSearchPaths(resourcesPath, profile) {
  if (!resourcesPath) {
    return [];
  }

  const rel = profile.packagedRelativeDir;
  const bundleDirName = profile.chromeBundleDirName;
  const dirs = [
    path.join(resourcesPath, rel),
    path.join(resourcesPath, "puppeteer", "chrome", bundleDirName),
    path.join(resourcesPath, "browser", bundleDirName),
    path.join(resourcesPath, "staging", "puppeteer", "chrome", bundleDirName),
    path.join(resourcesPath, "staging", "browser", bundleDirName),
  ];

  const executables = [];
  for (const dir of dirs) {
    executables.push(resolvePackagedChromeExecutablePath(dir, profile));
  }
  return executables;
}

export function resolvePackagedBrowserExecutable(resourcesPath, profile = resolvePackagingProfile()) {
  for (const candidate of buildPackagedBrowserSearchPaths(resourcesPath, profile)) {
    if (isUsableChromeExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getPrimaryPackagedBrowserPath(resourcesPath, profile = resolvePackagingProfile()) {
  const bundleDir = path.join(resourcesPath ?? "", profile.packagedRelativeDir);
  return resolvePackagedChromeExecutablePath(bundleDir, profile);
}

export function sanitizePackagedBrowserDiagnosticPath(executablePath, profile) {
  if (!executablePath) {
    return null;
  }
  const normalized = executablePath.replace(/\\/g, "/");
  const marker = `${profile.packagedRelativeDir}/${profile.executableRelativePath}`.replace(/\\/g, "/");
  const index = normalized.toLowerCase().indexOf(marker.toLowerCase());
  if (index >= 0) {
    return normalized.slice(index + 1);
  }
  return path.basename(executablePath);
}
