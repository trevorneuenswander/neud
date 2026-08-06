import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";

const LOG_FILE_NAME = "update-session.log";

export type UpdateSessionLogEntry = {
  event: string;
  markerFound?: boolean;
  sourceVersion?: string | null;
  targetVersion?: string | null;
  installedVersion?: string | null;
  versionChanged?: boolean;
  logoutPerformed?: boolean;
  markerConsumed?: boolean;
  reason?: string | null;
  operationId?: string | null;
};

function logFilePath(paths: AppPaths): string {
  return path.join(paths.logs, LOG_FILE_NAME);
}

export function appendUpdateSessionLog(
  paths: AppPaths,
  entry: UpdateSessionLogEntry,
): void {
  fs.mkdirSync(paths.logs, { recursive: true });
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...entry,
  });
  fs.appendFileSync(logFilePath(paths), `${line}\n`, "utf8");
}
