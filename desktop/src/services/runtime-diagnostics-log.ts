import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";

function appendLogLine(logFile: string, message: string): void {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // diagnostics must not break runtime
  }
}

export function appendEngineControlLog(
  paths: AppPaths,
  message: string,
): void {
  appendLogLine(path.join(paths.logs, "engine-control.log"), message);
}

export function appendWorkerSpawnLog(
  paths: AppPaths,
  payload: Record<string, unknown>,
): void {
  const sanitized = JSON.stringify(payload);
  appendLogLine(path.join(paths.logs, "worker-spawn.log"), sanitized);
}

export function appendWorkerRuntimeLog(
  paths: AppPaths,
  stream: "stdout" | "stderr",
  message: string,
): void {
  appendLogLine(
    path.join(paths.logs, "worker-runtime.log"),
    `[${stream}] ${message.trim()}`,
  );
}

export function appendActivitySyncLog(
  paths: AppPaths,
  message: string,
): void {
  appendLogLine(path.join(paths.logs, "activity-sync.log"), message);
}

export function appendDisplaySyncLog(
  paths: AppPaths,
  message: string,
): void {
  appendLogLine(path.join(paths.logs, "display-sync.log"), message);
}

export function appendAuthRefreshLog(
  paths: AppPaths,
  message: string,
): void {
  appendLogLine(path.join(paths.logs, "auth-refresh.log"), message);
}
