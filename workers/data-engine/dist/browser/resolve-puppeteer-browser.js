import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Browser, getInstalledBrowsers } from "@puppeteer/browsers";

const require = createRequire(import.meta.url);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const WINDOWS_CHROME_CANDIDATES = [
  path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(
    process.env["PROGRAMFILES(X86)"] || "",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe",
  ),
  path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
];

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
  if (!candidate || typeof candidate !== "string") {
    return false;
  }

  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
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
  const message = [
    "Unable to resolve a usable Chrome executable for Puppeteer.",
    "Run `npm run browser:install` from workers/data-engine, or install Google Chrome.",
    diagnostics.rejectedMissingConfiguredExecutable
      ? `Rejected missing configured executable: ${diagnostics.rejectedMissingConfiguredExecutable}`
      : null,
    diagnostics.puppeteerExecutablePathResult
      ? `Puppeteer executablePath returned: ${diagnostics.puppeteerExecutablePathResult}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const error = new Error(message);
  error.diagnostics = diagnostics;
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

  const explicitCandidates = collectExplicitCandidates(options);
  const configuredExecutablePath = explicitCandidates[0] ?? null;
  const configuredExecutableExists = explicitCandidates.some((candidate) =>
    isUsableExecutable(candidate),
  );

  const diagnostics = {
    puppeteerVersion: puppeteerPackageVersion,
    puppeteerPackagePath,
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

  for (const candidate of explicitCandidates) {
    if (isUsableExecutable(candidate)) {
      diagnostics.resolvedBrowserSource = "explicit-override";
      diagnostics.resolvedExecutablePath = candidate;
      diagnostics.resolvedExecutableExists = true;
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
      diagnostics.resolvedExecutablePath = cleanResolution;
      diagnostics.resolvedExecutableExists = true;
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
      diagnostics.resolvedExecutablePath = envResolution;
      diagnostics.resolvedExecutableExists = true;
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

  const cacheDirs = [
    process.env.PUPPETEER_CACHE_DIR,
    resolveDefaultCacheDir(),
    path.join(os.homedir(), ".cache", "puppeteer"),
  ].filter(Boolean);

  const installedBrowser = await findInstalledPuppeteerBrowser(cacheDirs);
  if (installedBrowser) {
    diagnostics.resolvedBrowserSource = "puppeteer-browsers-cache";
    diagnostics.resolvedExecutablePath = installedBrowser.executablePath;
    diagnostics.resolvedExecutableExists = true;
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

  const systemChrome = findSystemBrowser(WINDOWS_CHROME_CANDIDATES, "system-chrome");
  if (systemChrome) {
    diagnostics.resolvedBrowserSource = systemChrome.source;
    diagnostics.resolvedExecutablePath = systemChrome.executablePath;
    diagnostics.resolvedExecutableExists = true;
    return {
      executablePath: systemChrome.executablePath,
      source: systemChrome.source,
      puppeteerVersion: puppeteerPackageVersion,
      browserVersion: null,
      cacheDir: process.env.PUPPETEER_CACHE_DIR ?? null,
      diagnostics,
    };
  }

  const systemEdge = findSystemBrowser(WINDOWS_EDGE_CANDIDATES, "system-edge");
  if (systemEdge) {
    diagnostics.resolvedBrowserSource = systemEdge.source;
    diagnostics.resolvedExecutablePath = systemEdge.executablePath;
    diagnostics.resolvedExecutableExists = true;
    return {
      executablePath: systemEdge.executablePath,
      source: systemEdge.source,
      puppeteerVersion: puppeteerPackageVersion,
      browserVersion: null,
      cacheDir: process.env.PUPPETEER_CACHE_DIR ?? null,
      diagnostics,
    };
  }

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
    puppeteerCacheDirSet: diagnostics.puppeteerCacheDirSet ? "yes" : "no",
    puppeteerCacheDir: diagnostics.puppeteerCacheDir ?? null,
    configuredExecutableSupplied: diagnostics.configuredExecutableSupplied ? "yes" : "no",
    configuredExecutableExists: diagnostics.configuredExecutableExists ? "yes" : "no",
    rejectedMissingConfiguredExecutable:
      diagnostics.rejectedMissingConfiguredExecutable ?? null,
    attemptingPuppeteerBrowserResolution: diagnostics.attemptingPuppeteerBrowserResolution
      ? "yes"
      : "no",
    puppeteerExecutablePathResult: diagnostics.puppeteerExecutablePathResult ?? null,
    puppeteerExecutableExists: diagnostics.puppeteerExecutableExists ? "yes" : "no",
    resolvedBrowserSource: diagnostics.resolvedBrowserSource ?? null,
    resolvedExecutablePath: diagnostics.resolvedExecutablePath ?? null,
    resolvedExecutableExists: diagnostics.resolvedExecutableExists ? "yes" : "no",
    browserLaunchSucceeded: diagnostics.browserLaunchSucceeded ? "yes" : "no",
    browserVersion: diagnostics.browserVersion ?? null,
    cacheDir: diagnostics.cacheDir ?? null,
  };
}
