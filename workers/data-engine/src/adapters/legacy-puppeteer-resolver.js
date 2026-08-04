import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildPuppeteerChildEnv,
  buildPuppeteerLaunchOptions,
  formatBrowserDiagnostics,
  getPuppeteerApi,
  isUsableExecutable,
  normalizePuppeteerEnvironment,
  probeBrowserLaunch,
  resolvePuppeteerBrowser,
} from "../browser/resolve-puppeteer-browser.js";
import { NEUD_LEGACY_SERVER_ROOT } from "../neud-env.js";
import { createRequire } from "node:module";

const moduleRequire = createRequire(import.meta.url);
const ADAPTER_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(ADAPTER_DIR, "../..");
const REPO_ROOT = path.resolve(WORKER_ROOT, "../..");

export {
  buildPuppeteerChildEnv,
  formatBrowserDiagnostics,
  getPuppeteerApi,
  isUsableExecutable,
  normalizePuppeteerEnvironment,
  resolvePuppeteerBrowser,
} from "../browser/resolve-puppeteer-browser.js";

export function resolveWorkerRoot() {
  return WORKER_ROOT;
}

export function resolveLegacyBackupRoot(explicitRoot) {
  const fromEnv = NEUD_LEGACY_SERVER_ROOT();
  if (fromEnv) return path.resolve(fromEnv);
  if (explicitRoot) return path.resolve(explicitRoot);
  return path.resolve(REPO_ROOT, "..", "auction-ticker-BACKUP");
}

export function resolvePuppeteerPackagePath(fromDir) {
  return moduleRequire.resolve("puppeteer/package.json", { paths: [fromDir] });
}

function readPackageVersion(packageJsonPath) {
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return parsed.version ?? "unknown";
}

export async function importPuppeteerFromDir(fromDir) {
  const packageJsonPath = resolvePuppeteerPackagePath(fromDir);
  const packageDir = path.dirname(packageJsonPath);
  const entryPath = path.join(packageDir, "lib/esm/puppeteer/puppeteer.js");
  const module = await import(pathToFileURL(entryPath).href);
  return {
    module,
    packageJsonPath,
    packageVersion: readPackageVersion(packageJsonPath),
  };
}

export async function getPuppeteerExecutable(puppeteerModule) {
  try {
    const resolved = await resolvePuppeteerBrowser({ puppeteerModule });
    return resolved.executablePath ?? null;
  } catch {
    return null;
  }
}

async function probeReferenceBrowserVersion(puppeteerModule, browserExecutable, launchArgs) {
  const launchOptions = buildPuppeteerLaunchOptions(
    browserExecutable ? { executablePath: browserExecutable } : {},
    {
      headless: true,
      args: launchArgs,
    },
  );

  const probe = await probeBrowserLaunch(puppeteerModule, launchOptions);
  return probe.browserVersion ?? null;
}

export async function loadBroadArrowPuppeteer(options = {}) {
  normalizePuppeteerEnvironment();
  const legacyRoot = resolveLegacyBackupRoot(options.legacyRoot);
  const workerRoot = resolveWorkerRoot();
  const launchArgs = options.launchArgs ?? [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
  ];

  let selected = null;
  let workerPackagePath = null;
  let workerPackageVersion = null;
  let referenceRuntimeInfo = null;

  try {
    workerPackagePath = resolvePuppeteerPackagePath(workerRoot);
    workerPackageVersion = readPackageVersion(workerPackagePath);
  } catch {
    workerPackagePath = null;
  }

  if (fs.existsSync(path.join(legacyRoot, "node_modules", "puppeteer"))) {
    const legacyPuppeteer = await importPuppeteerFromDir(legacyRoot);
    const legacyResolved = await resolvePuppeteerBrowser({
      puppeteerModule: legacyPuppeteer.module,
      puppeteerPackagePath: legacyPuppeteer.packageJsonPath,
      puppeteerPackageVersion: legacyPuppeteer.packageVersion,
    });

    referenceRuntimeInfo = {
      puppeteerPackagePath: legacyPuppeteer.packageJsonPath,
      puppeteerPackageVersion: legacyPuppeteer.packageVersion,
      browserExecutable: legacyResolved.executablePath ?? null,
      browserSource: legacyResolved.source ?? null,
      browserVersion: options.skipReferenceBrowserProbe
        ? null
        : await probeReferenceBrowserVersion(
            legacyPuppeteer.module,
            legacyResolved.executablePath,
            launchArgs,
          ),
    };

    selected = legacyPuppeteer;
    selected.sourceRoot = legacyRoot;
    selected.sourceLabel = "legacy-backup";
  } else if (workerPackagePath) {
    selected = await importPuppeteerFromDir(workerRoot);
    selected.sourceRoot = workerRoot;
    selected.sourceLabel = "worker-local";
    const workerResolved = await resolvePuppeteerBrowser({
      puppeteerModule: selected.module,
      puppeteerPackagePath: selected.packageJsonPath,
      puppeteerPackageVersion: selected.packageVersion,
    });
    referenceRuntimeInfo = {
      puppeteerPackagePath: selected.packageJsonPath,
      puppeteerPackageVersion: selected.packageVersion,
      browserExecutable: workerResolved.executablePath ?? null,
      browserSource: workerResolved.source ?? null,
      browserVersion: null,
    };
  } else {
    throw new Error("Unable to resolve a Puppeteer installation for Broad Arrow.");
  }

  const resolvedBrowser = await resolvePuppeteerBrowser({
    puppeteerModule: selected.module,
    puppeteerPackagePath: selected.packageJsonPath,
    puppeteerPackageVersion: selected.packageVersion,
  });

  const packageMatchesReference =
    referenceRuntimeInfo?.puppeteerPackagePath != null &&
    referenceRuntimeInfo.puppeteerPackagePath === selected.packageJsonPath;
  const executableMatchesReference =
    referenceRuntimeInfo?.browserExecutable != null &&
    resolvedBrowser.executablePath != null &&
    referenceRuntimeInfo.browserExecutable === resolvedBrowser.executablePath &&
    isUsableExecutable(resolvedBrowser.executablePath);

  return {
    puppeteer: selected.module,
    referenceRuntimeInfo,
    resolvedBrowser,
    runtimeInfo: {
      nodeVersion: process.version,
      cwd: process.cwd(),
      legacyBackupRoot: legacyRoot,
      puppeteerSource: selected.sourceLabel,
      puppeteerPackagePath: selected.packageJsonPath,
      puppeteerPackageVersion: selected.packageVersion,
      workerPuppeteerPackagePath: workerPackagePath,
      workerPuppeteerPackageVersion: workerPackageVersion,
      referencePuppeteerPackagePath: referenceRuntimeInfo?.puppeteerPackagePath ?? null,
      referencePuppeteerPackageVersion: referenceRuntimeInfo?.puppeteerPackageVersion ?? null,
      referenceBrowserExecutable: referenceRuntimeInfo?.browserExecutable ?? null,
      referenceBrowserVersion: referenceRuntimeInfo?.browserVersion ?? null,
      browserExecutable: resolvedBrowser.executablePath ?? null,
      browserSource: resolvedBrowser.source ?? null,
      browserDiagnostics: formatBrowserDiagnostics(resolvedBrowser.diagnostics),
      legacyPuppeteerPackageMatch: packageMatchesReference,
      legacyBrowserExecutableMatch: executableMatchesReference,
      legacyBrowserVersionMatch: null,
    },
  };
}

export async function readBrowserRuntimeInfo(browser, baseInfo = {}) {
  let browserVersion = null;
  let browserProcessExecutable = baseInfo.browserExecutable ?? null;

  try {
    browserVersion = await browser.version();
  } catch {
    browserVersion = null;
  }

  try {
    const processHandle = browser.process?.();
    browserProcessExecutable = processHandle?.spawnfile ?? browserProcessExecutable;
  } catch {
    // best-effort
  }

  const executableExists = isUsableExecutable(browserProcessExecutable);

  return {
    ...baseInfo,
    browserVersion,
    browserProcessExecutable,
    legacyBrowserExecutableMatch:
      baseInfo.referenceBrowserExecutable != null &&
      executableExists &&
      baseInfo.referenceBrowserExecutable === browserProcessExecutable,
    legacyBrowserVersionMatch:
      baseInfo.referenceBrowserVersion != null &&
      browserVersion != null &&
      baseInfo.referenceBrowserVersion === browserVersion,
  };
}

export function compareRuntimeInfo(referenceInfo, actualInfo) {
  return {
    legacyPuppeteerPackageMatch:
      referenceInfo.puppeteerPackagePath === actualInfo.puppeteerPackagePath,
    legacyBrowserExecutableMatch:
      referenceInfo.browserExecutable != null &&
      actualInfo.browserProcessExecutable != null &&
      isUsableExecutable(actualInfo.browserProcessExecutable) &&
      referenceInfo.browserExecutable === actualInfo.browserProcessExecutable,
    legacyBrowserVersionMatch:
      referenceInfo.browserVersion != null &&
      actualInfo.browserVersion != null &&
      referenceInfo.browserVersion === actualInfo.browserVersion,
  };
}
