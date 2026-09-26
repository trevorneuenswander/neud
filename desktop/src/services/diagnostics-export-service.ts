import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { getDesktopBuildInfo, getCanonicalReleaseVersion } from "../app/release-version";
import type { AppPaths } from "./app-paths";

const execFileAsync = promisify(execFile);

const MAX_LOG_BYTES = 512 * 1024;
const SECRET_KEY_PATTERN =
  /(password|secret|token|refresh|access_token|service_role|apikey|api_key|authorization|cookie)/i;

export type DiagnosticsExportResult =
  | { ok: true; filePath: string; fileName: string }
  | { ok: false; error: string };

function formatExportFileName(now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .slice(0, 19);
  return `NEUD-Diagnostics-${stamp}.zip`;
}

function redactUnknown(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return "[truncated-depth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > 4000) {
      return `${value.slice(0, 4000)}…[truncated]`;
    }
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => redactUnknown(entry, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = redactUnknown(entry, depth + 1);
  }
  return out;
}

function readJsonRedacted(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return redactUnknown(parsed);
  } catch {
    return { error: "unreadable-json", path: path.basename(filePath) };
  }
}

function copyLogTail(sourcePath: string, destPath: string): boolean {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  try {
    const stat = fs.statSync(sourcePath);
    const start = Math.max(0, stat.size - MAX_LOG_BYTES);
    const fd = fs.openSync(sourcePath, "r");
    try {
      const length = stat.size - start;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      fs.writeFileSync(destPath, buffer);
      return true;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function listLogFiles(logsDir: string, maxFiles = 24): string[] {
  if (!fs.existsSync(logsDir)) {
    return [];
  }
  try {
    const entries = fs.readdirSync(logsDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(logsDir, entry.name));
    return files
      .map((filePath) => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, maxFiles)
      .map((entry) => entry.filePath);
  } catch {
    return [];
  }
}

async function createZipArchive(sourceDir: string, zipPath: string): Promise<void> {
  if (process.platform === "win32") {
    const ps = [
      "Compress-Archive",
      "-Path",
      `${sourceDir}\\*`,
      "-DestinationPath",
      zipPath,
      "-Force",
    ];
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", ps.join(" ")], {
      windowsHide: true,
    });
    return;
  }

  await execFileAsync("ditto", ["-c", "-k", "--sequesterRsrc", sourceDir, zipPath]);
}

export async function exportDiagnosticsBundle(paths: AppPaths): Promise<DiagnosticsExportResult> {
  try {
    fs.mkdirSync(paths.exports, { recursive: true });
    const fileName = formatExportFileName();
    const zipPath = path.join(paths.exports, fileName);
    const stagingDir = path.join(
      paths.exports,
      `.staging-diagnostics-${Date.now()}`,
    );

    fs.mkdirSync(stagingDir, { recursive: true });

    const buildInfo = getDesktopBuildInfo();
    const manifest = {
      exportedAt: new Date().toISOString(),
      appVersion: getCanonicalReleaseVersion(),
      buildInfo,
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron ?? null,
      nodeVersion: process.versions.node,
      packaged: app.isPackaged,
      paths: {
        root: paths.root,
        logs: paths.logs,
        data: paths.data,
        exports: paths.exports,
      },
    };

    fs.writeFileSync(
      path.join(stagingDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    const settingsSnapshot = readJsonRedacted(
      path.join(paths.config, "app-settings.json"),
    );
    if (settingsSnapshot != null) {
      fs.writeFileSync(
        path.join(stagingDir, "app-settings.redacted.json"),
        `${JSON.stringify(settingsSnapshot, null, 2)}\n`,
        "utf8",
      );
    }

    const logsOut = path.join(stagingDir, "logs");
    fs.mkdirSync(logsOut, { recursive: true });

    for (const logFile of listLogFiles(paths.logs)) {
      const base = path.basename(logFile);
      copyLogTail(logFile, path.join(logsOut, base));
    }

    const pipelinePath = path.join(paths.logs, "live-display-pipeline.jsonl");
    if (fs.existsSync(pipelinePath)) {
      copyLogTail(pipelinePath, path.join(logsOut, "live-display-pipeline.jsonl"));
    }

    if (fs.existsSync(paths.engineLogs)) {
      const engineOut = path.join(logsOut, "engines");
      fs.mkdirSync(engineOut, { recursive: true });
      for (const logFile of listLogFiles(paths.engineLogs, 12)) {
        copyLogTail(logFile, path.join(engineOut, path.basename(logFile)));
      }
    }

    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    await createZipArchive(stagingDir, zipPath);
    fs.rmSync(stagingDir, { recursive: true, force: true });

    return { ok: true, filePath: zipPath, fileName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
