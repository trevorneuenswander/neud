import fs from "fs";
import path from "path";
import { app } from "electron";
import { isPackagedDesktopRuntime } from "../lib/packaged-runtime";

let logFilePath: string | null = null;

function getLogFilePath(): string {
  if (!logFilePath) {
    logFilePath = path.join(app.getPath("userData"), "logs", "startup.log");
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  }
  return logFilePath;
}

export function logStartupCheckpoint(message: string, metadata: Record<string, unknown> = {}) {
  if (!isPackagedDesktopRuntime()) {
    return;
  }

  const entry = {
    at: new Date().toISOString(),
    message,
    ...metadata,
  };

  try {
    fs.appendFileSync(getLogFilePath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // ignore logging failures
  }
}

export function logStartupEnvironment() {
  if (!isPackagedDesktopRuntime()) {
    return;
  }

  logStartupCheckpoint("startup.environment", {
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    packaged: isPackagedDesktopRuntime(),
    electronPackagedFlag: app.isPackaged,
    execPath: process.execPath,
    resourcesPath: process.resourcesPath,
    cwd: process.cwd(),
    appPath: app.getAppPath(),
    userData: app.getPath("userData"),
    appAsarExists: fs.existsSync(path.join(process.resourcesPath, "app.asar")),
    stagedNextServerExists: fs.existsSync(
      path.join(process.resourcesPath, "staging", "next", "server.js"),
    ),
    bundledChromeExists: fs.existsSync(
      path.join(
        process.resourcesPath,
        "puppeteer",
        "chrome",
        "chrome-win64",
        "chrome.exe",
      ),
    ),
  });
}

export function logStartupFailure(error: unknown) {
  if (!isPackagedDesktopRuntime()) {
    return;
  }

  logStartupCheckpoint("startup.failure", {
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : String(error),
  });
}

export function logStartupReady(metadata: Record<string, unknown> = {}) {
  if (!isPackagedDesktopRuntime()) {
    return;
  }

  const entry = {
    at: new Date().toISOString(),
    ready: true,
    pid: process.pid,
    version: app.getVersion(),
    ...metadata,
  };

  logStartupCheckpoint("startup.main_window_ready", metadata);

  try {
    const readyPath = path.join(app.getPath("userData"), "logs", "startup-ready.json");
    fs.mkdirSync(path.dirname(readyPath), { recursive: true });
    fs.writeFileSync(readyPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  } catch {
    // ignore logging failures
  }
}
