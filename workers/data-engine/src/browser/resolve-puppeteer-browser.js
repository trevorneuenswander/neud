import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Browser, getInstalledBrowsers } from "@puppeteer/browsers";
import { NEUD_PACKAGED, NEUD_RESOURCES_PATH } from "../neud-env.js";
import {
  buildPackagedBrowserSearchPaths,
  getPrimaryPackagedBrowserPath,
  isUsableChromeExecutable as isUsableChromeExecutableShared,
  resolvePackagedBrowserExecutable as resolvePackagedBrowserExecutableShared,
  resolvePackagingProfile,
  resolvePackagingProfileForPackagedRuntime,
  readPackagedBrowserManifest,
  resolveRuntimePlatformKey,
  buildPackagedBrowserRuntimeDiagnostic,
  sanitizePackagedBrowserDiagnosticPath,
} from "./packaged-chrome-profile.js";

const require = createRequire(import.meta.url);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const WINDOWS_EDGE_CANDIDATES = [
  path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(
    process.env["PROGRAMFILES(X86)"] || "",
    "Microsoft",
    "Edge",
    "Application",
    "msedge.exe",
  ),
];

export function isUsableExecutable(candidate) {
  return isUsableChromeExecutableShared(candidate);
}

export function getPuppeteerApi(puppeteerModule) {
  return puppeteerModule?.default ?? puppeteerModule;
}

export function tryPuppeteerExecutablePath(puppeteerModule) {
  const api = getPuppeteerApi(puppeteerModule);
  if (!api || typeof api.executablePath !== "function") {
    return null;
  }

  try {
    const candidate = api.executablePath();
    return isUsableExecutable(candidate) ? candidate : candidate ?? null;
  } catch {
    return null;
  }
}

function resolvePuppeteerPackagePath(fromDir) {
  return require.resolve("puppeteer/package.json", { paths: [fromDir] });
}

function readPackageVersion(packageJsonPath) {
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return parsed.version ?? "unknown";
}

function readExpectedChromeBuildId(puppeteerPackagePath) {
  try {
    const revisionsPath = puppeteerPackagePath
      ? require.resolve("puppeteer-core/lib/cjs/puppeteer/revisions.js", {
          paths: [path.dirname(puppeteerPackagePath)],
        })
      : require.resolve("puppeteer-core/lib/cjs/puppeteer/revisions.js");
    const revisionsSource = fs.readFileSync(revisionsPath, "utf8");
    const match = revisionsSource.match(/chrome:\s*'([^']+)'/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isPackagedNeudRuntime() {
  return NEUD_PACKAGED();
}

function resolveActivePackagingProfile(resourcesPath, packagedMode) {
  if (packagedMode && resourcesPath) {
    return resolvePackagingProfileForPackagedRuntime(resourcesPath);
  }
  return resolvePackagingProfile();
}

export function resolvePackagedBrowserExecutable(resourcesPath = NEUD_RESOURCES_PATH()) {
  if (!resourcesPath) {
    return null;
  }

  try {
    const packagedMode = isPackagedNeudRuntime();
    const profile = resolveActivePackagingProfile(resourcesPath, packagedMode);
    return resolvePackagedBrowserExecutableShared(resourcesPath, profile);
  } catch {
    return null;
  }
}

export function categorizeExecutablePath(executablePath, source) {
  if (!executablePath) {
    return "missing";
  }

  if (source === "packaged-bundled") {
    return "packaged-resources";
  }

  if (source === "explicit-override") {
    return "explicit-override";
  }

  if (source === "puppeteer-managed" || source === "puppeteer-browsers-cache") {
    return "puppeteer-cache";
  }

  if (source === "system-chrome" || source === "system-edge") {
    return "system-browser";
  }

  if (/[\\/]browser[\\/]chrome-(win64|mac-arm64)[\\/]/i.test(executablePath)) {
    return "packaged-resources";
  }

  if (/[\\/]\.cache[\\/]puppeteer/i.test(executablePath)) {
    return "puppeteer-cache";
  }

  if (/[\\/]Google[\\/]Chrome[\\/]/i.test(executablePath)) {
    return "system-browser";
  }

  return "other";
}

export function sanitizeDiagnosticPath(executablePath) {
  if (!executablePath || typeof executablePath !== "string") {
    return null;
  }

  const normalized = executablePath.replace(/\\/g, "/");
  const category = categorizeExecutablePath(executablePath, null);

  if (category === "packaged-resources") {
    try {
      const profile = resolvePackagingProfile();
      return (
        sanitizePackagedBrowserDiagnosticPath(executablePath, profile) ??
        path.join(profile.packagedRelativeDir, profile.executableRelativePath).replace(/\\/g, "/")
      );
    } catch {
      return path.basename(executablePath);
    }
  }

  if (category === "puppeteer-cache") {
    return "puppeteer-cache/chrome.exe";
  }

  if (category === "system-browser") {
    if (/chrome\.exe$/i.test(normalized)) {
      return "system/Google/Chrome/Application/chrome.exe";
    }
    if (/msedge\.exe$/i.test(normalized)) {
      return "system/Microsoft/Edge/Application/msedge.exe";
    }
    return "system-browser";
  }

  if (category === "explicit-override") {
    return "explicit-override";
  }

  return path.basename(executablePath);
}

function resolveDefaultCacheDir() {
  return (
    process.env.PUPPETEER_CACHE_DIR ||
    path.join(os.homedir(), ".cache", "puppeteer")
  );
}

function collectExplicitCandidates(options = {}) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    const trimmed = value?.trim?.() ?? value;
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  addCandidate(options.configuredExecutablePath);
  addCandidate(process.env.PUPPETEER_EXECUTABLE_PATH);
  addCandidate(process.env.CHROME_EXECUTABLE_PATH);

  return candidates;
}

function cacheDirShouldBeIgnored(cacheDir) {
  if (!cacheDir) {
    return false;
  }

  if (/cursor-sandbox-cache/i.test(cacheDir)) {
    return true;
  }

  if (/[\\/]Electron[\\/]cache[\\/]puppeteer/i.test(cacheDir)) {
    return true;
  }

  return false;
}

export function normalizePuppeteerEnvironment() {
  if (cacheDirShouldBeIgnored(process.env.PUPPETEER_CACHE_DIR ?? "")) {
    delete process.env.PUPPETEER_CACHE_DIR;
  }

  if (
    process.env.PUPPETEER_EXECUTABLE_PATH &&
    !isUsableExecutable(process.env.PUPPETEER_EXECUTABLE_PATH)
  ) {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  if (
    process.env.CHROME_EXECUTABLE_PATH &&
    !isUsableExecutable(process.env.CHROME_EXECUTABLE_PATH)
  ) {
    delete process.env.CHROME_EXECUTABLE_PATH;
  }
}

export function buildPuppeteerChildEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  if (cacheDirShouldBeIgnored(env.PUPPETEER_CACHE_DIR ?? "")) {
    delete env.PUPPETEER_CACHE_DIR;
  }
  if (env.PUPPETEER_EXECUTABLE_PATH && !isUsableExecutable(env.PUPPETEER_EXECUTABLE_PATH)) {
    delete env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (env.CHROME_EXECUTABLE_PATH && !isUsableExecutable(env.CHROME_EXECUTABLE_PATH)) {
    delete env.CHROME_EXECUTABLE_PATH;
  }
  return env;
}

function withTemporaryEnv(overrides, fn) {
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

async function findInstalledPuppeteerBrowser(cacheDirs) {
  for (const cacheDir of cacheDirs) {
    if (!cacheDir || cacheDirShouldBeIgnored(cacheDir)) {
      continue;
    }

    let installed = [];
    try {
      installed = await getInstalledBrowsers({ cacheDir });
    } catch {
      installed = [];
    }

    const chromeInstalls = installed.filter(
      (entry) => entry.browser === Browser.CHROME && isUsableExecutable(entry.executablePath),
    );

    if (chromeInstalls.length > 0) {
      chromeInstalls.sort((left, right) =>
        right.buildId.localeCompare(left.buildId, undefined, { numeric: true }),
      );
      return {
        executablePath: chromeInstalls[0].executablePath,
        cacheDir,
      };
    }
  }

  return null;
}

function findSystemBrowser(candidates, source) {
  for (const candidate of candidates) {
    if (isUsableExecutable(candidate)) {
      return {
        executablePath: candidate,
        source,
      };
    }
  }
  return null;
}

function buildResolutionFailure(diagnostics) {
  const packagedMode = diagnostics.packagedMode === true;
  const message = packagedMode
    ? [
        "Unable to resolve the bundled Chrome executable for the packaged NEUD application.",
        "Reinstall NEUD or rebuild the desktop installer with Chrome for Testing included.",
        diagnostics.packagedBrowserPathChecked
          ? `Expected packaged browser at: ${diagnostics.packagedBrowserPathChecked}`
          : null,
        diagnostics.firstBrowserFailureStage
          ? `Failure stage: ${diagnostics.firstBrowserFailureStage}`
          : null,
        diagnostics.packagingProfileError
          ? `Profile resolution: ${diagnostics.packagingProfileError}`
          : null,
        diagnostics.manifestPlatformKey && diagnostics.selectedProfilePlatformKey
          ? `Manifest platform: ${diagnostics.manifestPlatformKey}, selected profile: ${diagnostics.selectedProfilePlatformKey}`
          : null,
      ]
    : [
        "Unable to resolve a usable Chrome executable for Puppeteer.",
        "Run `npm run browser:install` from workers/data-engine, or install Google Chrome.",
        diagnostics.rejectedMissingConfiguredExecutable
          ? `Rejected missing configured executable: ${diagnostics.rejectedMissingConfiguredExecutable}`
          : null,
        diagnostics.puppeteerExecutablePathResult
          ? `Puppeteer executablePath returned: ${diagnostics.puppeteerExecutablePathResult}`
          : null,
      ];

  const error = new Error(message.filter(Boolean).join(" "));
  error.diagnostics = diagnostics;
  error.code = "NEUD_BROWSER_EXECUTABLE_MISSING";
  return error;
}

export async function resolvePuppeteerBrowser(options = {}) {
  normalizePuppeteerEnvironment();

  const puppeteerModule = options.puppeteerModule ?? null;
  const puppeteerPackagePath =
    options.puppeteerPackagePath ??
    (options.puppeteerRoot ? resolvePuppeteerPackagePath(options.puppeteerRoot) : null);
  const puppeteerPackageVersion =
    options.puppeteerPackageVersion ??
    (puppeteerPackagePath ? readPackageVersion(puppeteerPackagePath) : null);
  const expectedBrowserVersion = readExpectedChromeBuildId(puppeteerPackagePath);
  const packagedMode = isPackagedNeudRuntime();
  const resourcesPath = NEUD_RESOURCES_PATH() ?? null;
  const runtimeDiagnostic = buildPackagedBrowserRuntimeDiagnostic(resourcesPath);
  let packagingProfile = null;
  let packagingProfileError = runtimeDiagnostic.profileError;
  try {
    packagingProfile = resolveActivePackagingProfile(resourcesPath, packagedMode);
    packagingProfileError = null;
  } catch (error) {
    packagingProfile = null;
    packagingProfileError =
      error instanceof Error ? error.message : String(error);
  }
  const packagedBrowserPathChecked =
    resourcesPath && packagingProfile
      ? getPrimaryPackagedBrowserPath(resourcesPath, packagingProfile)
      : null;
  const packagedBrowserManifest = readPackagedBrowserManifest(resourcesPath);

  const explicitCandidates = collectExplicitCandidates(options);
  const configuredExecutablePath = explicitCandidates[0] ?? null;
  const configuredExecutableExists = explicitCandidates.some((candidate) =>
    isUsableExecutable(candidate),
  );

  const diagnostics = {
    puppeteerVersion: puppeteerPackageVersion,
    puppeteerPackagePath,
    expectedBrowserVersion,
    detectedBrowserVersion: null,
    packagedMode,
    browserExecutablePresent: false,
    browserExecutablePathCategory: "missing",
    browserSource: null,
    firstBrowserFailureStage: null,
    packagedBrowserPathChecked,
    runtimePlatform: runtimeDiagnostic.runtimePlatform,
    runtimeArch: runtimeDiagnostic.runtimeArch,
    runtimePlatformKey: runtimeDiagnostic.runtimePlatformKey,
    manifestPlatformKey:
      packagedBrowserManifest?.platformKey ?? runtimeDiagnostic.manifestPlatformKey,
    selectedProfilePlatformKey:
      packagingProfile?.platformKey ?? runtimeDiagnostic.selectedProfilePlatformKey,
    resourcesRoot: resourcesPath,
    packagingProfileError,
    expectedExecutableExists: runtimeDiagnostic.expectedExecutableExists,
    puppeteerCacheDirSet: Boolean(process.env.PUPPETEER_CACHE_DIR),
    puppeteerCacheDir: process.env.PUPPETEER_CACHE_DIR ?? null,
    configuredExecutableSupplied: explicitCandidates.length > 0,
    configuredExecutablePath,
    configuredExecutableExists,
    rejectedMissingConfiguredExecutable: null,
    attemptingPuppeteerBrowserResolution: false,
    puppeteerExecutablePathResult: null,
    puppeteerExecutableExists: false,
    resolvedBrowserSource: null,
    resolvedExecutablePath: null,
    resolvedExecutableExists: false,
    cacheDir: null,
    browserVersion: null,
    browserLaunchSucceeded: false,
  };

  const packagedExecutable = resolvePackagedBrowserExecutable(resourcesPath);
  if (packagedExecutable) {
    diagnostics.resolvedBrowserSource = "packaged-bundled";
    diagnostics.browserSource = "packaged-bundled";
    diagnostics.resolvedExecutablePath = sanitizeDiagnosticPath(packagedExecutable);
    diagnostics.resolvedExecutableExists = true;
    diagnostics.browserExecutablePresent = true;
    diagnostics.browserExecutablePathCategory = "packaged-resources";
    return {
      executablePath: packagedExecutable,
      source: "packaged-bundled",
      puppeteerVersion: puppeteerPackageVersion,
      browserVersion: expectedBrowserVersion,
      cacheDir: null,
      diagnostics,
    };
  }

  if (packagedMode) {
    diagnostics.firstBrowserFailureStage = "packaged_browser_missing";
    if (packagingProfileError) {
      diagnostics.packagingProfileError = packagingProfileError;
    }
    throw buildResolutionFailure(diagnostics);
  }

  for (const candidate of explicitCandidates) {
    if (isUsableExecutable(candidate)) {
      diagnostics.resolvedBrowserSource = "explicit-override";
      diagnostics.browserSource = "explicit-override";
      diagnostics.resolvedExecutablePath = sanitizeDiagnosticPath(candidate);
      diagnostics.resolvedExecutableExists = true;
      diagnostics.browserExecutablePresent = true;
      diagnostics.browserExecutablePathCategory = "explicit-override";
      return {
        executablePath: candidate,
        source: "explicit-override",
        puppeteerVersion: puppeteerPackageVersion,
        browserVersion: null,
        cacheDir: process.env.PUPPETEER_CACHE_DIR ?? null,
        diagnostics,
      };
    }

    diagnostics.rejectedMissingConfiguredExecutable = candidate;
    diagnostics.configuredExecutableExists = false;
  }

  diagnostics.attemptingPuppeteerBrowserResolution = true;

  if (puppeteerModule) {
    const cleanResolution = withTemporaryEnv(
      {
        PUPPETEER_CACHE_DIR: undefined,
        PUPPETEER_EXECUTABLE_PATH: undefined,
      },
      () => tryPuppeteerExecutablePath(puppeteerModule),
    );

    diagnostics.puppeteerExecutablePathResult = cleanResolution;
    diagnostics.puppeteerExecutableExists = isUsableExecutable(cleanResolution);

    if (isUsableExecutable(cleanResolution)) {
      diagnostics.resolvedBrowserSource = "puppeteer-managed";
      diagnostics.browserSource = "puppeteer-managed";
      diagnostics.resolvedExecutablePath = sanitizeDiagnosticPath(cleanResolution);
      diagnostics.resolvedExecutableExists = true;
      diagnostics.browserExecutablePresent = true;
      diagnostics.browserExecutablePathCategory = "puppeteer-cache";
      diagnostics.cacheDir = resolveDefaultCacheDir();
      return {
        executablePath: cleanResolution,
        source: "puppeteer-managed",
        puppeteerVersion: puppeteerPackageVersion,
        browserVersion: null,
        cacheDir: diagnostics.cacheDir,
        diagnostics,
      };
    }

    const envResolution = tryPuppeteerExecutablePath(puppeteerModule);
    diagnostics.puppeteerExecutablePathResult = envResolution;
    diagnostics.puppeteerExecutableExists = isUsableExecutable(envResolution);

    if (isUsableExecutable(envResolution)) {
      diagnostics.resolvedBrowserSource = "puppeteer-managed";
      diagnostics.browserSource = "puppeteer-managed";
      diagnostics.resolvedExecutablePath = sanitizeDiagnosticPath(envResolution);
      diagnostics.resolvedExecutableExists = true;
      diagnostics.browserExecutablePresent = true;
      diagnostics.browserExecutablePathCategory = "puppeteer-cache";
      diagnostics.cacheDir = process.env.PUPPETEER_CACHE_DIR ?? resolveDefaultCacheDir();
      return {
        executablePath: envResolution,
        source: "puppeteer-managed",
        puppeteerVersion: puppeteerPackageVersion,
        browserVersion: null,
        cacheDir: diagnostics.cacheDir,
        diagnostics,
      };
    }
  }

  diagnostics.firstBrowserFailureStage = diagnostics.firstBrowserFailureStage ?? "puppeteer_cache_missing";

  const cacheDirs = [
    process.env.PUPPETEER_CACHE_DIR,
    resolveDefaultCacheDir(),
    path.join(os.homedir(), ".cache", "puppeteer"),
  ].filter(Boolean);

  const installedBrowser = await findInstalledPuppeteerBrowser(cacheDirs);
  if (installedBrowser) {
    diagnostics.resolvedBrowserSource = "puppeteer-browsers-cache";
    diagnostics.browserSource = "puppeteer-browsers-cache";
    diagnostics.resolvedExecutablePath = sanitizeDiagnosticPath(installedBrowser.executablePath);
    diagnostics.resolvedExecutableExists = true;
    diagnostics.browserExecutablePresent = true;
    diagnostics.browserExecutablePathCategory = "puppeteer-cache";
    diagnostics.cacheDir = installedBrowser.cacheDir;
    return {
      executablePath: installedBrowser.executablePath,
      source: "puppeteer-browsers-cache",
      puppeteerVersion: puppeteerPackageVersion,
      browserVersion: null,
      cacheDir: installedBrowser.cacheDir,
      diagnostics,
    };
  }

  diagnostics.firstBrowserFailureStage = diagnostics.firstBrowserFailureStage ?? "system_browser_fallback";

  const systemChromeCandidates =
    packagingProfile?.systemChromeCandidates?.(process.env) ??
    (process.platform === "win32"
      ? [
          path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
        ]
      : []);

  const systemChrome = findSystemBrowser(systemChromeCandidates, "system-chrome");
  if (systemChrome) {
    diagnostics.resolvedBrowserSource = systemChrome.source;
    diagnostics.browserSource = systemChrome.source;
    diagnostics.resolvedExecutablePath = sanitizeDiagnosticPath(systemChrome.executablePath);
    diagnostics.resolvedExecutableExists = true;
    diagnostics.browserExecutablePresent = true;
    diagnostics.browserExecutablePathCategory = "system-browser";
    return {
      executablePath: systemChrome.executablePath,
      source: systemChrome.source,
      puppeteerVersion: puppeteerPackageVersion,
      browserVersion: null,
      cacheDir: process.env.PUPPETEER_CACHE_DIR ?? null,
      diagnostics,
    };
  }

  const systemEdge =
    process.platform === "win32"
      ? findSystemBrowser(WINDOWS_EDGE_CANDIDATES, "system-edge")
      : null;
  if (systemEdge) {
    diagnostics.resolvedBrowserSource = systemEdge.source;
    diagnostics.browserSource = systemEdge.source;
    diagnostics.resolvedExecutablePath = sanitizeDiagnosticPath(systemEdge.executablePath);
    diagnostics.resolvedExecutableExists = true;
    diagnostics.browserExecutablePresent = true;
    diagnostics.browserExecutablePathCategory = "system-browser";
    return {
      executablePath: systemEdge.executablePath,
      source: systemEdge.source,
      puppeteerVersion: puppeteerPackageVersion,
      browserVersion: null,
      cacheDir: process.env.PUPPETEER_CACHE_DIR ?? null,
      diagnostics,
    };
  }

  diagnostics.firstBrowserFailureStage = "browser_resolution_failed";
  throw buildResolutionFailure(diagnostics);
}

export function buildPuppeteerLaunchOptions(resolvedBrowser, launchOptions = {}) {
  const options = { ...launchOptions };
  if (resolvedBrowser?.executablePath && isUsableExecutable(resolvedBrowser.executablePath)) {
    options.executablePath = resolvedBrowser.executablePath;
  } else {
    delete options.executablePath;
  }
  return options;
}

export async function probeBrowserLaunch(puppeteerModule, launchOptions = {}) {
  const api = getPuppeteerApi(puppeteerModule);
  let browser;

  try {
    browser = await api.launch(launchOptions);
    const browserVersion = await browser.version();
    return {
      browserLaunchSucceeded: true,
      browserVersion,
    };
  } finally {
    try {
      if (browser) {
        await browser.close();
      }
    } catch {
      // best-effort
    }
  }
}

export async function resolveAndLaunchPuppeteerBrowser(options = {}) {
  const resolved = await resolvePuppeteerBrowser(options);
  const launchOptions = buildPuppeteerLaunchOptions(resolved, options.launchOptions ?? {});
  const probe = await probeBrowserLaunch(options.puppeteerModule, launchOptions);

  resolved.diagnostics.browserLaunchSucceeded = probe.browserLaunchSucceeded;
  resolved.diagnostics.browserVersion = probe.browserVersion;
  resolved.diagnostics.detectedBrowserVersion = probe.browserVersion;
  resolved.browserVersion = probe.browserVersion;

  return {
    ...resolved,
    launchOptions,
    probe,
  };
}

export function formatBrowserDiagnostics(diagnostics) {
  return {
    puppeteerVersion: diagnostics.puppeteerVersion ?? null,
    puppeteerPackagePath: diagnostics.puppeteerPackagePath ?? null,
    expectedBrowserVersion: diagnostics.expectedBrowserVersion ?? null,
    detectedBrowserVersion: diagnostics.detectedBrowserVersion ?? diagnostics.browserVersion ?? null,
    packagedMode: diagnostics.packagedMode ? "yes" : "no",
    browserSource: diagnostics.browserSource ?? diagnostics.resolvedBrowserSource ?? null,
    browserExecutablePresent: diagnostics.browserExecutablePresent ? "yes" : "no",
    browserExecutablePathCategory: diagnostics.browserExecutablePathCategory ?? "missing",
    firstBrowserFailureStage: diagnostics.firstBrowserFailureStage ?? null,
    packagedBrowserPathChecked: diagnostics.packagedBrowserPathChecked
      ? sanitizeDiagnosticPath(diagnostics.packagedBrowserPathChecked)
      : null,
    runtimePlatform: diagnostics.runtimePlatform ?? null,
    runtimeArch: diagnostics.runtimeArch ?? null,
    runtimePlatformKey: diagnostics.runtimePlatformKey ?? null,
    manifestPlatformKey: diagnostics.manifestPlatformKey ?? null,
    selectedProfilePlatformKey: diagnostics.selectedProfilePlatformKey ?? null,
    resourcesRoot: diagnostics.resourcesRoot ? "process.resourcesPath" : null,
    packagingProfileError: diagnostics.packagingProfileError ?? null,
    expectedExecutableExists: diagnostics.expectedExecutableExists ? "yes" : "no",
    puppeteerCacheDirSet: diagnostics.puppeteerCacheDirSet ? "yes" : "no",
    puppeteerCacheDir: diagnostics.puppeteerCacheDir ? "puppeteer-cache" : null,
    configuredExecutableSupplied: diagnostics.configuredExecutableSupplied ? "yes" : "no",
    configuredExecutableExists: diagnostics.configuredExecutableExists ? "yes" : "no",
    rejectedMissingConfiguredExecutable:
      diagnostics.rejectedMissingConfiguredExecutable ?? null,
    attemptingPuppeteerBrowserResolution: diagnostics.attemptingPuppeteerBrowserResolution
      ? "yes"
      : "no",
    puppeteerExecutablePathResult: diagnostics.puppeteerExecutablePathResult
      ? sanitizeDiagnosticPath(diagnostics.puppeteerExecutablePathResult)
      : null,
    puppeteerExecutableExists: diagnostics.puppeteerExecutableExists ? "yes" : "no",
    resolvedBrowserSource: diagnostics.resolvedBrowserSource ?? null,
    resolvedExecutablePath: diagnostics.resolvedExecutablePath ?? null,
    resolvedExecutableExists: diagnostics.resolvedExecutableExists ? "yes" : "no",
    browserLaunchSucceeded: diagnostics.browserLaunchSucceeded ? "yes" : "no",
    browserVersion: diagnostics.browserVersion ?? null,
    cacheDir: diagnostics.cacheDir ? "puppeteer-cache" : null,
  };
}
