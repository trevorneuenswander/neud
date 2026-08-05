import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import { getCanonicalReleaseVersion } from "../app/release-version";
import type { AppPaths } from "./app-paths";
import { resolveBagLotDetailAdapterPath } from "./bag-detail-adapter-path";
import { resolvePuppeteerModule } from "./resolve-puppeteer-module";

export type InstalledBrowserDiagnosticReport = {
  generatedAt: string;
  appVersion: string;
  packaged: boolean;
  resourcesPath: string | null;
  resolvedChromePath: string | null;
  fileExists: boolean;
  fileSizeBytes: number | null;
  chromeDirectoryExists: boolean;
  supportingFilesPresent: {
    chromeDll: boolean;
    resourcesPak: boolean;
    localesDir: boolean;
  };
  directLaunch: {
    attempted: boolean;
    succeeded: boolean;
    exitCode: number | null;
    error: string | null;
    browserVersion: string | null;
  };
  puppeteerLaunch: {
    attempted: boolean;
    succeeded: boolean;
    error: string | null;
    browserVersion: string | null;
    executablePathCategory: string | null;
    browserSource: string | null;
  };
  browserSource: string | null;
};

const DIAGNOSTIC_FILENAME = "installed-browser-diagnostic.json";

function resolvePackagedChromePath(resourcesPath: string | null): string | null {
  if (!resourcesPath) {
    return null;
  }

  const candidates = [
    path.join(resourcesPath, "puppeteer", "chrome", "chrome-win64", "chrome.exe"),
    path.join(resourcesPath, "browser", "chrome-win64", "chrome.exe"),
    path.join(resourcesPath, "staging", "puppeteer", "chrome", "chrome-win64", "chrome.exe"),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

function readChromeFileStats(chromePath: string | null): {
  fileExists: boolean;
  fileSizeBytes: number | null;
  chromeDirectoryExists: boolean;
  supportingFilesPresent: InstalledBrowserDiagnosticReport["supportingFilesPresent"];
} {
  if (!chromePath) {
    return {
      fileExists: false,
      fileSizeBytes: null,
      chromeDirectoryExists: false,
      supportingFilesPresent: {
        chromeDll: false,
        resourcesPak: false,
        localesDir: false,
      },
    };
  }

  try {
    const stats = fs.statSync(chromePath);
    const browserDir = path.dirname(chromePath);
    return {
      fileExists: stats.isFile() && stats.size > 0,
      fileSizeBytes: stats.size,
      chromeDirectoryExists: fs.existsSync(browserDir),
      supportingFilesPresent: {
        chromeDll: fs.existsSync(path.join(browserDir, "chrome.dll")),
        resourcesPak: fs.existsSync(path.join(browserDir, "resources.pak")),
        localesDir: fs.existsSync(path.join(browserDir, "locales")),
      },
    };
  } catch {
    return {
      fileExists: false,
      fileSizeBytes: null,
      chromeDirectoryExists: false,
      supportingFilesPresent: {
        chromeDll: false,
        resourcesPak: false,
        localesDir: false,
      },
    };
  }
}

async function runDirectChromeLaunch(chromePath: string): Promise<{
  succeeded: boolean;
  exitCode: number | null;
  error: string | null;
  browserVersion: string | null;
}> {
  return new Promise((resolve) => {
    const child = spawn(
      chromePath,
      ["--headless=new", "--disable-gpu", "--dump-dom", "about:blank"],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        succeeded: false,
        exitCode: null,
        error: "Direct Chrome launch timed out after 20s.",
        browserVersion: null,
      });
    }, 20_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        succeeded: false,
        exitCode: null,
        error: error.message,
        browserVersion: null,
      });
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      const versionMatch = stderr.match(/Chrome\/([\d.]+)/);
      resolve({
        succeeded: code === 0 && stdout.includes("<html"),
        exitCode: code,
        error:
          code === 0
            ? null
            : `Chrome exited with code ${code ?? "unknown"}${stderr ? `: ${stderr.trim().slice(0, 200)}` : ""}`,
        browserVersion: versionMatch?.[1] ?? null,
      });
    });
  });
}

async function runPuppeteerLaunch(
  paths: AppPaths,
): Promise<InstalledBrowserDiagnosticReport["puppeteerLaunch"]> {
  try {
    const { puppeteer, resolvedBrowser, buildPuppeteerLaunchOptions } =
      await resolvePuppeteerModule(paths, resolveBagLotDetailAdapterPath(paths).workerRoot);
    const resolved = resolvedBrowser as {
      executablePath?: string;
      source?: string;
      diagnostics?: {
        browserSource?: string;
        browserExecutablePathCategory?: string;
      };
    };
    const launchOptions = buildPuppeteerLaunchOptions(resolvedBrowser, {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const browser = (await puppeteer.launch(launchOptions)) as {
      version: () => Promise<string>;
      close: () => Promise<void>;
    };
    const browserVersion = await browser.version();
    await browser.close();
    return {
      attempted: true,
      succeeded: true,
      error: null,
      browserVersion,
      executablePathCategory:
        resolved.diagnostics?.browserExecutablePathCategory ?? null,
      browserSource: resolved.diagnostics?.browserSource ?? resolved.source ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = (error as { diagnostics?: Record<string, unknown> }).diagnostics;
    return {
      attempted: true,
      succeeded: false,
      error: message,
      browserVersion: null,
      executablePathCategory:
        typeof diagnostics?.browserExecutablePathCategory === "string"
          ? diagnostics.browserExecutablePathCategory
          : null,
      browserSource:
        typeof diagnostics?.browserSource === "string"
          ? diagnostics.browserSource
          : null,
    };
  }
}

export async function runInstalledBrowserDiagnostic(
  paths: AppPaths,
): Promise<InstalledBrowserDiagnosticReport> {
  const resourcesPath = app.isPackaged ? process.resourcesPath : null;
  const resolvedChromePath = resolvePackagedChromePath(resourcesPath);
  const fileStats = readChromeFileStats(resolvedChromePath);

  const report: InstalledBrowserDiagnosticReport = {
    generatedAt: new Date().toISOString(),
    appVersion: getCanonicalReleaseVersion(),
    packaged: app.isPackaged,
    resourcesPath,
    resolvedChromePath,
    fileExists: fileStats.fileExists,
    fileSizeBytes: fileStats.fileSizeBytes,
    chromeDirectoryExists: fileStats.chromeDirectoryExists,
    supportingFilesPresent: fileStats.supportingFilesPresent,
    directLaunch: {
      attempted: false,
      succeeded: false,
      exitCode: null,
      error: null,
      browserVersion: null,
    },
    puppeteerLaunch: {
      attempted: false,
      succeeded: false,
      error: null,
      browserVersion: null,
      executablePathCategory: null,
      browserSource: null,
    },
    browserSource: null,
  };

  if (resolvedChromePath && fileStats.fileExists) {
    report.directLaunch.attempted = true;
    const direct = await runDirectChromeLaunch(resolvedChromePath);
    report.directLaunch = {
      attempted: true,
      succeeded: direct.succeeded,
      exitCode: direct.exitCode,
      error: direct.error,
      browserVersion: direct.browserVersion,
    };
  } else if (resolvedChromePath) {
    report.directLaunch = {
      attempted: false,
      succeeded: false,
      exitCode: null,
      error: "Bundled chrome.exe is missing or empty.",
      browserVersion: null,
    };
  } else {
    report.directLaunch.error = app.isPackaged
      ? "No bundled Chrome executable found under process.resourcesPath."
      : "Installed-browser diagnostic skipped direct launch in unpackaged dev mode.";
  }

  if (app.isPackaged || resolvedChromePath) {
    report.puppeteerLaunch = await runPuppeteerLaunch(paths);
    report.browserSource =
      report.puppeteerLaunch.browserSource ??
      (resolvedChromePath ? "packaged-bundled" : null);
  }

  return report;
}

export function writeInstalledBrowserDiagnosticReport(
  paths: AppPaths,
  report: InstalledBrowserDiagnosticReport,
): string {
  const target = path.join(paths.logs, DIAGNOSTIC_FILENAME);
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
  return target;
}

export async function runAndWriteInstalledBrowserDiagnostic(
  paths: AppPaths,
): Promise<string> {
  const report = await runInstalledBrowserDiagnostic(paths);
  return writeInstalledBrowserDiagnosticReport(paths, report);
}
