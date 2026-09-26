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
export function resolveRuntimePlatformKey(
  os = process.platform,
  arch = process.arch,
) {
  if (os === "win32") {
    return "win32-x64";
  }

  if (os === "darwin") {
    // NEUD macOS packages are arm64-only; x64 Node (Rosetta) still uses the arm64 bundle.
    if (arch === "arm64" || arch === "x64") {
      return "darwin-arm64";
    }
    throw new Error(
      `Unsupported macOS architecture for NEUD v0.3.0 Item 1: ${arch}. Use Apple Silicon (arm64).`,
    );
  }

  throw new Error(`Unsupported NEUD packaged browser platform: ${os}/${arch}`);
}

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
  const platformKey = resolveRuntimePlatformKey(os, arch);
  return PACKAGED_CHROME_PROFILES[platformKey];
}

export function findPackagedBrowserManifestPath(resourcesPath) {
  if (!resourcesPath) {
    return null;
  }

  const searchRoots = [
    path.join(resourcesPath, "puppeteer", "chrome"),
    path.join(resourcesPath, "staging", "puppeteer", "chrome"),
  ];

  for (const searchRoot of searchRoots) {
    if (!fs.existsSync(searchRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(searchRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = path.join(searchRoot, entry.name, "browser-manifest.json");
      if (fs.existsSync(manifestPath)) {
        return manifestPath;
      }
    }
  }

  return null;
}

export function readPackagedBrowserManifest(resourcesPath) {
  const manifestPath = findPackagedBrowserManifestPath(resourcesPath);
  if (!manifestPath) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

export function resolvePackagingProfileForPackagedRuntime(
  resourcesPath,
  options = {},
) {
  const runtimePlatformKey = resolveRuntimePlatformKey(
    options.os ?? process.platform,
    options.arch ?? process.arch,
  );
  const manifest = readPackagedBrowserManifest(resourcesPath);

  if (manifest?.platformKey) {
    if (manifest.platformKey !== runtimePlatformKey) {
      throw new Error(
        `Packaged browser platform mismatch: runtime ${runtimePlatformKey}, manifest ${manifest.platformKey}`,
      );
    }
    return resolvePackagingProfile({ platformKey: manifest.platformKey });
  }

  return resolvePackagingProfile({
    os: options.os ?? process.platform,
    arch: options.arch ?? process.arch,
  });
}

export function buildPackagedBrowserRuntimeDiagnostic(resourcesPath, options = {}) {
  const runtimePlatform = options.os ?? process.platform;
  const runtimeArch = options.arch ?? process.arch;
  const runtimePlatformKey = resolveRuntimePlatformKey(runtimePlatform, runtimeArch);
  const manifest = readPackagedBrowserManifest(resourcesPath);
  let selectedProfile = null;
  let profileError = null;

  try {
    selectedProfile = resourcesPath
      ? resolvePackagingProfileForPackagedRuntime(resourcesPath, options)
      : resolvePackagingProfile(options);
  } catch (error) {
    profileError = error instanceof Error ? error.message : String(error);
  }

  const expectedExecutable =
    resourcesPath && selectedProfile
      ? getPrimaryPackagedBrowserPath(resourcesPath, selectedProfile)
      : null;

  return {
    runtimePlatform,
    runtimeArch,
    runtimePlatformKey,
    manifestPlatformKey: manifest?.platformKey ?? null,
    manifestBuildId: manifest?.expectedBuildId ?? null,
    selectedProfilePlatformKey: selectedProfile?.platformKey ?? null,
    resourcesRoot: resourcesPath ?? null,
    expectedExecutable,
    expectedExecutableExists: isUsableChromeExecutable(expectedExecutable),
    profileError,
  };
}

export function resolvePackagedChromeExecutablePath(bundleRootDir, profile) {
  return path.join(bundleRootDir, profile.executableRelativePath);
}

export function isUsableChromeExecutable(candidate) {
  if (!candidate || typeof candidate !== "string") {
    return false;
  }
  try {
    const stats = fs.statSync(candidate);
    if (!stats.isFile()) {
      return false;
    }
    if (process.platform === "darwin") {
      fs.accessSync(candidate, fs.constants.X_OK);
    }
    return stats.size > 0;
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
