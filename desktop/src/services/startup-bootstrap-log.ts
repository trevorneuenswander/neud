import fs from "fs";
import path from "path";
import { app } from "electron";
import { resolveFallbackNeudUserDataRoot } from "../platform/fallback-user-data";

const STARTUP_BOOTSTRAP_FILENAME = "startup-bootstrap.log";

/**
 * Write desktop path diagnostics before any other services initialize.
 * Uses plain fs.writeFileSync and creates userData/logs immediately.
 */
export function writeStartupBootstrapLog(): void {
  let userData = "";
  let logsPath = "";
  let appName = "";

  try {
    appName = app.getName();
    userData = app.getPath("userData");
    try {
      logsPath = app.getPath("logs");
    } catch {
      logsPath = path.join(userData, "logs");
    }
  } catch {
    userData = resolveFallbackNeudUserDataRoot();
    logsPath = path.join(userData, "logs");
    appName = "NEUD";
  }

  const payload = {
    at: new Date().toISOString(),
    appName,
    userData,
    logsPath,
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
    execPath: process.execPath,
    execBase: path.basename(process.execPath),
    platform: process.platform,
    nodeEnv: process.env.NODE_ENV ?? null,
  };

  const targetDir = path.join(userData, "logs");
  const targetFile = path.join(targetDir, STARTUP_BOOTSTRAP_FILENAME);

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    try {
      const fallbackDir = path.join(resolveFallbackNeudUserDataRoot(), "logs");
      fs.mkdirSync(fallbackDir, { recursive: true });
      fs.writeFileSync(
        path.join(fallbackDir, STARTUP_BOOTSTRAP_FILENAME),
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8",
      );
    } catch {
      // bootstrap logging must not throw
    }
  }
}
